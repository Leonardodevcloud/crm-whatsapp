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
  // CRM WhatsApp
  stage: string | null;
  status: string | null;
};

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { funil, stage, dataInicio, dataFim, regiao } = body;

    if (!funil || !stage || !dataInicio || !dataFim) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: funil, stage, dataInicio, dataFim' },
        { status: 400 }
      );
    }

    const dataInicioStr = String(dataInicio).slice(0, 10);
    const dataFimStr = String(dataFim).slice(0, 10);
    const dentroDoPeriodo = (d: string | null | undefined): boolean => {
      if (!d) return false;
      const dia = String(d).split('T')[0];
      return dia >= dataInicioStr && dia <= dataFimStr;
    };
    const matchRegiao = (r: string | null | undefined): boolean => {
      if (!regiao) return true;
      return (r || '').toLowerCase().includes(String(regiao).toLowerCase());
    };

    // ========================================================================
    // Fetch crm_leads_capturados (aba Cadastros) — fonte de cadastro/ativação
    // ========================================================================
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (CRM_SERVICE_KEY) headers['x-service-key'] = CRM_SERVICE_KEY;

    const leadsCapResp = await fetch(`${BACKEND_URL}/api/crm/leads-captura/`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    const todosLeads: any[] = leadsCapResp?.data || [];

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
    if (funilLower === 'conversao') {
      if (stageLower.includes('total cadastros') || stageLower === 'cadastros') {
        resultado = leadsPorCadastro.map(toLeadExport);
      } else if (stageLower === 'ativados') {
        resultado = leadsPorAtivacao.map(toLeadExport);
      } else if (stageLower === 'alocados') {
        // Alocações da tabela Supabase
        const client = supabaseAdmin || supabase;
        const { data: alocs } = await client
          .from('crm_alocacoes')
          .select('cod_profissional')
          .gte('data_alocacao', dataInicioStr)
          .lte('data_alocacao', dataFimStr + 'T23:59:59.999Z');

        const codsAlocados = new Set(
          (alocs || []).map(a => String(a.cod_profissional)).filter(Boolean)
        );
        const indexLeads = new Map(todosLeads.map(l => [String(l.cod), l]));
        resultado = (Array.from(codsAlocados) as string[])
          .map(cod => indexLeads.get(cod))
          .filter(l => l && matchRegiao(l.regiao))
          .map(toLeadExport);
      } else if (stageLower.includes('em operação') || stageLower.includes('em operacao')) {
        // Em operação: cruza ativados com bi_entregas via endpoint
        resultado = await buscarEmOperacao(leadsPorAtivacao, dataInicioStr, dataFimStr);
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
      const itensTP = await carregarPlanilhaTP(dataInicioStr, dataFimStr, regiao);
      // Indexar cadastros por telefone
      const indiceTelCadastro = new Map<string, any>();
      for (const lead of todosLeads) {
        const tel = lead.telefone || lead.celular || '';
        if (!tel) continue;
        for (const v of gerarVariacoesTel(tel)) {
          if (!indiceTelCadastro.has(v)) indiceTelCadastro.set(v, lead);
        }
      }
      // Para cada TP, tenta casar com cadastro
      const tpComCadastro = itensTP.map(r => {
        let cad: any = null;
        for (const v of r.variacoes) {
          const m = indiceTelCadastro.get(v);
          if (m) { cad = m; break; }
        }
        return { ...r, cadastro: cad };
      });

      if (stageLower.includes('leads com tag tp') || stageLower.includes('tag tp')) {
        // Todos da planilha — cadastro pode ser null
        resultado = tpComCadastro.map(r => tpItemToExport(r));
      } else if (stageLower.includes('tp com cadastro') || stageLower === 'com cadastro') {
        // Tem cadastro E data_cadastro no período
        resultado = tpComCadastro
          .filter(r => r.cadastro && dentroDoPeriodo(r.cadastro.data_cadastro))
          .map(r => tpItemToExport(r));
      } else if (stageLower.includes('tp ativados') || stageLower === 'ativados') {
        // Cadastrado E ativado no período E status ativo
        resultado = tpComCadastro
          .filter(r =>
            r.cadastro &&
            dentroDoPeriodo(r.cadastro.data_cadastro) &&
            r.cadastro.status_api === 'ativo' &&
            dentroDoPeriodo(r.cadastro.data_ativacao)
          )
          .map(r => tpItemToExport(r));
      } else if (stageLower.includes('tp em operação') || stageLower.includes('em operacao')) {
        // Ativados + em operação no período
        const ativados = tpComCadastro.filter(r =>
          r.cadastro &&
          dentroDoPeriodo(r.cadastro.data_cadastro) &&
          r.cadastro.status_api === 'ativo' &&
          dentroDoPeriodo(r.cadastro.data_ativacao)
        );
        // Checar operação via endpoint
        const leadsForm = ativados
          .filter(r => r.cadastro && r.cadastro.cod)
          .map(r => r.cadastro);
        const comOperacao = await buscarEmOperacao(leadsForm, dataInicioStr, dataFimStr);
        const codsOp = new Set(comOperacao.map(l => l.cod));
        resultado = ativados
          .filter(r => r.cadastro && codsOp.has(String(r.cadastro.cod)))
          .map(r => {
            const base = tpItemToExport(r);
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
      periodo: { dataInicio: dataInicioStr, dataFim: dataFimStr, regiao: regiao || null },
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
    stage: null,
    status: null,
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
    stage: null,
    status: null,
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
  for (const [cod, dados] of mapaEntregas) {
    const lead = mapaLeads.get(cod);
    if (!lead) continue;
    const exp = toLeadExport(lead);
    exp.em_operacao = true;
    exp.total_entregas = Number(dados.total_entregas) || null;
    exp.ultima_entrega = dados.ultima_entrega || null;
    exports.push(exp);
  }
  return exports;
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Use POST' });
}
