// ===========================================
// API: /api/cron/reconciliar-tp
// POST: Garante que todo lead TP da planilha vire um card no Kanban
//       E reflete mudanças da planilha (nome, região, tag) no CRM.
//
// A planilha TP é fonte de verdade para os leads:
//   - Se lead não existe em dados_cliente → CRIA
//   - Se já existe com tag diferente → ADICIONA tag
//   - Se nome na planilha difere do banco → ATUALIZA nome
//   - Se região na planilha difere do banco → ATUALIZA região
//
// Por quê: o workflow N8N Z-API4.0 pode engolir leads TP por 3 caminhos:
//   1. If1 com operador `object empty` frágil
//   2. `Verificar Tutts` timeout/erro → execução para
//   3. `Buscar em Não Iniciados1` vazio → quebra o Criar contato
//
// Chamada: N8N a cada 15 minutos
//   curl -X POST https://<crm>/api/cron/reconciliar-tp \
//        -H "Authorization: Bearer <CRON_SECRET>"
// ===========================================

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min (Vercel Pro); se estiver no Hobby, 60s

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const CRON_SECRET = process.env.CRON_SECRET || 'tutts-cron-2026';
const PLANILHA_TP_URL =
  'https://docs.google.com/spreadsheets/d/1MOttPq20kzgnTY5Rv_9ocJNsp3ZFad0_xt_M96utES8/export?format=csv&gid=0';

// Processa em lotes pra não travar
const BATCH_SIZE_INSERT = 100;
// Cooldown: não processa linhas mais velhas que isso (evita backfill infinito
// toda vez que o cron roda — depois da 1ª execução bem-sucedida, só reconcilia
// o que entrou recente). Ajuste: null = processa tudo sempre
const DIAS_MAXIMOS_BACKFILL: number | null = null; // null = sem limite

// ============================================================================
// HELPERS
// ============================================================================

function normalizarTel(tel: string): string {
  return (tel || '').replace(/\D/g, '');
}

function gerarVariacoesTel(tel: string): string[] {
  const norm = normalizarTel(tel);
  if (!norm) return [];
  const variacoes = new Set<string>([norm]);
  if (norm.startsWith('55') && norm.length >= 12) variacoes.add(norm.slice(2));
  if (!norm.startsWith('55')) variacoes.add('55' + norm);
  const comDDI = norm.startsWith('55') ? norm : '55' + norm;
  if (comDDI.length === 13) {
    variacoes.add(comDDI.slice(0, 4) + comDDI.slice(5));
    variacoes.add((comDDI.slice(0, 4) + comDDI.slice(5)).slice(2));
  } else if (comDDI.length === 12) {
    variacoes.add(comDDI.slice(0, 4) + '9' + comDDI.slice(4));
    variacoes.add((comDDI.slice(0, 4) + '9' + comDDI.slice(4)).slice(2));
  }
  return Array.from(variacoes);
}

function parseCsvLinha(l: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '"') q = !q;
    else if (c === ',' && !q) {
      out.push(cur.trim());
      cur = '';
    } else if (c !== '\r') cur += c;
  }
  out.push(cur.trim());
  return out;
}

