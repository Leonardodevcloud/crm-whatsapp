export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    const client = supabaseAdmin || supabase;
    const { searchParams } = new URL(req.url);

    const regiao = searchParams.get('regiao') || '';
    const hoje = new Date();
    const defaultInicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const defaultFim = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

    const dataInicioStr = searchParams.get('dataInicio') || defaultInicio;
    const dataFimStr = searchParams.get('dataFim') || defaultFim;
    const dataLimiteInicio = new Date(dataInicioStr + 'T00:00:00');
    const dataLimiteFim = new Date(dataFimStr + 'T23:59:59');

    // === Período anterior (mesma duração, deslocado pra trás) ===
    // Ex: filtro 01/04 → 30/04 (30 dias) → anterior = 02/03 → 31/03
    // A duração é calculada em dias exatos.
    const msDia = 24 * 60 * 60 * 1000;
    const duracaoDias = Math.max(1, Math.round((dataLimiteFim.getTime() - dataLimiteInicio.getTime()) / msDia) + 1);
    const dataAntFim = new Date(dataLimiteInicio.getTime() - msDia); // dia anterior ao início
    const dataAntInicio = new Date(dataAntFim.getTime() - (duracaoDias - 1) * msDia);
    const dataAntInicioStr = dataAntInicio.toISOString().slice(0, 10);
    const dataAntFimStr = dataAntFim.toISOString().slice(0, 10);
    const dentroDoPeriodoAnt = (d: string | null | undefined): boolean => {
      if (!d) return false;
      const dia = String(d).split('T')[0];
      return dia >= dataAntInicioStr && dia <= dataAntFimStr;
    };

    console.log(`[Analytics] Filtros: ${dataInicioStr} → ${dataFimStr} | regiao=${regiao || 'todas'}`);
    console.log(`[Analytics] Período anterior (${duracaoDias}d): ${dataAntInicioStr} → ${dataAntFimStr}`);

    // ═══ 1. DADOS BACKEND — buscar TODOS, filtrar localmente ═══
    // Precisamos de 2 filtros diferentes:
    //   Total Cadastros = por data_cadastro (quando se cadastrou)
    //   Ativados = por data_ativacao (quando foi ativado) — bate com planilha
    const params = new URLSearchParams();
    if (regiao) params.set('regiao', regiao);
    params.set('page', '1');
    params.set('limit', '50000');

    const backendResp = await fetch(`${BI_API_URL}/api/crm/leads-captura/?${params}`, {
      headers: { 'Content-Type': 'application/json', ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}) },
    }).then(r => r.json()).catch(e => {
      console.error('[Analytics] Erro backend:', e.message);
      return { success: false, data: [] };
    });

    const todosLeads: any[] = backendResp?.data || [];

    // Filtrar por data_cadastro → Total Cadastros
    const leadsPorCadastro = todosLeads.filter((l: any) => {
      if (!l.data_cadastro) return false;
      const d = l.data_cadastro.split('T')[0];
      return d >= dataInicioStr && d <= dataFimStr;
    });

    // Filtrar ativos por data_ativacao → Ativados (bate com planilha)
    const leadsPorAtivacao = todosLeads.filter((l: any) => {
      if (l.status_api !== 'ativo') return false;
      if (!l.data_ativacao) return false;
      const d = l.data_ativacao.split('T')[0];
      return d >= dataInicioStr && d <= dataFimStr;
    });

    const totalCadastros = leadsPorCadastro.length;
    const totalAtivos = leadsPorAtivacao.length;
    const totalInativos = leadsPorCadastro.filter((l: any) => l.status_api === 'inativo').length;

    console.log(`[Analytics] ${dataInicioStr}→${dataFimStr} | Total todos: ${todosLeads.length} | Cadastros período: ${totalCadastros} | Ativados período: ${totalAtivos}`);

    // ─── Período anterior (cadastros + ativados) ───
    // Também respeita o filtro de região (se houver) — o /api/crm/leads-captura
    // já veio com filtro de região aplicado, então só filtrar por data.
    const leadsPorCadastroAnt = todosLeads.filter((l: any) => dentroDoPeriodoAnt(l.data_cadastro));
    const leadsPorAtivacaoAnt = todosLeads.filter((l: any) =>
      l.status_api === 'ativo' && dentroDoPeriodoAnt(l.data_ativacao)
    );
    const totalCadastrosAnt = leadsPorCadastroAnt.length;
    const totalAtivosAnt = leadsPorAtivacaoAnt.length;

    // ─── Time-to-X: velocidade de conversão ───
    // Para cada lead cadastrado no período que também foi ativado:
    //   dias entre cadastro e ativação.
    // Guardamos todos os deltas pra calcular média, mediana e P75.
    const deltasCadAtiv: number[] = [];
    for (const l of leadsPorCadastro) {
      if (!l.data_ativacao) continue;
      const tCad = new Date(l.data_cadastro).getTime();
      const tAtv = new Date(l.data_ativacao).getTime();
      if (isNaN(tCad) || isNaN(tAtv)) continue;
      const dias = Math.round((tAtv - tCad) / msDia);
      if (dias >= 0 && dias <= 365) deltasCadAtiv.push(dias);
    }
    const estatDias = (arr: number[]) => {
      if (arr.length === 0) return { media: null as number | null, mediana: null as number | null, p75: null as number | null, amostra: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      const media = arr.reduce((s, n) => s + n, 0) / arr.length;
      const mediana = sorted[Math.floor(sorted.length / 2)];
      const p75 = sorted[Math.floor(sorted.length * 0.75)];
      return { media: Math.round(media * 10) / 10, mediana, p75, amostra: arr.length };
    };
    const velocidadeCadAtiv = estatDias(deltasCadAtiv);

    // Set de códigos ativos no período (para cruzar com TP e BI)
    const codsAtivosSet = new Set(leadsPorAtivacao.map((l: any) => String(l.cod)));

    // Ativados por região (filtrado por data_ativacao)
    const ativadosPorRegiao: Record<string, number> = {};
    leadsPorAtivacao.forEach((l: any) => {
      if (l.regiao) ativadosPorRegiao[l.regiao] = (ativadosPorRegiao[l.regiao] || 0) + 1;
    });

    // Não ativados por região
    // Regra única (igual ao KPI): leads cadastrados no período cujo cod NÃO está
    // em codsAtivosSet (ativados no período). Leads sem região vão pra "SEM REGIÃO"
    // pra soma do card bater exato com o KPI.
    const leadsNaoAtivados = leadsPorCadastro.filter(
      (l: any) => !codsAtivosSet.has(String(l.cod))
    );
    const naoAtivadosPorRegiao: Record<string, number> = {};
    leadsNaoAtivados.forEach((l: any) => {
      const reg = (l.regiao && String(l.regiao).trim()) || 'SEM REGIÃO';
      naoAtivadosPorRegiao[reg] = (naoAtivadosPorRegiao[reg] || 0) + 1;
    });

    // Operador (ativados por data_ativacao)
    const ativacoesPorOperador: Record<string, number> = {};
    leadsPorAtivacao.filter((l: any) => l.quem_ativou).forEach((l: any) => {
      ativacoesPorOperador[l.quem_ativou] = (ativacoesPorOperador[l.quem_ativou] || 0) + 1;
    });

    // Cadastros / Ativados por dia — ambos usam as MESMAS chaves de dia
    // (o range completo do período) pra o gráfico não ter "buracos".
    const cadastrosPorDia: Record<string, number> = {};
    const ativadosPorDia: Record<string, number> = {};
    const hojeGrafico = new Date(); hojeGrafico.setHours(23, 59, 59, 999);
    const diaAtual = new Date(dataLimiteInicio);
    const limiteGrafico = dataLimiteFim < hojeGrafico ? dataLimiteFim : hojeGrafico;
    while (diaAtual <= limiteGrafico) {
      const chave = diaAtual.toISOString().split('T')[0];
      cadastrosPorDia[chave] = 0;
      ativadosPorDia[chave] = 0;
      diaAtual.setDate(diaAtual.getDate() + 1);
    }
    leadsPorCadastro.forEach((l: any) => {
      if (l.data_cadastro) {
        const dia = l.data_cadastro.split('T')[0];
        if (cadastrosPorDia[dia] !== undefined) cadastrosPorDia[dia]++;
      }
    });
    leadsPorAtivacao.forEach((l: any) => {
      if (l.data_ativacao) {
        const dia = l.data_ativacao.split('T')[0];
        if (ativadosPorDia[dia] !== undefined) ativadosPorDia[dia]++;
      }
    });

    // ═══ 2. CRM SUPABASE (tags TP) ═══
    // Tags TP ficam em `dados_cliente.tags` após o cron /api/enriquecer rodar.
    // Mas leads recentes podem ainda não ter sido enriquecidos — por isso o
    // analytics também lê a planilha TP ao vivo e mescla os dois universos
    // por telefone. Assim, um lead cadastrado hoje de manhã já aparece como
    // TP no dashboard se estiver na planilha.
    const { data: allLeads } = await client
      .from('dados_cliente')
      .select('id, stage, status, regiao, tags, telefone, created_at, updated_at, ressuscitado_em, vezes_ressuscitado, cod_profissional')
      .limit(50000);

    const leadsCrmNoPeriodo = (allLeads || []).filter(lead => {
      if (!lead.created_at) return false;
      const dt = new Date(lead.created_at);
      if (dt < dataLimiteInicio || dt > dataLimiteFim) return false;
      if (regiao && lead.regiao !== regiao) return false;
      return true;
    });

    // Parser de tags robusto — aceita array JS, JSON string, formato postgres {}, objeto JSON
    const parseTags = (tags: any): string[] => {
      if (!tags) return [];
      if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
      if (typeof tags === 'object') {
        try {
          const vals = Object.values(tags).flat();
          return vals.map((t: any) => String(t).trim()).filter(Boolean);
        } catch { return []; }
      }
      if (typeof tags === 'string') {
        const str = tags.trim();
        if (!str) return [];
        if (str.startsWith('{') && str.endsWith('}')) {
          return str.slice(1, -1).split(',').map(t => t.trim().replace(/^"|"$/g, '')).filter(Boolean);
        }
        if (str.startsWith('[') && str.endsWith(']')) {
          try {
            const arr = JSON.parse(str);
            if (Array.isArray(arr)) return arr.map(t => String(t).trim()).filter(Boolean);
          } catch { /* fallback abaixo */ }
        }
        return [str];
      }
      return [];
    };

    // ─── Planilha TP ao vivo (fallback para leads ainda não enriquecidos) ───
    // Mesma planilha usada pelo /api/enriquecer. Cruzamos por telefone.
    const PLANILHA_TP_URL = 'https://docs.google.com/spreadsheets/d/1MOttPq20kzgnTY5Rv_9ocJNsp3ZFad0_xt_M96utES8/export?format=csv&gid=0';

    const normalizarTel = (tel: string): string => (tel || '').replace(/\D/g, '');
    const gerarVariacoesTel = (tel: string): string[] => {
      const norm = normalizarTel(tel);
      if (!norm) return [];
      const variacoes = new Set<string>([norm]);
      // Sem DDI (55)
      if (norm.startsWith('55') && norm.length >= 12) variacoes.add(norm.slice(2));
      // Com DDI
      if (!norm.startsWith('55')) variacoes.add('55' + norm);
      // Com/sem 9 adicional no celular (formato brasileiro)
      // 558199999999 ↔ 55819999999  | 8199999999 ↔ 819999999
      const comDDI = norm.startsWith('55') ? norm : '55' + norm;
      if (comDDI.length === 13) { // ex: 5581 9 9999 9999 → remover 9 após DDD
        variacoes.add(comDDI.slice(0, 4) + comDDI.slice(5));
        variacoes.add((comDDI.slice(0, 4) + comDDI.slice(5)).slice(2)); // sem DDI
      } else if (comDDI.length === 12) { // ex: 558199999999 → adicionar 9
        variacoes.add(comDDI.slice(0, 4) + '9' + comDDI.slice(4));
        variacoes.add((comDDI.slice(0, 4) + '9' + comDDI.slice(4)).slice(2));
      }
      return Array.from(variacoes);
    };

    // Fingerprint de fallback: últimos 8 dígitos do número.
    // Resolve casos esquisitos que não caem em nenhuma variação:
    // - DDD com "0" na frente: "081..."  (0 prefixo de chamada antigo)
    // - DDI duplo/ausente em planilha velha
    // - Número com dígito a mais ou a menos na ponta
    // - Import copiado com formato regional estranho
    // Colisão teórica: 2 pessoas com últimos 8 dígitos iguais em estados diferentes.
    // Na prática esse risco é irrelevante (chance absurda + planilha TP é pequena).
    const fingerprint8 = (tel: string): string | null => {
      const norm = normalizarTel(tel);
      if (norm.length < 8) return null;
      return norm.slice(-8);
    };

    // Parse CSV básico (lida com aspas e BOM)
    const parseCsvLinha = (l: string): string[] => {
      const out: string[] = []; let cur = ''; let q = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c === '"') q = !q;
        else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; }
        else if (c !== '\r') cur += c;
      }
      out.push(cur.trim());
      return out;
    };

    // Map telefone(variação) → { tag, data?, regiao? }
    const mapaTPPlanilha = new Map<string, { tag: string; dataISO: string | null; regiao: string | null }>();
    // Lista de linhas ÚNICAS da planilha (por primeiro telefone canônico)
    // usada para contar TPs que existem NA PLANILHA mas NÃO no Supabase
    type LinhaTPPlanilha = { telCanonico: string; variacoes: string[]; tag: string; dataISO: string | null; regiao: string | null };
    const linhasPlanilhaTP: LinhaTPPlanilha[] = [];
    const telsCanonicosVistos = new Set<string>(); // dedup por 1ª variação
    try {
      // Cache busting: força Google Sheets a servir versão fresca do CSV.
      // Sem isso, edições recentes na planilha podem demorar 5-15min pra refletir.
      // O cb muda a cada minuto (granularidade fina o bastante pra leituras humanas,
      // mas não tão fina que perca cache edge completamente).
      const cb = Math.floor(Date.now() / 60_000);
      const planilhaUrl = `${PLANILHA_TP_URL}&cachebust=${cb}`;
      const resp = await fetch(planilhaUrl, {
        headers: {
          Accept: 'text/csv',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store', // não cacheia no layer do Next.js/Vercel
      });
      if (resp.ok) {
        const csv = (await resp.text()).replace(/^\uFEFF/, '');
        const linhas = csv.split('\n');
        if (linhas.length >= 2) {
          const headers = parseCsvLinha(linhas[0]).map(h =>
            h.replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
          );
          // Detectar nome da coluna de data (tentativas comuns)
          const colData = headers.findIndex(h =>
            h === 'data' || h === 'data cadastro' || h === 'data_cadastro' || h === 'created' ||
            h === 'created at' || h === 'data lead' || h === 'dt' || h === 'cadastro'
          );
          const colPhone = headers.findIndex(h => h === 'phone' || h === 'telefone');
          const colTp    = headers.findIndex(h => h === 'tp');
          // Coluna de região/estado/cidade (opcional)
          const colRegiao = headers.findIndex(h =>
            h === 'estado ou cidade' || h === 'estado' || h === 'cidade' || h === 'regiao' || h === 'região'
          );

          console.log(`[Analytics] Planilha TP: headers=${JSON.stringify(headers)} | colData=${colData} colPhone=${colPhone} colTp=${colTp} colRegiao=${colRegiao}`);

          for (let i = 1; i < linhas.length; i++) {
            if (!linhas[i].trim()) continue;
            const vals = parseCsvLinha(linhas[i]);
            const tel = colPhone >= 0 ? vals[colPhone] : '';
            const tp  = colTp    >= 0 ? vals[colTp]    : '';
            const dataRaw = colData >= 0 ? vals[colData] : '';
            const regiaoRaw = colRegiao >= 0 ? vals[colRegiao] : '';
            if (!tel || !tp || !/^TP/i.test(tp)) continue;

            // Converter data BR (DD/MM/YYYY) ou ISO (YYYY-MM-DD) para ISO
            let dataISO: string | null = null;
            if (dataRaw) {
              const m = dataRaw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
              if (m) {
                const ano = m[3].length === 2 ? '20' + m[3] : m[3];
                dataISO = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
              } else if (/^\d{4}-\d{2}-\d{2}/.test(dataRaw)) {
                dataISO = dataRaw.slice(0, 10);
              }
            }

            const variacoes = gerarVariacoesTel(tel);
            const telCanonico = variacoes[0] || normalizarTel(tel);

            // Adiciona ao mapa (todas variações)
            for (const v of variacoes) {
              if (!mapaTPPlanilha.has(v)) {
                mapaTPPlanilha.set(v, { tag: tp.trim(), dataISO, regiao: regiaoRaw || null });
              }
            }

            // Adiciona à lista deduplicada (1 entrada por telefone), guardando
            // todas as variações para permitir match com o CRM depois
            if (telCanonico && !telsCanonicosVistos.has(telCanonico)) {
              telsCanonicosVistos.add(telCanonico);
              linhasPlanilhaTP.push({ telCanonico, variacoes, tag: tp.trim(), dataISO, regiao: regiaoRaw || null });
            }
          }
          console.log(`[Analytics] Planilha TP: ${mapaTPPlanilha.size} variações de telefone mapeadas | ${linhasPlanilhaTP.length} registros únicos`);
        }
      } else {
        console.log(`[Analytics] Planilha TP HTTP ${resp.status}`);
      }
    } catch (e: any) {
      console.log(`[Analytics] Planilha TP falhou (usando só banco): ${e.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TP = 100% da planilha no período.
    // - "Leads com Tag TP" = linhas da planilha com `data` no período (dedup por tel)
    // - "TP com Cadastro"  = desses, quantos tem telefone batendo com um lead
    //                        no Supabase que já tem cod_profissional
    // - "TP Ativados"      = desses com cadastro, cod_profissional ∈ codsAtivosSet
    // - "TP por Região"    = agrupado pela coluna "estado ou cidade" da planilha
    // NADA de buscar no Supabase pra contagem do total. A planilha é a verdade.
    // ═══════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // FUNIL TP — todos os cruzamentos respeitam o filtro de período:
    //
    // - "Leads com Tag TP" = linhas da planilha com `data` no período
    // - "TP Cadastrados"   = desses, cujo TELEFONE bate com crm_leads_capturados
    //                         E cuja data_cadastro está no período
    // - "TP Ativados"      = dos cadastrados, cuja data_ativacao está no período
    //                         E status_api = 'ativo'
    // - "TP em Operação"   = dos ativados, com entrega em bi_entregas no período
    //
    // Cruzamento por TELEFONE (normalizado com variações). A aba "Cadastros"
    // do CRM lê crm_leads_capturados, que tem todos os motoboys cadastrados
    // na Mapp — é a fonte de verdade para "cadastrado/ativado".
    // ═══════════════════════════════════════════════════════════════════════

    // 1. Linhas da planilha no período
    const linhasPlanilhaTPPeriodo = linhasPlanilhaTP.filter(r => {
      if (!r.dataISO) return false;
      return r.dataISO >= dataInicioStr && r.dataISO <= dataFimStr;
    });

    // Respeita filtro de região (case-insensitive, substring)
    const linhasPlanilhaFiltradas = regiao
      ? linhasPlanilhaTPPeriodo.filter(r => (r.regiao || '').toLowerCase().includes(regiao.toLowerCase()))
      : linhasPlanilhaTPPeriodo;

    // 2. Índice Telefone → Cadastro em crm_leads_capturados
    //    DOIS índices:
    //    A) exato: todas as variações (DDI/9)
    //    B) fingerprint: últimos 8 dígitos (fallback pra formatos esquisitos)
    type CadastroIndex = {
      cod: string;
      telefone: string | null;
      data_cadastro: string | null;
      data_ativacao: string | null;
      status_api: string | null;
    };
    const indiceTelCadastro = new Map<string, CadastroIndex>();
    const indiceFingerprint = new Map<string, CadastroIndex[]>(); // 1 fingerprint pode ter colisões
    let leadsComTelefoneIndexados = 0;
    const amostrasTelefoneBanco: string[] = [];
    for (const lead of todosLeads) {
      const tel = lead.telefone || lead.celular || '';
      if (!tel) continue;
      leadsComTelefoneIndexados++;
      if (amostrasTelefoneBanco.length < 5) amostrasTelefoneBanco.push(String(tel));
      const snap: CadastroIndex = {
        cod: String(lead.cod),
        telefone: tel,
        data_cadastro: lead.data_cadastro || null,
        data_ativacao: lead.data_ativacao || null,
        status_api: lead.status_api || null,
      };
      for (const v of gerarVariacoesTel(tel)) {
        if (!indiceTelCadastro.has(v)) indiceTelCadastro.set(v, snap);
      }
      const fp = fingerprint8(tel);
      if (fp) {
        const lista = indiceFingerprint.get(fp);
        if (lista) lista.push(snap);
        else indiceFingerprint.set(fp, [snap]);
      }
    }
    console.log(
      `[Analytics] TP índice Cadastros: ${leadsComTelefoneIndexados} leads com telefone | ` +
      `${indiceTelCadastro.size} variações exatas | ${indiceFingerprint.size} fingerprints | ` +
      `amostras (raw): ${JSON.stringify(amostrasTelefoneBanco)}`
    );

    // Amostras de telefones da planilha (debug)
    const amostrasPlanilha = linhasPlanilhaFiltradas.slice(0, 5).map(r => ({
      telCanonico: r.telCanonico,
      variacoes: r.variacoes,
    }));
    console.log(`[Analytics] TP amostras planilha (primeiras 5): ${JSON.stringify(amostrasPlanilha)}`);

    // 3. Para cada linha TP da planilha, tenta casar com cadastro (por telefone).
    //    Ordem de tentativas:
    //      a) Match exato por variação
    //      b) Fallback por fingerprint (últimos 8 dígitos) — se único
    //    Depois aplica cascata do funil (cadastro/ativação no período).
    // Funil TP — 2 versões:
    //   1) "Filtro atual": usa período selecionado (dataInicioStr..dataFimStr) + região
    //   2) "Últimos 3 meses": janela fixa (hoje-90d..hoje), IGNORA filtro de região
    //      (mostra sempre o panorama geral dos últimos 90 dias)
    // Cada versão reusa os MESMOS índices de cadastro (telefone → cadastro),
    // então o match é idêntico — só muda o escopo temporal da planilha e os filtros de data.

    // === Helper de período do filtro (selecionado pelo usuário) ===
    const dentroDoPeriodo = (dataStr: string | null): boolean => {
      if (!dataStr) return false;
      const d = dataStr.split('T')[0];
      return d >= dataInicioStr && d <= dataFimStr;
    };

    // === Janela dos últimos 90 dias ===
    const hoje90 = new Date();
    const inicio90d = new Date(hoje90.getTime() - 90 * 24 * 60 * 60 * 1000);
    const dataInicio90 = inicio90d.toISOString().slice(0, 10);
    const dataFim90 = hoje90.toISOString().slice(0, 10);
    const dentroDe90d = (dataStr: string | null): boolean => {
      if (!dataStr) return false;
      const d = dataStr.split('T')[0];
      return d >= dataInicio90 && d <= dataFim90;
    };

    // === Função helper: monta funil TP dado um subconjunto de linhas da planilha
    //     e um critério de período (usado nos filtros de data_cadastro/ativacao)
    type FunilTPBuild = {
      totalPlanilha: number;
      comCadastro: number;
      ativados: number;
      ativadosItens: Array<{ cod_profissional: string }>; // usado pelo bloco BI
      porRegiao: Record<string, number>;
    };
    const montarFunilTP = (
      linhas: LinhaTPPlanilha[],
      dentroDataRange: (d: string | null) => boolean
    ): FunilTPBuild => {
      // Casar cada linha com um cadastro (exato ou fingerprint único)
      const casados = linhas.map(r => {
        let cad: CadastroIndex | null = null;
        for (const v of (r.variacoes || [r.telCanonico])) {
          const m = indiceTelCadastro.get(v);
          if (m) { cad = m; break; }
        }
        if (!cad) {
          const fp = fingerprint8(r.telCanonico);
          if (fp) {
            const candidatos = indiceFingerprint.get(fp);
            if (candidatos && candidatos.length === 1) cad = candidatos[0];
          }
        }
        return { r, cad };
      });

      const comCad = casados.filter(x => x.cad && dentroDataRange(x.cad.data_cadastro));
      // TP Ativados: status_api='ativo' é o critério principal.
      // Se data_ativacao existir, exige que esteja no período.
      // Se data_ativacao for null/vazio, aceita mesmo assim (alguns leads ativados
      // na Mapp não tiveram data_ativacao gravada — o status é a fonte de verdade).
      const ativ = comCad.filter(x => {
        if (x.cad!.status_api !== 'ativo') return false;
        if (!x.cad!.data_ativacao) return true; // sem data_ativacao → aceita se status='ativo'
        return dentroDataRange(x.cad!.data_ativacao);
      });

      const porRegiao: Record<string, number> = {};
      casados.forEach(x => {
        const reg = (x.r.regiao && String(x.r.regiao).trim()) || 'SEM REGIÃO';
        const key = reg.toUpperCase();
        porRegiao[key] = (porRegiao[key] || 0) + 1;
      });

      return {
        totalPlanilha: casados.length,
        comCadastro: comCad.length,
        ativados: ativ.length,
        ativadosItens: ativ.map(x => ({ cod_profissional: x.cad!.cod })),
        porRegiao,
      };
    };

    // === Versão 1: Filtro atual (linhasPlanilhaFiltradas já respeita período + região)
    const funilAtual = montarFunilTP(linhasPlanilhaFiltradas, dentroDoPeriodo);

    // === Versão 2: Últimos 3 meses (90 dias) — ignora região, usa janela fixa
    const linhas90d = linhasPlanilhaTP.filter(r => r.dataISO && dentroDe90d(r.dataISO));
    const funil90d = montarFunilTP(linhas90d, dentroDe90d);

    console.log(
      `[Analytics] TP funil atual: planilha=${funilAtual.totalPlanilha} comCad=${funilAtual.comCadastro} ativ=${funilAtual.ativados} | ` +
      `TP funil 90d: planilha=${funil90d.totalPlanilha} comCad=${funil90d.comCadastro} ativ=${funil90d.ativados}`
    );

    // Mantém variáveis antigas (o bloco BI abaixo usa leadsTPAtivados)
    const leadsComTP         = { length: funilAtual.totalPlanilha };
    const leadsTPComCadastro = { length: funilAtual.comCadastro };
    const leadsTPAtivados    = funilAtual.ativadosItens;
    const tpPorRegiao        = funilAtual.porRegiao;

    // Mortos/ressuscitados removidos do analytics conforme solicitação
    // (conceitos seguem existindo no kanban, cron de enriquecimento e types)

    const leadsCrmPorDia: Record<string, number> = {};
    Object.keys(cadastrosPorDia).forEach(k => { leadsCrmPorDia[k] = 0; });
    leadsCrmNoPeriodo.forEach(l => { if (l.created_at) { const dia = l.created_at.split('T')[0]; if (leadsCrmPorDia[dia] !== undefined) leadsCrmPorDia[dia]++; } });

    // ═══ 3. BI ═══ (agora passa data_inicio/data_fim pra respeitar filtro do período)
    let emOperacao = 0;
    let emOperacaoAnt = 0;
    let tpEmOperacao = 0;
    let tpEmOperacao90d = 0; // versão "últimos 3 meses" (janela fixa 90d)
    let codsEmOperacaoSet = new Set<string>();
    try {
      const codigosAtivos = leadsPorAtivacao.map((l: any) => String(l.cod)).filter(Boolean);
      const codigosAtivosAnt = leadsPorAtivacaoAnt.map((l: any) => String(l.cod)).filter(Boolean);
      // Códigos dos TP Ativados em AMBAS as versões (pra medir operação)
      const codsTPAtivosAtuais = funilAtual.ativadosItens.map(i => i.cod_profissional).filter(Boolean);
      const codsTPAtivos90d    = funil90d.ativadosItens.map(i => i.cod_profissional).filter(Boolean);

      // UNIÃO: consulta operação para conversão + TP atual. Crucial pra quando
      // um TP Ativado tem status='ativo' mas data_ativacao=null → ele não está
      // em leadsPorAtivacao (que exige data_ativacao no período), mas PODE estar
      // rodando em bi_entregas. Sem essa união, ele nunca entra em tpEmOperacao.
      const codigosParaVerificarAtual = Array.from(new Set([...codigosAtivos, ...codsTPAtivosAtuais]));

      if (codigosParaVerificarAtual.length > 0) {
        const biResult = await fetch(`${BI_API_URL}/api/crm/verificar-operacao`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}) },
          // Intervalo fixo: conta entregas dentro do período selecionado no filtro
          body: JSON.stringify({ codigos: codigosParaVerificarAtual, data_inicio: dataInicioStr, data_fim: dataFimStr }),
        }).then(r => r.json()).catch(() => null);

        if (biResult?.resultado) {
          codsEmOperacaoSet = new Set(biResult.resultado.filter((r: any) => r.em_operacao).map((r: any) => String(r.cod_profissional)));

          // "emOperacao" do funil de conversão só conta códigos que estão em leadsPorAtivacao
          // (manter compat: o KPI principal só considera ativados tradicionais).
          const setAtivadosConv = new Set(codigosAtivos);
          emOperacao = Array.from(codsEmOperacaoSet).filter(c => setAtivadosConv.has(c)).length;

          // "tpEmOperacao" conta códigos que são TP Ativados (inclusive sem data_ativacao)
          const codsTPAtivados = new Set<string>(leadsTPAtivados.map((l: any) => String(l.cod_profissional)));
          tpEmOperacao = Array.from(codsTPAtivados).filter(c => codsEmOperacaoSet.has(c)).length;
        }
      }

      // TP em Operação — VERSÃO 90 DIAS (janela fixa independente do filtro)
      if (codsTPAtivos90d.length > 0) {
        const bi90 = await fetch(`${BI_API_URL}/api/crm/verificar-operacao`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}) },
          body: JSON.stringify({ codigos: codsTPAtivos90d, data_inicio: dataInicio90, data_fim: dataFim90 }),
        }).then(r => r.json()).catch(() => null);
        if (bi90?.resultado) {
          const setOp90 = new Set(bi90.resultado.filter((r: any) => r.em_operacao).map((r: any) => String(r.cod_profissional)));
          const setTP90 = new Set<string>(codsTPAtivos90d);
          tpEmOperacao90d = Array.from(setTP90).filter((c: string) => setOp90.has(c)).length;
        }
      }

      // Em Operação — PERÍODO ANTERIOR (pra delta vs KPI principal)
      if (codigosAtivosAnt.length > 0) {
        const biAnt = await fetch(`${BI_API_URL}/api/crm/verificar-operacao`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}) },
          body: JSON.stringify({ codigos: codigosAtivosAnt, data_inicio: dataAntInicioStr, data_fim: dataAntFimStr }),
        }).then(r => r.json()).catch(() => null);
        if (biAnt?.resultado) {
          const setOpAnt = new Set<string>(biAnt.resultado.filter((r: any) => r.em_operacao).map((r: any) => String(r.cod_profissional)));
          const setAtivAnt = new Set<string>(codigosAtivosAnt);
          emOperacaoAnt = Array.from(setOpAnt).filter((c: string) => setAtivAnt.has(c)).length;
        }
      }
    } catch (err: any) { console.error('[Analytics] Erro BI:', err.message); }

    // ═══ 4. ALOCAÇÕES (mesmo período) ═══
    // FIX: antes tinha `importado=false`, o que excluía todas as alocações
    // importadas da Google Sheet — o KPI só contava alocações criadas pela UI.
    // Agora conta TODAS (manuais + importadas) para bater com a realidade.
    let totalAlocados = 0;
    let totalAlocadosAnt = 0;
    let alocacoesPorOperador: Record<string, number> = {};
    const alocacoesPorDia: Record<string, number> = {};
    // Pré-zerar todas as chaves de dia do período (mesma janela de cadastros/ativados)
    Object.keys(cadastrosPorDia).forEach(k => { alocacoesPorDia[k] = 0; });
    try {
      const alocResp = await fetch(`${BI_API_URL}/api/crm/alocacao?limit=50000&todos=true`, {
        headers: { 'Content-Type': 'application/json', ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}) },
      }).then(r => r.json()).catch(() => ({ success: false, data: [] }));

      const todasAlocacoes: any[] = alocResp?.data || [];

      // Filtrar alocações pelo período — usa DATA PREVISTA (quando foi planejada
      // a operação) com fallback pra created_at caso a alocação antiga não tenha
      // data_prevista preenchida.
      const alocacoesPeriodo = todasAlocacoes.filter((a: any) => {
        const fonte = a.data_prevista || a.created_at;
        if (!fonte) return false;
        const d = String(fonte).split('T')[0];
        if (d < dataInicioStr || d > dataFimStr) return false;
        return true;
      });

      // Período ANTERIOR — mesma regra de data_prevista + fallback
      const alocacoesAnt = todasAlocacoes.filter((a: any) => {
        const fonte = a.data_prevista || a.created_at;
        return dentroDoPeriodoAnt(fonte);
      });
      totalAlocadosAnt = alocacoesAnt.length;

      totalAlocados = alocacoesPeriodo.length;

      // Agrupar por quem_alocou E por dia (pro gráfico)
      alocacoesPeriodo.forEach((a: any) => {
        const op = a.quem_alocou || 'N/I';
        alocacoesPorOperador[op] = (alocacoesPorOperador[op] || 0) + 1;
        const fonte = a.data_prevista || a.created_at;
        if (fonte) {
          const dia = String(fonte).split('T')[0];
          if (alocacoesPorDia[dia] !== undefined) alocacoesPorDia[dia]++;
        }
      });

      console.log(`[Analytics] Alocações período (por data_prevista): ${totalAlocados} de ${todasAlocacoes.length} total`);
    } catch (err: any) { console.error('[Analytics] Erro alocações:', err.message); }

    // ═══ RESPOSTA ═══
    // naoAtivados = exatamente os mesmos leads do card "Não Ativados por Região".
    // Antes era `totalCadastros − totalAtivos`, o que podia dar número diferente
    // quando um lead cadastrado em outro período era ativado nesse mês
    // (ele entrava em totalAtivos mas não em totalCadastros → subtração errada).
    const naoAtivados = leadsNaoAtivados.length;
    const taxaConversao = totalCadastros > 0 ? Math.round(((totalCadastros - naoAtivados) / totalCadastros) * 100) : 0;
    // Em Operação % baseado nos ATIVADOS (não no total)
    const taxaOperacao = totalAtivos > 0 ? Math.round((emOperacao / totalAtivos) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        kpis: { totalCadastros, totalAtivos, totalAlocados, totalInativos, naoAtivados, emOperacao, naoOperando: totalAtivos - emOperacao, taxaConversao, taxaOperacao },

        // Período anterior (mesma duração, deslocado pra trás) — pra calcular
        // variação de cada KPI. O frontend calcula %Δ localmente.
        periodoAnterior: {
          dataInicio: dataAntInicioStr,
          dataFim: dataAntFimStr,
          duracaoDias,
          totalCadastros: totalCadastrosAnt,
          totalAtivos: totalAtivosAnt,
          totalAlocados: totalAlocadosAnt,
          emOperacao: emOperacaoAnt,
        },

        // Time-to-X — velocidade de conversão. Só cadastro→ativação por enquanto
        // (ativação→alocação exigiria join com crm_alocacoes no frontend;
        // ativação→primeira entrega exigiria mais queries ao backend).
        velocidade: {
          cadastroAtivacao: velocidadeCadAtiv, // { media, mediana, p75, amostra }
        },
        funil: [
          // FIX: todas as etapas agora são comparadas contra Total Cadastros
          // (antes: Alocados/Em Operação comparavam contra Ativados, dando %
          // baixas que não faziam sentido como "funil de conversão completo")
          { stage: 'Total Cadastros', quantidade: totalCadastros, cor: '#6366F1', base: totalCadastros },
          { stage: 'Ativados', quantidade: totalAtivos, cor: '#22C55E', base: totalCadastros },
          { stage: 'Alocados', quantidade: totalAlocados, cor: '#8B5CF6', base: totalCadastros },
          { stage: 'Em Operação', quantidade: emOperacao, cor: '#3B82F6', base: totalCadastros },
        ],
        funilTP: [
          // Todas as etapas usam o topo (Leads com Tag TP) como base,
          // mostrando a taxa de conversão em relação ao universo TOTAL de leads TP.
          { stage: 'Leads com Tag TP', quantidade: leadsComTP.length, cor: '#8B5CF6', base: leadsComTP.length || 1 },
          { stage: 'TP com Cadastro', quantidade: leadsTPComCadastro.length, cor: '#F59E0B', base: leadsComTP.length || 1 },
          { stage: 'TP Ativados',     quantidade: leadsTPAtivados.length,    cor: '#22C55E', base: leadsComTP.length || 1 },
          { stage: 'TP em Operação',  quantidade: tpEmOperacao,               cor: '#10B981', base: leadsComTP.length || 1 },
        ],
        // Versão alternativa: últimos 90 dias corridos (janela fixa hoje-90d..hoje)
        // Ignora filtro de data e região selecionados pelo usuário
        funilTP90d: [
          { stage: 'Leads com Tag TP', quantidade: funil90d.totalPlanilha, cor: '#8B5CF6', base: funil90d.totalPlanilha || 1 },
          { stage: 'TP com Cadastro',  quantidade: funil90d.comCadastro,    cor: '#F59E0B', base: funil90d.totalPlanilha || 1 },
          { stage: 'TP Ativados',      quantidade: funil90d.ativados,       cor: '#22C55E', base: funil90d.totalPlanilha || 1 },
          { stage: 'TP em Operação',   quantidade: tpEmOperacao90d,          cor: '#10B981', base: funil90d.totalPlanilha || 1 },
        ],
        funilTP90dMeta: {
          dataInicio: dataInicio90,
          dataFim: dataFim90,
          janela: 'últimos 90 dias corridos',
        },
        conversaoOperacao: { leadsAtivados: totalAtivos, emOperacao, naoOperando: totalAtivos - emOperacao, taxaReal: taxaOperacao },
        porRegiao: Object.entries(ativadosPorRegiao).map(([r, q]) => ({ regiao: r, quantidade: q })).sort((a, b) => b.quantidade - a.quantidade),
        naoAtivadosPorRegiao: Object.entries(naoAtivadosPorRegiao).map(([r, q]) => ({ regiao: r, quantidade: q })).sort((a, b) => b.quantidade - a.quantidade),
        tpPorRegiao: Object.entries(tpPorRegiao).map(([r, q]) => ({ regiao: r, quantidade: q })).sort((a, b) => b.quantidade - a.quantidade),
        porOperador: Object.entries(ativacoesPorOperador).map(([o, q]) => ({ operador: o, quantidade: q })).sort((a, b) => b.quantidade - a.quantidade),
        porOperadorAlocacao: Object.entries(alocacoesPorOperador).map(([o, q]) => ({ operador: o, quantidade: q })).sort((a, b) => b.quantidade - a.quantidade),
        porDia: Object.keys(cadastrosPorDia).map(data => ({
          data,
          cadastros: cadastrosPorDia[data] || 0,
          ativados: ativadosPorDia[data] || 0,
          alocacoes: alocacoesPorDia[data] || 0,
        })),
        filtros: { dataInicio: dataInicioStr, dataFim: dataFimStr, regiao: regiao || 'Todas' },
      },
    });
  } catch (error: any) {
    console.error('Erro analytics:', error);
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}
