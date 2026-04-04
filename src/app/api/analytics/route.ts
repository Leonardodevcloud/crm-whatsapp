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

    console.log(`[Analytics] Filtros: ${dataInicioStr} → ${dataFimStr} | regiao=${regiao || 'todas'}`);

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

    // Set de códigos ativos no período (para cruzar com TP e BI)
    const codsAtivosSet = new Set(leadsPorAtivacao.map((l: any) => String(l.cod)));

    // Ativados por região (filtrado por data_ativacao)
    const ativadosPorRegiao: Record<string, number> = {};
    leadsPorAtivacao.forEach((l: any) => {
      if (l.regiao) ativadosPorRegiao[l.regiao] = (ativadosPorRegiao[l.regiao] || 0) + 1;
    });

    // Não ativados por região (cadastros no período que não são ativos)
    const naoAtivadosPorRegiao: Record<string, number> = {};
    leadsPorCadastro.filter((l: any) => l.status_api !== 'ativo').forEach((l: any) => {
      if (l.regiao) naoAtivadosPorRegiao[l.regiao] = (naoAtivadosPorRegiao[l.regiao] || 0) + 1;
    });

    // Operador (ativados por data_ativacao)
    const ativacoesPorOperador: Record<string, number> = {};
    leadsPorAtivacao.filter((l: any) => l.quem_ativou).forEach((l: any) => {
      ativacoesPorOperador[l.quem_ativou] = (ativacoesPorOperador[l.quem_ativou] || 0) + 1;
    });

    // Cadastros por dia (data_cadastro)
    const cadastrosPorDia: Record<string, number> = {};
    const hojeGrafico = new Date(); hojeGrafico.setHours(23, 59, 59, 999);
    const diaAtual = new Date(dataLimiteInicio);
    const limiteGrafico = dataLimiteFim < hojeGrafico ? dataLimiteFim : hojeGrafico;
    while (diaAtual <= limiteGrafico) {
      cadastrosPorDia[diaAtual.toISOString().split('T')[0]] = 0;
      diaAtual.setDate(diaAtual.getDate() + 1);
    }
    leadsPorCadastro.forEach((l: any) => {
      if (l.data_cadastro) {
        const dia = l.data_cadastro.split('T')[0];
        if (cadastrosPorDia[dia] !== undefined) cadastrosPorDia[dia]++;
      }
    });

    // ═══ 2. CRM SUPABASE (tags TP, mortos, ressuscitados) ═══
    const { data: allLeads } = await client
      .from('dados_cliente')
      .select('id, stage, regiao, tags, created_at, updated_at, ressuscitado_em, vezes_ressuscitado, cod_profissional')
      .eq('status', 'ativo')
      .limit(50000);

    const leadsCrmNoPeriodo = (allLeads || []).filter(lead => {
      if (!lead.created_at) return false;
      const dt = new Date(lead.created_at);
      if (dt < dataLimiteInicio || dt > dataLimiteFim) return false;
      if (regiao && lead.regiao !== regiao) return false;
      return true;
    });

    const parseTags = (tags: any): string[] => {
      if (Array.isArray(tags)) return tags;
      if (typeof tags === 'string') {
        const str = tags.trim();
        if (str.startsWith('{') && str.endsWith('}')) return str.slice(1, -1).split(',').map(t => t.trim()).filter(Boolean);
        if (str) return [str];
      }
      return [];
    };

    // TP: Leads com tag TP → com cadastro → ATIVADOS → em operação
    const leadsComTP = leadsCrmNoPeriodo.filter(l => parseTags(l.tags).some(t => t.startsWith('TP')));
    const leadsTPComCadastro = leadsComTP.filter(l => l.cod_profissional);
    // TP Ativados = TP com cadastro cujo código está ativo no crm_leads_capturados
    const leadsTPAtivados = leadsTPComCadastro.filter(l => codsAtivosSet.has(String(l.cod_profissional)));

    const tpPorRegiao: Record<string, number> = {};
    leadsComTP.forEach(l => { const reg = (l.regiao || 'Sem região').toUpperCase(); tpPorRegiao[reg] = (tpPorRegiao[reg] || 0) + 1; });

    const leadsPorTag: Record<string, number> = {};
    leadsCrmNoPeriodo.forEach(lead => { parseTags(lead.tags).forEach(tag => { if (tag) leadsPorTag[tag.trim()] = (leadsPorTag[tag.trim()] || 0) + 1; }); });

    const leadsMortos = leadsCrmNoPeriodo.filter(l => l.stage === 'lead_morto');
    const ressuscitados = (allLeads || []).filter(l => {
      if (!l.ressuscitado_em) return false;
      const dt = new Date(l.ressuscitado_em);
      if (dt < dataLimiteInicio || dt > dataLimiteFim) return false;
      if (regiao && l.regiao !== regiao) return false;
      return true;
    });

    const leadsCrmPorDia: Record<string, number> = {};
    Object.keys(cadastrosPorDia).forEach(k => { leadsCrmPorDia[k] = 0; });
    leadsCrmNoPeriodo.forEach(l => { if (l.created_at) { const dia = l.created_at.split('T')[0]; if (leadsCrmPorDia[dia] !== undefined) leadsCrmPorDia[dia]++; } });

    // ═══ 3. BI ═══
    let emOperacao = 0;
    let tpEmOperacao = 0;
    let codsEmOperacaoSet = new Set<string>();
    try {
      const codigosAtivos = leadsPorAtivacao.map((l: any) => String(l.cod)).filter(Boolean);
      if (codigosAtivos.length > 0) {
        const biResult = await fetch(`${BI_API_URL}/api/crm/verificar-operacao`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}) },
          body: JSON.stringify({ codigos: codigosAtivos, dias: 30 }),
        }).then(r => r.json()).catch(() => null);

        emOperacao = biResult?.em_operacao ?? 0;

        if (biResult?.resultado) {
          codsEmOperacaoSet = new Set(biResult.resultado.filter((r: any) => r.em_operacao).map((r: any) => String(r.cod_profissional)));
          const codsTPAtivados = new Set(leadsTPAtivados.map(l => String(l.cod_profissional)));
          tpEmOperacao = Array.from(codsTPAtivados).filter(c => codsEmOperacaoSet.has(c)).length;
        }
      }
    } catch (err: any) { console.error('[Analytics] Erro BI:', err.message); }

    // ═══ 4. ALOCAÇÕES (mesmo período) ═══
    let totalAlocados = 0;
    let alocacoesPorOperador: Record<string, number> = {};
    try {
      const alocResp = await fetch(`${BI_API_URL}/api/crm/alocacao?limit=50000&todos=true`, {
        headers: { 'Content-Type': 'application/json', ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}) },
      }).then(r => r.json()).catch(() => ({ success: false, data: [] }));

      const todasAlocacoes: any[] = alocResp?.data || [];

      // Filtrar alocações criadas no período selecionado
      const alocacoesPeriodo = todasAlocacoes.filter((a: any) => {
        if (!a.created_at) return false;
        const d = a.created_at.split('T')[0];
        return d >= dataInicioStr && d <= dataFimStr;
      });

      totalAlocados = alocacoesPeriodo.length;

      // Agrupar por quem_alocou
      alocacoesPeriodo.forEach((a: any) => {
        const op = a.quem_alocou || 'N/I';
        alocacoesPorOperador[op] = (alocacoesPorOperador[op] || 0) + 1;
      });

      console.log(`[Analytics] Alocações período: ${totalAlocados}`);
    } catch (err: any) { console.error('[Analytics] Erro alocações:', err.message); }

    // ═══ RESPOSTA ═══
    const naoAtivados = totalCadastros - totalAtivos;
    const taxaConversao = totalCadastros > 0 ? Math.round((totalAtivos / totalCadastros) * 100) : 0;
    // Em Operação % baseado nos ATIVADOS (não no total)
    const taxaOperacao = totalAtivos > 0 ? Math.round((emOperacao / totalAtivos) * 100) : 0;
    const taxaPerda = leadsCrmNoPeriodo.length > 0 ? Math.round((leadsMortos.length / leadsCrmNoPeriodo.length) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        kpis: { totalCadastros, totalAtivos, totalAlocados, totalInativos, naoAtivados, mortos: leadsMortos.length, ressuscitados: ressuscitados.length, emOperacao, naoOperando: totalAtivos - emOperacao, taxaConversao, taxaOperacao, taxaPerda },
        funil: [
          { stage: 'Total Cadastros', quantidade: totalCadastros, cor: '#6366F1', base: totalCadastros },
          { stage: 'Ativados', quantidade: totalAtivos, cor: '#22C55E', base: totalCadastros },
          { stage: 'Alocados', quantidade: totalAlocados, cor: '#8B5CF6', base: totalAtivos },
          { stage: 'Em Operação', quantidade: emOperacao, cor: '#3B82F6', base: totalAtivos },
        ],
        funilTP: [
          { stage: 'Leads com Tag TP', quantidade: leadsComTP.length, cor: '#8B5CF6', base: leadsComTP.length },
          { stage: 'TP com Cadastro', quantidade: leadsTPComCadastro.length, cor: '#F59E0B', base: leadsComTP.length },
          { stage: 'TP Ativados', quantidade: leadsTPAtivados.length, cor: '#22C55E', base: leadsTPComCadastro.length },
          { stage: 'TP em Operação', quantidade: tpEmOperacao, cor: '#10B981', base: leadsTPAtivados.length },
        ],
        conversaoOperacao: { leadsAtivados: totalAtivos, emOperacao, naoOperando: totalAtivos - emOperacao, taxaReal: taxaOperacao },
        porRegiao: Object.entries(ativadosPorRegiao).map(([r, q]) => ({ regiao: r, quantidade: q })).sort((a, b) => b.quantidade - a.quantidade),
        naoAtivadosPorRegiao: Object.entries(naoAtivadosPorRegiao).map(([r, q]) => ({ regiao: r, quantidade: q })).sort((a, b) => b.quantidade - a.quantidade),
        tpPorRegiao: Object.entries(tpPorRegiao).map(([r, q]) => ({ regiao: r, quantidade: q })).sort((a, b) => b.quantidade - a.quantidade),
        porOperador: Object.entries(ativacoesPorOperador).map(([o, q]) => ({ operador: o, quantidade: q })).sort((a, b) => b.quantidade - a.quantidade),
        porOperadorAlocacao: Object.entries(alocacoesPorOperador).map(([o, q]) => ({ operador: o, quantidade: q })).sort((a, b) => b.quantidade - a.quantidade),
        porDia: Object.keys(cadastrosPorDia).map(data => ({ data, cadastros: cadastrosPorDia[data], leadsCrm: leadsCrmPorDia[data] || 0 })),
        mortos: leadsMortos.length,
        ressuscitados: { total: ressuscitados.length },
        filtros: { dataInicio: dataInicioStr, dataFim: dataFimStr, regiao: regiao || 'Todas' },
      },
    });
  } catch (error: any) {
    console.error('Erro analytics:', error);
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}