// Data BR (DD/MM/YYYY [HH:MM:SS]) ou ISO → ISO (YYYY-MM-DDTHH:MM:SS)
function parseDataPlanilha(raw: string): string | null {
  if (!raw) return null;
  // DD/MM/YYYY HH:MM:SS
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const ano = m[3].length === 2 ? '20' + m[3] : m[3];
    const mes = m[2].padStart(2, '0');
    const dia = m[1].padStart(2, '0');
    const hora = (m[4] || '00').padStart(2, '0');
    const min = (m[5] || '00').padStart(2, '0');
    const seg = (m[6] || '00').padStart(2, '0');
    return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}`;
  }
  // ISO direto
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    // Garante T separador se não tiver
    if (raw.length === 10) return raw + 'T00:00:00';
    return raw.slice(0, 19).replace(' ', 'T');
  }
  return null;
}

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  // Auth
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token !== CRON_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const iniciado = Date.now();
  const relatorio = {
    planilhaTotal: 0,
    linhasTPValidas: 0,
    linhasForaDoBackfill: 0,
    jaExistiaOK: 0,        // já existe, todos os campos já batem com planilha
    atualizadoTag: 0,      // tag TP foi adicionada
    atualizadoNome: 0,     // nomewpp foi atualizado (valor divergente da planilha)
    atualizadoRegiao: 0,   // regiao foi atualizada (valor divergente da planilha)
    criado: 0,             // novo registro criado em dados_cliente
    semTelefoneValido: 0,  // linha ignorada por telefone ruim
    erros: 0,
    errosDetalhes: [] as string[],
  };

  try {
    const client = supabaseAdmin || supabase;

    // ========================================================================
    // 1. Baixar planilha TP (com cache busting pra pegar edições recentes)
    // ========================================================================
    const cb = Math.floor(Date.now() / 60_000);
    const planilhaUrl = `${PLANILHA_TP_URL}&cachebust=${cb}`;
    const resp = await fetch(planilhaUrl, {
      headers: {
        Accept: 'text/csv',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Planilha TP retornou HTTP ${resp.status}`, relatorio },
        { status: 502 }
      );
    }
    const csv = (await resp.text()).replace(/^\uFEFF/, '');
    const linhas = csv.split('\n');
    if (linhas.length < 2) {
      return NextResponse.json({ error: 'Planilha vazia', relatorio }, { status: 200 });
    }

    // Detectar colunas
    const headers = parseCsvLinha(linhas[0]).map(h =>
      h.replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    );
    const colNome = headers.findIndex(h => h === 'nome');
    const colPhone = headers.findIndex(h => h === 'phone' || h === 'telefone');
    const colTp = headers.findIndex(h => h === 'tp');
    const colData = headers.findIndex(h =>
      h === 'data' || h === 'data cadastro' || h === 'data_cadastro' ||
      h === 'created' || h === 'created at' || h === 'data lead' || h === 'dt' || h === 'cadastro'
    );
    const colRegiao = headers.findIndex(h =>
      h === 'estado ou cidade' || h === 'estado' || h === 'cidade' || h === 'regiao' || h === 'região'
    );

    if (colPhone < 0 || colTp < 0) {
      return NextResponse.json(
        {
          error: 'Colunas essenciais não encontradas na planilha (telefone/phone e tp são obrigatórias)',
          headersEncontrados: headers,
        },
        { status: 400 }
      );
    }

    console.log(
      `[Reconciliar-TP] Headers: ${JSON.stringify(headers)} | cols: nome=${colNome} phone=${colPhone} tp=${colTp} data=${colData} regiao=${colRegiao}`
    );

    relatorio.planilhaTotal = linhas.length - 1;

    // Cutoff opcional de backfill
    const cutoff =
      DIAS_MAXIMOS_BACKFILL != null
        ? new Date(Date.now() - DIAS_MAXIMOS_BACKFILL * 24 * 3600_000)
        : null;

    // ========================================================================
    // 2. Parse e dedup
    // ========================================================================
    type LinhaPlanilha = {
      nome: string;
      telefoneRaw: string;
      telefoneCanonico: string;
      variacoes: string[];
      tag: string;                    // ex: "TP - Recife"
      dataISO: string | null;
      regiao: string | null;
    };
    const linhasParsed: LinhaPlanilha[] = [];
    const telCanonicosVistos = new Set<string>();

    for (let i = 1; i < linhas.length; i++) {
      if (!linhas[i].trim()) continue;
      const vals = parseCsvLinha(linhas[i]);
      const nome = colNome >= 0 ? vals[colNome] : '';
      const telRaw = vals[colPhone];
      const tp = vals[colTp];
      const dataRaw = colData >= 0 ? vals[colData] : '';
      const regiaoRaw = colRegiao >= 0 ? vals[colRegiao] : '';

      if (!telRaw || !tp || !/^TP/i.test(tp)) continue;

      const variacoes = gerarVariacoesTel(telRaw);
      if (variacoes.length === 0) {
        relatorio.semTelefoneValido++;
        continue;
      }
      const telCanonico = variacoes[0];
      relatorio.linhasTPValidas++;

      const dataISO = parseDataPlanilha(dataRaw);

      // Aplica cutoff de backfill se configurado
      if (cutoff && dataISO) {
        const dt = new Date(dataISO);
        if (!isNaN(dt.getTime()) && dt < cutoff) {
          relatorio.linhasForaDoBackfill++;
          continue;
        }
      }

      // Dedup: 1 entrada por telefone canônico (planilha às vezes tem duplicatas)
      if (telCanonicosVistos.has(telCanonico)) continue;
      telCanonicosVistos.add(telCanonico);

      linhasParsed.push({
        nome: (nome || '').trim(),
        telefoneRaw: telRaw,
        telefoneCanonico: telCanonico,
        variacoes,
        tag: tp.trim(),
        dataISO,
        regiao: (regiaoRaw || '').trim() || null,
      });
    }

    console.log(`[Reconciliar-TP] Parse: ${linhasParsed.length} linhas válidas após dedup`);

    if (linhasParsed.length === 0) {
      return NextResponse.json({ ok: true, relatorio, vazio: true }, { status: 200 });
    }

    // ========================================================================
    // 3. Carregar TODOS os leads existentes para índice em memória
    //    Campos: id, telefone (para match), nomewpp/regiao/tags (para reconciliar)
    // ========================================================================
    const { data: leadsExistentes, error: errLeads } = await client
      .from('dados_cliente')
      .select('id, telefone, nomewpp, regiao, tags')
      .limit(100_000);

    if (errLeads) throw new Error(`Falha ao listar leads: ${errLeads.message}`);

    // Índice: qualquer variação de telefone → lead (snapshot dos campos reconciliáveis)
    type LeadSnapshot = { id: number; nomewpp: string | null; regiao: string | null; tags: string[] | null };
    const indiceTel = new Map<string, LeadSnapshot>();
    for (const l of leadsExistentes || []) {
      if (!l.telefone) continue;
      for (const v of gerarVariacoesTel(l.telefone)) {
        if (!indiceTel.has(v)) {
          indiceTel.set(v, {
            id: l.id,
            nomewpp: l.nomewpp || null,
            regiao: l.regiao || null,
            tags: l.tags || null,
          });
        }
      }
    }

    // ========================================================================
    // 4. Separar: quais criar vs. quais atualizar (e quais campos atualizar)
    // ========================================================================
    type UpdatePlan = {
      id: number;
      novasTags?: string[];      // se presente, atualiza tags
      novoNome?: string;          // se presente, atualiza nomewpp
      novaRegiao?: string;        // se presente, atualiza regiao
      addedTag: boolean;          // para estatística
      changedName: boolean;
      changedRegion: boolean;
    };

    const paraCriar: LinhaPlanilha[] = [];
    const paraAtualizar: UpdatePlan[] = [];

    // Normaliza strings para comparação (trim + lowercase + remove acentos)
    const normCompare = (s: string | null | undefined): string =>
      (s || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    for (const linha of linhasParsed) {
      let achou: LeadSnapshot | null = null;
      for (const v of linha.variacoes) {
        const m = indiceTel.get(v);
        if (m) {
          achou = m;
          break;
        }
      }

      if (!achou) {
        paraCriar.push(linha);
        continue;
      }

      // Lead já existe — comparar campo a campo com a planilha
      const tagsAtuais = achou.tags || [];
      const plan: UpdatePlan = {
        id: achou.id,
        addedTag: false,
        changedName: false,
        changedRegion: false,
      };
      let algoMudou = false;

      // Tag TP: adiciona se ainda não tem
      if (!tagsAtuais.includes(linha.tag)) {
        plan.novasTags = [...tagsAtuais, linha.tag];
        plan.addedTag = true;
        algoMudou = true;
      }

      // Nome: atualiza se planilha tem nome E difere do banco (comparação normalizada,
      // evita atualizar só por maiúsculas/acentos)
      if (linha.nome && normCompare(linha.nome) !== normCompare(achou.nomewpp)) {
        plan.novoNome = linha.nome;
        plan.changedName = true;
        algoMudou = true;
      }

      // Região: atualiza se planilha tem região E difere do banco
      if (linha.regiao && normCompare(linha.regiao) !== normCompare(achou.regiao)) {
        plan.novaRegiao = linha.regiao;
        plan.changedRegion = true;
        algoMudou = true;
      }

      if (algoMudou) {
        paraAtualizar.push(plan);
      } else {
        relatorio.jaExistiaOK++;
      }
    }

    console.log(
      `[Reconciliar-TP] Split: ${paraCriar.length} para criar, ${paraAtualizar.length} para atualizar, ${relatorio.jaExistiaOK} já OK`
    );

    // ========================================================================
    // 5. ATUALIZAR leads existentes (1 por 1 para auditoria precisa)
    // ========================================================================
    for (const upd of paraAtualizar) {
      try {
        const updatePayload: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        if (upd.novasTags) updatePayload.tags = upd.novasTags;
        if (upd.novoNome !== undefined) updatePayload.nomewpp = upd.novoNome;
        if (upd.novaRegiao !== undefined) updatePayload.regiao = upd.novaRegiao;

        const { error } = await client
          .from('dados_cliente')
          .update(updatePayload)
          .eq('id', upd.id);

        if (error) throw error;

        if (upd.addedTag) relatorio.atualizadoTag++;
        if (upd.changedName) relatorio.atualizadoNome++;
        if (upd.changedRegion) relatorio.atualizadoRegiao++;
      } catch (e: any) {
        relatorio.erros++;
        if (relatorio.errosDetalhes.length < 10) {
          relatorio.errosDetalhes.push(`update id=${upd.id}: ${e.message}`);
        }
      }
    }

    // ========================================================================
    // 6. CRIAR leads novos (em batches)
    // ========================================================================
    for (let i = 0; i < paraCriar.length; i += BATCH_SIZE_INSERT) {
      const chunk = paraCriar.slice(i, i + BATCH_SIZE_INSERT);
      const rows = chunk.map(linha => ({
        telefone: linha.telefoneRaw,
        nomewpp: linha.nome || `Lead TP ${linha.telefoneCanonico.slice(-4)}`,
        stage: 'novo',
        status: 'ativo',
        iniciado_por: 'lead' as const,
        tags: [linha.tag],
        regiao: linha.regiao,
        origem: 'TP-Planilha',
        atendimento_ia: 'ativa' as const,
        // created_at: preserva data original da planilha pra cair no dia certo
        // do gráfico "Cadastros por Dia" do Analytics
        created_at: linha.dataISO || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      try {
        const { error, data: inseridos } = await client
          .from('dados_cliente')
          .insert(rows)
          .select('id, telefone');

        if (error) throw error;
        relatorio.criado += (inseridos?.length ?? chunk.length);
      } catch (e: any) {
        // Se o batch falhou inteiro, tenta inserir 1 a 1 pra salvar o máximo
        for (const row of rows) {
          try {
            const { error } = await client.from('dados_cliente').insert(row);
            if (error) throw error;
            relatorio.criado++;
          } catch (err: any) {
            relatorio.erros++;
            if (relatorio.errosDetalhes.length < 10) {
              relatorio.errosDetalhes.push(
                `insert tel=${row.telefone}: ${err.message}`
              );
            }
          }
        }
      }
    }

    const duracao = Math.round((Date.now() - iniciado) / 1000);
    console.log(
      `[Reconciliar-TP] Concluído em ${duracao}s | ` +
      `planilha=${relatorio.planilhaTotal} válidas=${relatorio.linhasTPValidas} ` +
      `jaOK=${relatorio.jaExistiaOK} ` +
      `tagAdd=${relatorio.atualizadoTag} nomeUpd=${relatorio.atualizadoNome} regiaoUpd=${relatorio.atualizadoRegiao} ` +
      `criados=${relatorio.criado} erros=${relatorio.erros}`
    );

    return NextResponse.json({ ok: true, duracaoSegundos: duracao, relatorio });
  } catch (e: any) {
    console.error('[Reconciliar-TP] Erro fatal:', e);
    return NextResponse.json(
      { error: e.message, relatorio },
      { status: 500 }
    );
  }
}

// GET: status/teste — retorna apenas relatório vazio (útil para verificar deploy)
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Use POST com header Authorization: Bearer <CRON_SECRET>',
  });
}
