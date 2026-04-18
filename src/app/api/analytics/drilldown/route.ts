// ===========================================
// API: /api/analytics/drilldown
// POST: retorna a lista completa de leads de uma etapa específica
//       dos funis (Conversão ou Tráfego Pago), respeitando o filtro
//       de período e região selecionado no Analytics.
//
// Body: {
//   funil: 'conversao' | 'tp',
//   stage: 'Total Cadastros' | 'Ativados' | 'Alocados' | 'Em Operação' |
//          'Leads com Tag TP' | 'TP com Cadastro' | 'TP Ativados' | 'TP em Operação',
//   dataInicio: 'YYYY-MM-DD',
//   dataFim:    'YYYY-MM-DD',
//   regiao?:    string
// }
//
// Retorno: { stage, total, leads: Array<LeadCompleto> }
// ===========================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';
const PLANILHA_TP_URL =
  'https://docs.google.com/spreadsheets/d/1MOttPq20kzgnTY5Rv_9ocJNsp3ZFad0_xt_M96utES8/export?format=csv&gid=0';

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
function fingerprint8(tel: string): string | null {
  const norm = normalizarTel(tel);
  if (norm.length < 8) return null;
  return norm.slice(-8);
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
function parseDataPlanilha(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const ano = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${ano}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T${(m[4]||'00').padStart(2,'0')}:${(m[5]||'00').padStart(2,'0')}:${(m[6]||'00').padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.length === 10 ? raw + 'T00:00:00' : raw.slice(0, 19).replace(' ', 'T');
  return null;
}

// Tipo do lead que vai pro frontend — campos completos
type LeadExport = {
  // Identificação
  cod: string | null;
  nome: string | null;
  telefone: string | null;
  regiao: string | null;
  // Datas
  data_cadastro: string | null;
  data_ativacao: string | null;
  data_lead: string | null;         // data que apareceu na planilha TP
  // Status
  status_api: string | null;
  // Operação
  em_operacao: boolean;
  total_entregas: number | null;
  ultima_entrega: string | null;
  // Atribuição
  quem_ativou: string | null;
  quem_alocou: string | null;
  // Tags/origem
  tags: string[];                    // vindas da planilha TP (se aplicável)
  origem: string | null;
};

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { funil, stage, dataInicio, dataFim, regiao, modo } = body;

    if (!funil || !stage || !dataInicio || !dataFim) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: funil, stage, dataInicio, dataFim' },
        { status: 400 }
      );
    }

    // Modo "90d": reescreve período pra janela fixa hoje-90d..hoje e IGNORA região.
    // Isso espelha exatamente o que o analytics-route faz no funilTP90d.
    const is90dMode = modo === '90d';
    let dataInicioStr: string, dataFimStr: string, regiaoEfetiva: string | undefined;
    if (is90dMode) {
      const hojeDt = new Date();
      const ini = new Date(hojeDt.getTime() - 90 * 24 * 60 * 60 * 1000);
      dataInicioStr = ini.toISOString().slice(0, 10);
      dataFimStr = hojeDt.toISOString().slice(0, 10);
      regiaoEfetiva = undefined; // ignora região no modo 90d
    } else {
      dataInicioStr = String(dataInicio).slice(0, 10);
      dataFimStr = String(dataFim).slice(0, 10);
      regiaoEfetiva = regiao;
    }

    const dentroDoPeriodo = (d: string | null | undefined): boolean => {
      if (!d) return false;
      const dia = String(d).split('T')[0];
      return dia >= dataInicioStr && dia <= dataFimStr;
    };
    const matchRegiao = (r: string | null | undefined): boolean => {
      if (!regiaoEfetiva) return true;
      return (r || '').toLowerCase().includes(String(regiaoEfetiva).toLowerCase());
    };

    // ========================================================================
    // Fetch crm_leads_capturados (aba Cadastros) — fonte de cadastro/ativação
    // CRÍTICO: limit default do backend é 50. Precisamos pedir TUDO.
    // ========================================================================
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (CRM_SERVICE_KEY) headers['x-service-key'] = CRM_SERVICE_KEY;

    const leadsCapResp = await fetch(`${BACKEND_URL}/api/crm/leads-captura/?page=1&limit=50000`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    const todosLeads: any[] = leadsCapResp?.data || [];

    // ========================================================================
    // Pré-carregar planilha TP INTEIRA (sem filtro de data) para construir
    // um índice Telefone → { tags, dataLead } que vai enriquecer TODOS os
    // leads exportados. Também carregamos alocações da Supabase para preencher
    // "Quem Alocou" em todos os drilldowns.
    // ========================================================================
    const todasLinhasTP = await carregarPlanilhaTP('1900-01-01', '2999-12-31', undefined);
    type IndiceInfoTP = { tags: Set<string>; dataLead: string | null };
    const indiceInfoTPPorTelefone = new Map<string, IndiceInfoTP>();
    for (const linha of todasLinhasTP) {
      for (const v of (linha.variacoes || [linha.telCanonico])) {
        const atual = indiceInfoTPPorTelefone.get(v) || { tags: new Set<string>(), dataLead: null };
        if (linha.tag) atual.tags.add(linha.tag);
        // Guarda a PRIMEIRA data de lead TP encontrada (mais antiga ganha)
        if (linha.dataISO && (!atual.dataLead || linha.dataISO < atual.dataLead)) {
          atual.dataLead = linha.dataISO;
        }
        indiceInfoTPPorTelefone.set(v, atual);
      }
    }

    // Índice de alocações por cod_profissional — pra preencher "Quem Alocou"
    // em qualquer drilldown. Carrega todas as alocações ativas.
    const indiceAlocacaoPorCod = new Map<string, string>();
    try {
      const client = supabaseAdmin || supabase;
      const { data: alocs } = await client
        .from('crm_alocacoes')
        .select('cod_profissional, quem_alocou')
        .eq('ativo', true);
      for (const a of alocs || []) {
        if (a.cod_profissional && a.quem_alocou) {
          indiceAlocacaoPorCod.set(String(a.cod_profissional), a.quem_alocou);
        }
      }
    } catch (e) {
      console.warn('[drilldown] Falha ao carregar alocações:', e);
    }

    // Helper: dado um telefone, retorna { tags, dataLead } TP desse lead
    const obterInfoTP = (tel: string | null | undefined): IndiceInfoTP => {
      if (!tel) return { tags: new Set(), dataLead: null };
      for (const v of gerarVariacoesTel(tel)) {
        const s = indiceInfoTPPorTelefone.get(v);
        if (s && (s.tags.size > 0 || s.dataLead)) return s;
      }
      return { tags: new Set(), dataLead: null };
    };
    // Alias retro-compatível: algumas linhas usam obterTagsDoLead
    const obterTagsDoLead = (tel: string | null | undefined): string[] => {
      return Array.from(obterInfoTP(tel).tags);
    };

    // Helper que envolve toLeadExport adicionando tags + dataLead + quem_alocou
    const enriquecer = (l: any): LeadExport => {
      const base = toLeadExport(l);
      const info = obterInfoTP(base.telefone);
      if (info.tags.size > 0) {
        base.tags = Array.from(info.tags);
        base.origem = 'Cadastros+TP'; // tem registro em ambos
      }
      if (info.dataLead) base.data_lead = info.dataLead;
      // Quem Alocou (vem da tabela crm_alocacoes)
      if (base.cod && !base.quem_alocou) {
        const qa = indiceAlocacaoPorCod.get(base.cod);
        if (qa) base.quem_alocou = qa;
      }
      return base;
    };

    // Filtros base (período + região)
    const leadsPorCadastro = todosLeads.filter(l =>
      dentroDoPeriodo(l.data_cadastro) && matchRegiao(l.regiao)
    );
    const leadsPorAtivacao = todosLeads.filter(l =>
      dentroDoPeriodo(l.data_ativacao) && l.status_api === 'ativo' && matchRegiao(l.regiao)
    );

    // ========================================================================
    // Roteamento por stage
    // ========================================================================
    const funilLower = String(funil).toLowerCase();
    const stageLower = String(stage).toLowerCase();

    let resultado: LeadExport[] = [];

    // ---------- FUNIL DE CONVERSÃO ----------
    // Helper: enriquece uma lista de LeadExport com dados de bi_entregas.
    // Todos os drilldowns (exceto "Em Operação" que já filtra por isso) passam
    // por aqui pra que a coluna Operação/Entregas/Última Entrega apareça
    // preenchida quando o lead estiver rodando — mesmo no stage "Cadastros".
    const enriquecerComOperacao = async (leads: LeadExport[]): Promise<LeadExport[]> => {
      const codsParaVerificar = leads.map(l => l.cod).filter(Boolean) as string[];
      if (codsParaVerificar.length === 0) return leads;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (CRM_SERVICE_KEY) headers['x-service-key'] = CRM_SERVICE_KEY;

      const resp = await fetch(`${BACKEND_URL}/api/crm/verificar-operacao`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ codigos: codsParaVerificar, data_inicio: dataInicioStr, data_fim: dataFimStr }),
        signal: AbortSignal.timeout(20_000),
      }).then(r => r.ok ? r.json() : null).catch(() => null);

      if (!resp?.resultado) return leads;

      const mapaOp = new Map<string, any>();
      for (const r of resp.resultado) {
        if (r.em_operacao && r.dados) mapaOp.set(String(r.cod_profissional), r.dados);
      }

      return leads.map(l => {
        const op = l.cod ? mapaOp.get(l.cod) : null;
        if (op) {
          l.em_operacao = true;
          l.total_entregas = Number(op.total_entregas) || null;
          l.ultima_entrega = op.ultima_entrega || null;
        }
        return l;
      });
    };

    if (funilLower === 'conversao') {
      if (stageLower.includes('total cadastros') || stageLower === 'cadastros') {
        resultado = await enriquecerComOperacao(leadsPorCadastro.map(enriquecer));
      } else if (stageLower === 'ativados') {
        resultado = await enriquecerComOperacao(leadsPorAtivacao.map(enriquecer));
      } else if (stageLower === 'alocados') {
        // Alocações vêm do backend Railway (MESMA fonte do analytics-route).
        // Filtra por data_prevista (quando foi planejada a operação), com
        // fallback pra created_at — consistente com o KPI "Alocados".
        const alocHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (CRM_SERVICE_KEY) alocHeaders['x-service-key'] = CRM_SERVICE_KEY;

        const alocResp = await fetch(`${BACKEND_URL}/api/crm/alocacao?limit=50000&todos=true`, {
          headers: alocHeaders,
          signal: AbortSignal.timeout(20_000),
        }).then(r => r.ok ? r.json() : { success: false, data: [] }).catch(() => ({ success: false, data: [] }));

        const todasAlocacoes: any[] = alocResp?.data || [];

        // Filtrar alocações do período (data_prevista OU created_at dentro do range)
        const alocacoesPeriodo = todasAlocacoes.filter((a: any) => {
          const fonte = a.data_prevista || a.created_at;
          if (!fonte) return false;
          const d = String(fonte).split('T')[0];
          return d >= dataInicioStr && d <= dataFimStr;
        });

        // Indexar alocações por cod_prof pra conseguir extrair quem_alocou/data_prevista
        // ao montar a linha (dedup: mais recente vence)
        const alocPorCod = new Map<string, any>();
        for (const a of alocacoesPeriodo) {
          const c = a.cod_prof ? String(a.cod_prof) : null;
          if (!c) continue;
          const atual = alocPorCod.get(c);
          const fonteNova = a.data_prevista || a.created_at;
          const fonteAtual = atual ? (atual.data_prevista || atual.created_at) : null;
          if (!atual || (fonteNova && fonteAtual && fonteNova > fonteAtual)) {
            alocPorCod.set(c, a);
          }
        }

        const codsAlocados = Array.from(alocPorCod.keys());
        const indexLeads = new Map(todosLeads.map(l => [String(l.cod), l]));

        const alocadosList = codsAlocados
          .map(cod => {
            const lead = indexLeads.get(cod);
            if (!lead) {
              // Lead alocado mas não está em crm_leads_capturados
              // Monta registro mínimo a partir da alocação
              const a = alocPorCod.get(cod);
              return {
                cod: cod,
                nome: a?.nome_prof || null,
                telefone: null,
                regiao: null,
                celular: null,
                data_cadastro: null,
                data_ativacao: null,
                status_api: null,
                quem_ativou: null,
                quem_alocou: a?.quem_alocou || null,
              };
            }
            // Mescla com quem_alocou da alocação
            const a = alocPorCod.get(cod);
            return {
              ...lead,
              quem_alocou: a?.quem_alocou || lead.quem_alocou || null,
            };
          })
          .filter(l => matchRegiao(l.regiao))
          .map(enriquecer);

        resultado = await enriquecerComOperacao(alocadosList);
        console.log(`[drilldown] Alocados: total=${alocacoesPeriodo.length} codsUnicos=${codsAlocados.length} resultado=${resultado.length}`);
      } else if (stageLower.includes('em operação') || stageLower.includes('em operacao')) {
        // Em operação: cruza ativados com bi_entregas via endpoint
        resultado = await buscarEmOperacao(leadsPorAtivacao, dataInicioStr, dataFimStr);
        // Enriquece com tags TP + data_lead + quem_alocou (mesmos campos do helper `enriquecer`)
        resultado = resultado.map(lead => {
          const info = obterInfoTP(lead.telefone);
          if (info.tags.size > 0) {
            lead.tags = Array.from(info.tags);
            lead.origem = 'Cadastros+TP';
          }
          if (info.dataLead) lead.data_lead = info.dataLead;
          if (lead.cod && !lead.quem_alocou) {
            const qa = indiceAlocacaoPorCod.get(lead.cod);
            if (qa) lead.quem_alocou = qa;
          }
          return lead;
        });
      } else {
        return NextResponse.json(
          { error: `Stage "${stage}" desconhecido para funil de conversão` },
          { status: 400 }
        );
      }
    }
    // ---------- FUNIL TRÁFEGO PAGO ----------
    else if (funilLower === 'tp') {
      // Carregar planilha TP
      const itensTP = await carregarPlanilhaTP(dataInicioStr, dataFimStr, regiaoEfetiva);
      // Indexar cadastros por telefone: exato + fingerprint
      const indiceTelCadastro = new Map<string, any>();
      const indiceFingerprint = new Map<string, any[]>();
      for (const lead of todosLeads) {
        const tel = lead.telefone || lead.celular || '';
        if (!tel) continue;
        for (const v of gerarVariacoesTel(tel)) {
          if (!indiceTelCadastro.has(v)) indiceTelCadastro.set(v, lead);
        }
        const fp = fingerprint8(tel);
        if (fp) {
          const lista = indiceFingerprint.get(fp);
          if (lista) lista.push(lead);
          else indiceFingerprint.set(fp, [lead]);
        }
      }
      // Para cada TP, tenta casar com cadastro: exato → fingerprint único
      const tpComCadastro = itensTP.map(r => {
        let cad: any = null;
        for (const v of r.variacoes) {
          const m = indiceTelCadastro.get(v);
          if (m) { cad = m; break; }
        }
        if (!cad) {
          const fp = fingerprint8(r.telCanonico);
          if (fp) {
            const candidatos = indiceFingerprint.get(fp);
            if (candidatos && candidatos.length === 1) {
              cad = candidatos[0];
            }
          }
        }
        return { ...r, cadastro: cad };
      });

      // Helper que adiciona quem_alocou a um LeadExport TP (tp já tem data_lead
      // e tags vindo da planilha via tpItemToExport; falta só a alocação)
      const enriquecerAlocacaoTP = (le: LeadExport): LeadExport => {
        if (le.cod && !le.quem_alocou) {
          const qa = indiceAlocacaoPorCod.get(le.cod);
          if (qa) le.quem_alocou = qa;
        }
        return le;
      };

      if (stageLower.includes('leads com tag tp') || stageLower.includes('tag tp')) {
        // Todos da planilha — cadastro pode ser null
        resultado = await enriquecerComOperacao(
          tpComCadastro.map(r => enriquecerAlocacaoTP(tpItemToExport(r)))
        );
      } else if (stageLower.includes('tp com cadastro') || stageLower === 'com cadastro') {
        // Tem cadastro E data_cadastro no período
        resultado = await enriquecerComOperacao(
          tpComCadastro
            .filter(r => r.cadastro && dentroDoPeriodo(r.cadastro.data_cadastro))
            .map(r => enriquecerAlocacaoTP(tpItemToExport(r)))
        );
      } else if (stageLower.includes('tp ativados') || stageLower === 'ativados') {
        // Cadastrado no período + status_api='ativo'. Se data_ativacao existir,
        // respeita período; se for null, aceita (alinhado ao analytics).
        const ativados = tpComCadastro.filter(r => {
          if (!r.cadastro) return false;
          if (!dentroDoPeriodo(r.cadastro.data_cadastro)) return false;
          if (r.cadastro.status_api !== 'ativo') return false;
          if (!r.cadastro.data_ativacao) return true;
          return dentroDoPeriodo(r.cadastro.data_ativacao);
        });

        // Enriquecer com dados de operação (bi_entregas) — mesmo que o stage
        // seja "TP Ativados" (não "em Operação"), queremos mostrar a coluna
        // Operação/Entregas/Última Entrega preenchida quando o lead estiver
        // rodando. O usuário precisa ver o quadro completo.
        const leadsParaOp = ativados
          .filter(r => r.cadastro && r.cadastro.cod)
          .map(r => r.cadastro);
        const comOperacao = await buscarEmOperacao(leadsParaOp, dataInicioStr, dataFimStr);
        const mapaOp = new Map(comOperacao.map(o => [o.cod, o]));

        resultado = ativados.map(r => {
          const base = enriquecerAlocacaoTP(tpItemToExport(r));
          const op = r.cadastro ? mapaOp.get(String(r.cadastro.cod)) : null;
          if (op) {
            base.em_operacao = true;
            base.total_entregas = op.total_entregas;
            base.ultima_entrega = op.ultima_entrega;
          }
          return base;
        });
      } else if (stageLower.includes('tp em operação') || stageLower.includes('em operacao')) {
        // Ativados (mesma regra relaxada) + em operação no período
        const ativados = tpComCadastro.filter(r => {
          if (!r.cadastro) return false;
          if (!dentroDoPeriodo(r.cadastro.data_cadastro)) return false;
          if (r.cadastro.status_api !== 'ativo') return false;
          if (!r.cadastro.data_ativacao) return true;
          return dentroDoPeriodo(r.cadastro.data_ativacao);
        });
        // Checar operação via endpoint
        const leadsForm = ativados
          .filter(r => r.cadastro && r.cadastro.cod)
          .map(r => r.cadastro);
        const comOperacao = await buscarEmOperacao(leadsForm, dataInicioStr, dataFimStr);
        const codsOp = new Set(comOperacao.map(l => l.cod));
        resultado = ativados
          .filter(r => r.cadastro && codsOp.has(String(r.cadastro.cod)))
          .map(r => {
            const base = enriquecerAlocacaoTP(tpItemToExport(r));
            const op = comOperacao.find(o => o.cod === String(r.cadastro.cod));
            if (op) {
              base.em_operacao = true;
              base.total_entregas = op.total_entregas;
              base.ultima_entrega = op.ultima_entrega;
            }
            return base;
          });
      } else {
        return NextResponse.json(
          { error: `Stage "${stage}" desconhecido para funil TP` },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: `Funil "${funil}" desconhecido (use 'conversao' ou 'tp')` },
        { status: 400 }
      );
    }

    console.log(`[Drilldown] funil=${funil} stage=${stage} periodo=${dataInicioStr}→${dataFimStr} | ${resultado.length} leads`);

    return NextResponse.json({
      stage,
      funil,
      periodo: { dataInicio: dataInicioStr, dataFim: dataFimStr, regiao: regiaoEfetiva || null, modo: modo || 'atual' },
      total: resultado.length,
      leads: resultado,
    });
  } catch (e: any) {
    console.error('[Drilldown] Erro:', e);
    return NextResponse.json(
      { error: e.message || 'Erro interno' },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPERS DE CONVERSÃO
// ============================================================================

function toLeadExport(l: any): LeadExport {
  return {
    cod: l.cod ? String(l.cod) : null,
    nome: l.nome || l.nome_profissional || null,
    telefone: l.telefone || l.celular || null,
    regiao: l.regiao || null,
    data_cadastro: l.data_cadastro || null,
    data_ativacao: l.data_ativacao || null,
    data_lead: null,
    status_api: l.status_api || null,
    em_operacao: false,
    total_entregas: null,
    ultima_entrega: null,
    quem_ativou: l.quem_ativou || null,
    quem_alocou: l.quem_alocou || null,
    tags: [],
    origem: 'Cadastros',
  };
}

function tpItemToExport(item: {
  telCanonico: string;
  telRaw: string;
  nome: string;
  tag: string;
  regiao: string | null;
  dataISO: string | null;
  cadastro: any | null;
}): LeadExport {
  const cad = item.cadastro;
  return {
    cod: cad?.cod ? String(cad.cod) : null,
    nome: cad?.nome || item.nome || null,
    telefone: cad?.telefone || item.telRaw,
    regiao: item.regiao || cad?.regiao || null,
    data_cadastro: cad?.data_cadastro || null,
    data_ativacao: cad?.data_ativacao || null,
    data_lead: item.dataISO,
    status_api: cad?.status_api || null,
    em_operacao: false,
    total_entregas: null,
    ultima_entrega: null,
    quem_ativou: cad?.quem_ativou || null,
    quem_alocou: cad?.quem_alocou || null,
    tags: item.tag ? [item.tag] : [],
    origem: 'TP-Planilha',
  };
}

// ============================================================================
// HELPER: carregar planilha TP (mesma lógica do analytics-route)
// ============================================================================

type LinhaTPParsed = {
  telCanonico: string;
  telRaw: string;
  variacoes: string[];
  nome: string;
  tag: string;
  dataISO: string | null;
  regiao: string | null;
};

async function carregarPlanilhaTP(
  dataInicioStr: string,
  dataFimStr: string,
  regiao?: string
): Promise<LinhaTPParsed[]> {
  const cb = Math.floor(Date.now() / 60_000);
  const url = `${PLANILHA_TP_URL}&cachebust=${cb}`;
  const resp = await fetch(url, {
    headers: { Accept: 'text/csv', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  if (!resp.ok) return [];

  const csv = (await resp.text()).replace(/^\uFEFF/, '');
  const linhas = csv.split('\n');
  if (linhas.length < 2) return [];

  const headers = parseCsvLinha(linhas[0]).map(h =>
    h.replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  );
  const colNome = headers.findIndex(h => h === 'nome');
  const colPhone = headers.findIndex(h => h === 'phone' || h === 'telefone');
  const colTp = headers.findIndex(h => h === 'tp');
  const colData = headers.findIndex(h => h === 'data' || h === 'data cadastro' || h === 'data_cadastro' || h === 'created' || h === 'cadastro');
  const colRegiao = headers.findIndex(h => h === 'estado ou cidade' || h === 'estado' || h === 'cidade' || h === 'regiao' || h === 'região');

  if (colPhone < 0 || colTp < 0) return [];

  const vistos = new Set<string>();
  const out: LinhaTPParsed[] = [];

  for (let i = 1; i < linhas.length; i++) {
    if (!linhas[i].trim()) continue;
    const vals = parseCsvLinha(linhas[i]);
    const telRaw = vals[colPhone];
    const tp = vals[colTp];
    if (!telRaw || !tp || !/^TP/i.test(tp)) continue;

    const variacoes = gerarVariacoesTel(telRaw);
    if (variacoes.length === 0) continue;
    const telCanonico = variacoes[0];
    if (vistos.has(telCanonico)) continue;
    vistos.add(telCanonico);

    const dataISO = parseDataPlanilha(colData >= 0 ? vals[colData] : '');
    if (!dataISO) continue;
    const diaOnly = dataISO.split('T')[0];
    if (diaOnly < dataInicioStr || diaOnly > dataFimStr) continue;

    const regiaoLinha = (colRegiao >= 0 ? vals[colRegiao] : '').trim() || null;
    if (regiao && !(regiaoLinha || '').toLowerCase().includes(regiao.toLowerCase())) continue;

    out.push({
      telCanonico,
      telRaw,
      variacoes,
      nome: colNome >= 0 ? vals[colNome] : '',
      tag: tp.trim(),
      dataISO,
      regiao: regiaoLinha,
    });
  }

  return out;
}

// ============================================================================
// HELPER: cruzar com bi_entregas pelo endpoint do backend
// ============================================================================

async function buscarEmOperacao(
  leads: any[],
  dataInicioStr: string,
  dataFimStr: string
): Promise<LeadExport[]> {
  const codigos = leads.map(l => String(l.cod)).filter(Boolean);
  if (codigos.length === 0) return [];

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (CRM_SERVICE_KEY) headers['x-service-key'] = CRM_SERVICE_KEY;

  const resp = await fetch(`${BACKEND_URL}/api/crm/verificar-operacao`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ codigos, data_inicio: dataInicioStr, data_fim: dataFimStr }),
    signal: AbortSignal.timeout(20_000),
  }).then(r => r.ok ? r.json() : null).catch(() => null);

  if (!resp?.resultado) return [];

  const mapaEntregas = new Map<string, any>();
  for (const r of resp.resultado) {
    if (r.em_operacao && r.dados) {
      mapaEntregas.set(String(r.cod_profissional), r.dados);
    }
  }

  const mapaLeads = new Map(leads.map(l => [String(l.cod), l]));
  const exports: LeadExport[] = [];
  mapaEntregas.forEach((dados, cod) => {
    const lead = mapaLeads.get(cod);
    if (!lead) return;
    const exp = toLeadExport(lead);
    exp.em_operacao = true;
    exp.total_entregas = Number(dados.total_entregas) || null;
    exp.ultima_entrega = dados.ultima_entrega || null;
    exports.push(exp);
  });
  return exports;
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Use POST' });
}
