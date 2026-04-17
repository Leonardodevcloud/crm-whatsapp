// ===========================================
// API: /api/analytics/debug-telefone
// GET: ?tel=<numero> — diagnostica por que um telefone não bate
//      entre planilha TP e crm_leads_capturados.
//
// Retorna:
//   - input original e normalizado
//   - variações geradas pelo algoritmo
//   - fingerprint (últimos 8 dígitos)
//   - linhas da planilha TP que casam (por variação ou fingerprint)
//   - cadastros que casam (por variação ou fingerprint)
//   - veredito: "match exato" | "match por fingerprint" | "nenhum match"
//
// Exemplo:
//   GET /api/analytics/debug-telefone?tel=(81)99444-3322
// ===========================================

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';

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
    else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; }
    else if (c !== '\r') cur += c;
  }
  out.push(cur.trim());
  return out;
}

// ============================================================================
// HANDLER
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const telInput = url.searchParams.get('tel') || '';

    if (!telInput) {
      return NextResponse.json({
        error: 'Parâmetro ?tel= é obrigatório',
        exemplos: [
          '/api/analytics/debug-telefone?tel=(81)99444-3322',
          '/api/analytics/debug-telefone?tel=5581994443322',
          '/api/analytics/debug-telefone?tel=81994443322',
        ],
      }, { status: 400 });
    }

    const norm = normalizarTel(telInput);
    const variacoes = gerarVariacoesTel(telInput);
    const fp = fingerprint8(telInput);

    // ========================================================================
    // 1. Buscar em crm_leads_capturados
    // ========================================================================
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (CRM_SERVICE_KEY) headers['x-service-key'] = CRM_SERVICE_KEY;

    const leadsCapResp = await fetch(`${BACKEND_URL}/api/crm/leads-captura/`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    }).then(r => r.ok ? r.json() : null).catch(() => null);

    const todosLeads: any[] = leadsCapResp?.data || [];

    // Indexar com as duas estratégias
    const indiceExato = new Map<string, any>();
    const indiceFp = new Map<string, any[]>();
    for (const lead of todosLeads) {
      const t = lead.telefone || lead.celular || '';
      if (!t) continue;
      for (const v of gerarVariacoesTel(t)) {
        if (!indiceExato.has(v)) indiceExato.set(v, lead);
      }
      const f = fingerprint8(t);
      if (f) {
        const lista = indiceFp.get(f);
        if (lista) lista.push(lead);
        else indiceFp.set(f, [lead]);
      }
    }

    // Busca em cadastros: exato
    let cadastroExato: any = null;
    let variacaoQueBateu: string | null = null;
    for (const v of variacoes) {
      const m = indiceExato.get(v);
      if (m) { cadastroExato = m; variacaoQueBateu = v; break; }
    }

    // Busca em cadastros: fingerprint
    const cadastrosFp = fp ? (indiceFp.get(fp) || []) : [];

    // ========================================================================
    // 2. Buscar na planilha TP
    // ========================================================================
    const cb = Math.floor(Date.now() / 60_000);
    const planilhaUrl = `${PLANILHA_TP_URL}&cachebust=${cb}`;
    const planilhaResp = await fetch(planilhaUrl, {
      headers: { Accept: 'text/csv', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });

    type LinhaPlanilha = {
      telefone_raw: string;
      telefone_normalizado: string;
      variacoes_planilha: string[];
      fingerprint: string | null;
      nome: string;
      tp: string;
      data: string;
      regiao: string;
    };
    const linhasMatchExato: LinhaPlanilha[] = [];
    const linhasMatchFp: LinhaPlanilha[] = [];

    if (planilhaResp.ok) {
      const csv = (await planilhaResp.text()).replace(/^\uFEFF/, '');
      const linhas = csv.split('\n');
      if (linhas.length >= 2) {
        const hdrs = parseCsvLinha(linhas[0]).map(h =>
          h.replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        );
        const colNome = hdrs.findIndex(h => h === 'nome');
        const colPhone = hdrs.findIndex(h => h === 'phone' || h === 'telefone');
        const colTp = hdrs.findIndex(h => h === 'tp');
        const colData = hdrs.findIndex(h => h === 'data' || h === 'cadastro');
        const colRegiao = hdrs.findIndex(h => h === 'estado ou cidade' || h === 'estado' || h === 'cidade' || h === 'regiao' || h === 'região');

        if (colPhone >= 0) {
          const setVariacoes = new Set(variacoes);
          for (let i = 1; i < linhas.length; i++) {
            if (!linhas[i].trim()) continue;
            const vals = parseCsvLinha(linhas[i]);
            const telRaw = vals[colPhone];
            if (!telRaw) continue;
            const varsPlan = gerarVariacoesTel(telRaw);
            const fpPlan = fingerprint8(telRaw);

            const linha: LinhaPlanilha = {
              telefone_raw: telRaw,
              telefone_normalizado: normalizarTel(telRaw),
              variacoes_planilha: varsPlan,
              fingerprint: fpPlan,
              nome: colNome >= 0 ? vals[colNome] : '',
              tp: colTp >= 0 ? vals[colTp] : '',
              data: colData >= 0 ? vals[colData] : '',
              regiao: colRegiao >= 0 ? vals[colRegiao] : '',
            };

            // Match exato?
            if (varsPlan.some(v => setVariacoes.has(v))) {
              linhasMatchExato.push(linha);
            } else if (fp && fpPlan === fp) {
              linhasMatchFp.push(linha);
            }
          }
        }
      }
    }

    // ========================================================================
    // 3. Veredito
    // ========================================================================
    let vereditoMatchCadastro: string;
    if (cadastroExato) vereditoMatchCadastro = `✅ MATCH EXATO via variação "${variacaoQueBateu}"`;
    else if (cadastrosFp.length === 1) vereditoMatchCadastro = `⚠️ MATCH POR FINGERPRINT (único cadastro com fp=${fp}) — seria aceito pelo fallback`;
    else if (cadastrosFp.length > 1) vereditoMatchCadastro = `❌ AMBIGUIDADE: ${cadastrosFp.length} cadastros com mesmo fingerprint — fallback recusa`;
    else vereditoMatchCadastro = '❌ NENHUM MATCH: nem exato nem por fingerprint';

    let vereditoMatchPlanilha: string;
    if (linhasMatchExato.length > 0) vereditoMatchPlanilha = `✅ Existe na planilha (${linhasMatchExato.length} linha(s), match exato)`;
    else if (linhasMatchFp.length > 0) vereditoMatchPlanilha = `⚠️ Existe na planilha apenas por fingerprint (${linhasMatchFp.length} linha(s))`;
    else vereditoMatchPlanilha = '❌ Telefone não existe na planilha TP';

    return NextResponse.json({
      entrada: {
        original: telInput,
        normalizado: norm,
        comprimento: norm.length,
        variacoes_geradas: variacoes,
        fingerprint_ultimos_8_digitos: fp,
      },
      cadastros: {
        total_indexados: todosLeads.length,
        total_fingerprints_distintos: indiceFp.size,
        veredito: vereditoMatchCadastro,
        match_exato: cadastroExato
          ? {
              cod: cadastroExato.cod,
              nome: cadastroExato.nome,
              telefone_raw: cadastroExato.telefone || cadastroExato.celular,
              telefone_normalizado: normalizarTel(cadastroExato.telefone || cadastroExato.celular || ''),
              data_cadastro: cadastroExato.data_cadastro,
              data_ativacao: cadastroExato.data_ativacao,
              status_api: cadastroExato.status_api,
              variacao_que_bateu: variacaoQueBateu,
            }
          : null,
        match_fingerprint_candidatos: cadastrosFp.map(c => ({
          cod: c.cod,
          nome: c.nome,
          telefone_raw: c.telefone || c.celular,
          telefone_normalizado: normalizarTel(c.telefone || c.celular || ''),
          fingerprint: fingerprint8(c.telefone || c.celular || ''),
          data_cadastro: c.data_cadastro,
          data_ativacao: c.data_ativacao,
          status_api: c.status_api,
        })),
      },
      planilha_tp: {
        veredito: vereditoMatchPlanilha,
        linhas_match_exato: linhasMatchExato,
        linhas_match_fingerprint: linhasMatchFp,
      },
      conclusao:
        cadastroExato && linhasMatchExato.length > 0
          ? '🎯 Tudo OK: o lead está nos dois lados e o match é exato.'
          : cadastrosFp.length === 1 && linhasMatchExato.length > 0
          ? '⚠️ Planilha OK, mas cadastro só pega via fingerprint (o algoritmo antigo NÃO pegava esse caso).'
          : cadastroExato && linhasMatchFp.length > 0
          ? '⚠️ Cadastro OK, mas planilha tem formato diferente que só bate via fingerprint.'
          : !cadastroExato && cadastrosFp.length === 0
          ? '❌ Esse telefone simplesmente não existe em crm_leads_capturados.'
          : !linhasMatchExato.length && !linhasMatchFp.length
          ? '❌ Esse telefone não existe na planilha TP.'
          : 'Caso especial — veja detalhes acima.',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
