// ===========================================
// API: /api/analytics/debug-lead
// GET: ?cod=<codigo> — rastreia TODO o caminho do lead no funil TP:
//   1. Existe em crm_leads_capturados?
//   2. Existe na planilha TP? (match por telefone)
//   3. Passa no filtro de "cadastrado no período"?
//   4. Passa no filtro de "ativado no período"?
//   5. Tem entregas em bi_entregas no período? (endpoint backend)
//
// Exemplo:
//   GET /api/analytics/debug-lead?cod=17853&dataInicio=2026-04-01&dataFim=2026-04-30
// ===========================================

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';
const PLANILHA_TP_URL =
  'https://docs.google.com/spreadsheets/d/1MOttPq20kzgnTY5Rv_9ocJNsp3ZFad0_xt_M96utES8/export?format=csv&gid=0';

function normalizarTel(tel: string): string { return (tel || '').replace(/\D/g, ''); }
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
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '"') q = !q;
    else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; }
    else if (c !== '\r') cur += c;
  }
  out.push(cur.trim());
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const cod = url.searchParams.get('cod') || '';
    const dataInicio = url.searchParams.get('dataInicio') || '2026-04-01';
    const dataFim = url.searchParams.get('dataFim') || '2026-04-30';

    if (!cod) return NextResponse.json({ error: 'Informe ?cod=...' }, { status: 400 });

    const dentroDoPeriodo = (d: string | null | undefined): boolean => {
      if (!d) return false;
      const dia = String(d).split('T')[0];
      return dia >= dataInicio && dia <= dataFim;
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (CRM_SERVICE_KEY) headers['x-service-key'] = CRM_SERVICE_KEY;

    const resposta: Record<string, any> = {
      cod_buscado: cod,
      periodo: { dataInicio, dataFim },
      auth_configurada: !!CRM_SERVICE_KEY,
    };

    // ────────────────────────────────────────────────────────────
    // 1. Buscar em crm_leads_capturados
    // ────────────────────────────────────────────────────────────
    const leadsResp = await fetch(`${BACKEND_URL}/api/crm/leads-captura/?page=1&limit=50000`, {
      headers,
    }).then(r => ({ status: r.status, ok: r.ok, json: r.ok ? r.json() : null }));

    resposta.passo_1_leads_captura = {
      status: leadsResp.status,
      ok: leadsResp.ok,
    };

    if (!leadsResp.ok) {
      resposta.passo_1_leads_captura.erro = 'Falha ao buscar leads (provavelmente auth falhou)';
      return NextResponse.json(resposta);
    }

    const json = await leadsResp.json;
    const todosLeads: any[] = json?.data || [];
    resposta.passo_1_leads_captura.total_leads = todosLeads.length;

    const leadEncontrado = todosLeads.find(l => String(l.cod) === String(cod));
    if (!leadEncontrado) {
      resposta.passo_1_leads_captura.lead_encontrado = false;
      resposta.passo_1_leads_captura.erro = `Cod ${cod} não está em crm_leads_capturados`;
      return NextResponse.json(resposta);
    }
    resposta.passo_1_leads_captura.lead_encontrado = {
      cod: leadEncontrado.cod,
      nome: leadEncontrado.nome,
      telefone: leadEncontrado.telefone || leadEncontrado.celular,
      data_cadastro: leadEncontrado.data_cadastro,
      data_ativacao: leadEncontrado.data_ativacao,
      status_api: leadEncontrado.status_api,
      regiao: leadEncontrado.regiao,
    };

    // ────────────────────────────────────────────────────────────
    // 2. Passa nos filtros do funil TP?
    // ────────────────────────────────────────────────────────────
    const passaCadastro = dentroDoPeriodo(leadEncontrado.data_cadastro);
    const statusEhAtivo = leadEncontrado.status_api === 'ativo';
    const passaAtivacao = leadEncontrado.data_ativacao
      ? dentroDoPeriodo(leadEncontrado.data_ativacao)
      : true; // regra relaxada: sem data_ativacao passa se status='ativo'

    resposta.passo_2_filtros_funil = {
      cadastrou_no_periodo: passaCadastro,
      status_api_ativo: statusEhAtivo,
      ativacao_ok: passaAtivacao,
      entra_em_tp_ativados: passaCadastro && statusEhAtivo && passaAtivacao,
    };

    // ────────────────────────────────────────────────────────────
    // 3. Existe na planilha TP?
    // ────────────────────────────────────────────────────────────
    const cb = Math.floor(Date.now() / 60_000);
    const planResp = await fetch(`${PLANILHA_TP_URL}&cachebust=${cb}`, {
      headers: { Accept: 'text/csv', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
    });
    const csv = planResp.ok ? (await planResp.text()).replace(/^\uFEFF/, '') : '';
    const linhasCsv = csv.split('\n');
    const hdrs = parseCsvLinha(linhasCsv[0] || '').map(h =>
      h.replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    );
    const colPhone = hdrs.findIndex(h => h === 'phone' || h === 'telefone');
    const colData = hdrs.findIndex(h => h === 'data' || h === 'cadastro');
    const telLeadVars = gerarVariacoesTel(leadEncontrado.telefone || leadEncontrado.celular || '');
    const setTelVars = new Set(telLeadVars);
    const linhasMatch: Array<Record<string, any>> = [];
    for (let i = 1; i < linhasCsv.length; i++) {
      if (!linhasCsv[i].trim()) continue;
      const vals = parseCsvLinha(linhasCsv[i]);
      const telPlan = colPhone >= 0 ? vals[colPhone] : '';
      const varsPlan = gerarVariacoesTel(telPlan);
      if (varsPlan.some(v => setTelVars.has(v))) {
        linhasMatch.push({
          telefone_raw: telPlan,
          data: colData >= 0 ? vals[colData] : '',
          linha_completa: vals,
        });
      }
    }
    resposta.passo_3_planilha_tp = {
      telefone_lead: leadEncontrado.telefone || leadEncontrado.celular,
      variacoes_testadas: telLeadVars,
      linhas_match: linhasMatch,
      total_linhas_match: linhasMatch.length,
    };

    // ────────────────────────────────────────────────────────────
    // 4. Verificar se está em bi_entregas (operação)
    // ────────────────────────────────────────────────────────────
    const opResp = await fetch(`${BACKEND_URL}/api/crm/verificar-operacao`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ codigos: [Number(cod)], data_inicio: dataInicio, data_fim: dataFim }),
    });
    const opStatus = opResp.status;
    const opJson = opResp.ok ? await opResp.json() : null;
    resposta.passo_4_bi_entregas = {
      status: opStatus,
      ok: opResp.ok,
      retorno: opJson,
      em_operacao: opJson?.resultado?.[0]?.em_operacao || false,
      dados_entregas: opJson?.resultado?.[0]?.dados || null,
    };

    // ────────────────────────────────────────────────────────────
    // 5. Veredito final
    // ────────────────────────────────────────────────────────────
    const entra_tp_ativados = resposta.passo_2_filtros_funil.entra_em_tp_ativados;
    const esta_em_planilha = linhasMatch.length > 0;
    const esta_em_operacao_backend = resposta.passo_4_bi_entregas.em_operacao;

    let veredito: string;
    if (!esta_em_planilha) {
      veredito = '❌ Lead NÃO está na planilha TP → nunca vai aparecer em funil TP';
    } else if (!entra_tp_ativados) {
      veredito = '❌ Lead está na planilha, mas não passa nos filtros TP Ativados. Veja passo_2.';
    } else if (!esta_em_operacao_backend) {
      veredito = '❌ Lead passa em TP Ativados, mas backend diz que não está em operação no período. Veja passo_4.';
    } else {
      veredito = '✅ TUDO OK: lead DEVERIA aparecer em TP em Operação. Se não aparece, é bug no frontend/cache.';
    }
    resposta.veredito = veredito;

    return NextResponse.json(resposta);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
