// ===========================================
// API: /api/analytics
// GET: Retorna métricas e dados para o dashboard
// Inclui: Lead Morto, Taxa de Perda, Ressuscitados
// Cruza dados CRM + Planilha Profissionais para Ativados
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const PLANILHA_CSV_URL = 'https://docs.google.com/spreadsheets/d/1d7jI-q7OjhH5vU69D3Vc_6Boc9xjLZPVR8efjMo1yAE/export?format=csv&gid=0';

function parseCSV(csvText: string): Record<string, string>[] {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const linhas = cleanText.split('\n');
  if (linhas.length < 2) return [];
  const headers = linhas[0].split(',').map(h => h.trim().replace(/"/g, '').replace(/^\uFEFF/, ''));
  const dados: Record<string, string>[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.trim()) continue;
    const valores = linha.split(',').map(v => v.trim().replace(/"/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => { obj[header] = valores[index] || ''; });
    dados.push(obj);
  }
  return dados;
}

function parseDateBR(dateStr: string): Date | null {
  if (!dateStr || !dateStr.trim()) return null;
  const partes = dateStr.trim().split('/');
  if (partes.length === 3) {
    return new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const { searchParams } = new URL(req.url);
    
    const regiao = searchParams.get('regiao') || undefined;
    
    // Período por data: dataInicio e dataFim (YYYY-MM-DD)
    // Fallback: mês vigente
    const hoje = new Date();
    const defaultInicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const defaultFim = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
    
    const dataInicioStr = searchParams.get('dataInicio') || defaultInicio;
    const dataFimStr = searchParams.get('dataFim') || defaultFim;
    
    const dataLimiteInicio = new Date(dataInicioStr + 'T00:00:00');
    const dataLimiteFim = new Date(dataFimStr + 'T23:59:59');

    // Buscar todos os leads
    const { data: allLeads, error: errorLeads } = await client
      .from('dados_cliente')
      .select('id, stage, regiao, iniciado_por, created_at, updated_at, ressuscitado_em, vezes_ressuscitado, tags, owner_user_id, cod_profissional')
      .eq('status', 'ativo');

    if (errorLeads) throw errorLeads;

    // ============================================
    // DOIS CONJUNTOS DE FILTRO:
    // 1) leadsFiltrados = created_at no período (para Novos, Total, Qualificados, porDia, Tags)
    // 2) leadsAtivadosNoPeriodo = stage=finalizado + updated_at no período (para Ativados, Região)
    // ============================================

    // 1) Leads que ENTRARAM no período (created_at)
    const leadsNoPeriodo = allLeads?.filter(lead => {
      if (!lead.created_at) return false;
      const dt = new Date(lead.created_at);
      return dt >= dataLimiteInicio && dt <= dataLimiteFim;
    }) || [];

    const leadsFiltrados = regiao 
      ? leadsNoPeriodo.filter(lead => lead.regiao === regiao)
      : leadsNoPeriodo;

    // 2) Leads que foram ATIVADOS no período (updated_at, stage=finalizado)
    //    Independe de quando foram criados — se foi ativado no período, conta
    const leadsAtivadosCRM = (allLeads || []).filter(lead => {
      if (lead.stage !== 'finalizado') return false;
      if (!lead.updated_at) return false;
      const dt = new Date(lead.updated_at);
      if (dt < dataLimiteInicio || dt > dataLimiteFim) return false;
      if (regiao && lead.regiao !== regiao) return false;
      return true;
    });

    // ============================================
    // BUSCAR PLANILHA PROFISSIONAIS (fonte mais assertiva)
    // Cruzar com CRM, deduplicar por código
    // ============================================
    let profissionaisNoPeriodo: Array<{ codigo: string; regiao: string }> = [];
    try {
      const planilhaResp = await fetch(PLANILHA_CSV_URL, { headers: { 'Accept': 'text/csv' } });
      if (planilhaResp.ok) {
        const csvText = await planilhaResp.text();
        const dadosPlanilha = parseCSV(csvText);
        
        dadosPlanilha.forEach(row => {
          const codigo = row['Código'] || row['Codigo'] || row['codigo'] || '';
          const cidade = (row['Cidade'] || row['cidade'] || '').toUpperCase();
          const dataAtivacao = row['Data Ativação'] || row['Data Ativacao'] || row['data ativação'] || row['data ativacao'] || '';
          
          if (!codigo) return;
          
          // Filtrar por data
          const dt = parseDateBR(dataAtivacao);
          if (!dt || dt < dataLimiteInicio || dt > dataLimiteFim) return;
          
          // Filtrar por região
          if (regiao && cidade !== regiao.toUpperCase()) return;
          
          profissionaisNoPeriodo.push({ codigo, regiao: cidade });
        });
      }
    } catch (err) {
      console.error('[Analytics] Erro ao buscar planilha profissionais:', err);
    }

    // ============================================
    // MERGE: CRM + Planilha (deduplicado por código)
    // Se existe em ambos, conta apenas 1
    // ============================================
    const codigosVistos = new Set<string>();
    const ativadosMerged: Array<{ regiao: string; fonte: string }> = [];

    // Primeiro: profissionais da planilha (fonte mais assertiva)
    profissionaisNoPeriodo.forEach(p => {
      const codLimpo = p.codigo.replace(/\D/g, '');
      if (codLimpo && !codigosVistos.has(codLimpo)) {
        codigosVistos.add(codLimpo);
        ativadosMerged.push({ regiao: p.regiao, fonte: 'planilha' });
      }
    });

    // Depois: CRM (só adiciona se código não foi visto na planilha)
    leadsAtivadosCRM.forEach(lead => {
      const codLimpo = lead.cod_profissional ? String(lead.cod_profissional).replace(/\D/g, '') : '';
      if (codLimpo && codigosVistos.has(codLimpo)) return; // já contou pela planilha
      if (codLimpo) codigosVistos.add(codLimpo);
      ativadosMerged.push({ regiao: (lead.regiao || '').toUpperCase(), fonte: 'crm' });
    });

    const leadsAtivadosNoPeriodo = ativadosMerged;

    // 3) Leads que MORRERAM no período (updated_at, stage=lead_morto)
    const leadsMortosNoPeriodo = (allLeads || []).filter(lead => {
      if (lead.stage !== 'lead_morto') return false;
      if (!lead.updated_at) return false;
      const dt = new Date(lead.updated_at);
      if (dt < dataLimiteInicio || dt > dataLimiteFim) return false;
      if (regiao && lead.regiao !== regiao) return false;
      return true;
    });

    // ============================================
    // CONTAGEM POR STAGE
    // Novos e Qualificados = por created_at
    // Ativados e Mortos = por updated_at
    // ============================================
    const contagemEntrada = { novo: 0, qualificado: 0 };
    leadsFiltrados.forEach(lead => {
      let stage = lead.stage || 'novo';
      if (stage === 'em_atendimento' || stage === 'proposta') stage = 'novo';
      if (stage === 'novo') contagemEntrada.novo++;
      if (stage === 'qualificado') contagemEntrada.qualificado++;
    });

    const contagem = {
      novo: contagemEntrada.novo,
      qualificado: contagemEntrada.qualificado,
      finalizado: leadsAtivadosNoPeriodo.length,
      lead_morto: leadsMortosNoPeriodo.length,
      total: leadsFiltrados.length,
    };

    // ============================================
    // RESSUSCITADOS
    // ============================================
    const ressuscitados = (allLeads || []).filter(lead => {
      if (!lead.ressuscitado_em) return false;
      const dt = new Date(lead.ressuscitado_em);
      if (dt < dataLimiteInicio || dt > dataLimiteFim) return false;
      if (regiao && lead.regiao !== regiao) return false;
      return true;
    });

    // ============================================
    // POR REGIÃO (Ativados = por updated_at)
    // ============================================
    const leadsPorRegiao: Record<string, number> = {};
    const conversaoPorRegiao: Record<string, { total: number; finalizados: number; mortos: number }> = {};

    // Região dos ativados (updated_at no período)
    leadsAtivadosNoPeriodo.forEach(lead => {
      const reg = lead.regiao || 'Sem região';
      leadsPorRegiao[reg] = (leadsPorRegiao[reg] || 0) + 1;
    });

    // conversaoPorRegiao: entrada (created_at) + ativados/mortos (updated_at)
    leadsFiltrados.forEach(lead => {
      const reg = (lead.regiao || 'Sem região').toUpperCase();
      if (!conversaoPorRegiao[reg]) {
        conversaoPorRegiao[reg] = { total: 0, finalizados: 0, mortos: 0 };
      }
      conversaoPorRegiao[reg].total++;
    });
    // conversaoPorRegiao: CRM-only para manter proporção coerente
    // total = entrada (created_at), finalizados/mortos = CRM (updated_at)
    leadsAtivadosCRM.forEach(lead => {
      const reg = (lead.regiao || 'Sem região').toUpperCase();
      if (!conversaoPorRegiao[reg]) {
        conversaoPorRegiao[reg] = { total: 0, finalizados: 0, mortos: 0 };
      }
      conversaoPorRegiao[reg].finalizados++;
    });
    leadsMortosNoPeriodo.forEach(lead => {
      const reg = (lead.regiao || 'Sem região').toUpperCase();
      if (!conversaoPorRegiao[reg]) {
        conversaoPorRegiao[reg] = { total: 0, finalizados: 0, mortos: 0 };
      }
      conversaoPorRegiao[reg].mortos++;
    });

    // Top 5 regiões
    const topRegioes = Object.entries(conversaoPorRegiao)
      .map(([regiao, dados]) => ({
        regiao,
        total: dados.total,
        finalizados: dados.finalizados,
        mortos: dados.mortos,
        taxaConversao: dados.total > 0 ? Math.round((dados.finalizados / dados.total) * 100) : 0,
        taxaPerda: dados.total > 0 ? Math.round((dados.mortos / dados.total) * 100) : 0,
      }))
      .sort((a, b) => b.finalizados - a.finalizados)
      .slice(0, 5);

    // ============================================
    // POR INICIADOR
    // Total = leads que entraram (created_at)
    // Finalizados/Mortos = por updated_at
    // ============================================
    const porIniciador = {
      lead: { total: 0, finalizados: 0, mortos: 0 },
      humano: { total: 0, finalizados: 0, mortos: 0 },
    };

    leadsFiltrados.forEach(lead => {
      const iniciador = lead.iniciado_por === 'humano' ? 'humano' : 'lead';
      porIniciador[iniciador].total++;
    });

    leadsAtivadosCRM.forEach(lead => {
      const iniciador = lead.iniciado_por === 'humano' ? 'humano' : 'lead';
      porIniciador[iniciador].finalizados++;
    });

    leadsMortosNoPeriodo.forEach(lead => {
      const iniciador = lead.iniciado_por === 'humano' ? 'humano' : 'lead';
      porIniciador[iniciador].mortos++;
    });

    // ============================================
    // LEADS POR DIA (dentro do período selecionado, até hoje)
    // ============================================
    const leadsPorDia: Record<string, number> = {};
    
    // Gerar chaves para cada dia do período (mas não passar de hoje)
    const hojeGrafico = new Date();
    hojeGrafico.setHours(23, 59, 59, 999);
    const diaAtual = new Date(dataLimiteInicio);
    const limiteGrafico = dataLimiteFim < hojeGrafico ? dataLimiteFim : hojeGrafico;
    while (diaAtual <= limiteGrafico) {
      const chave = diaAtual.toISOString().split('T')[0];
      leadsPorDia[chave] = 0;
      diaAtual.setDate(diaAtual.getDate() + 1);
    }

    leadsFiltrados.forEach(lead => {
      if (lead.created_at) {
        const dataLead = lead.created_at.split('T')[0];
        if (leadsPorDia[dataLead] !== undefined) {
          leadsPorDia[dataLead]++;
        }
      }
    });

    // ============================================
    // POR TAGS (Tráfego Pago)
    // ============================================
    const leadsPorTag: Record<string, number> = {};
    leadsFiltrados.forEach(lead => {
      const tags = lead.tags;
      if (Array.isArray(tags)) {
        tags.forEach((tag: string) => {
          if (tag && tag.trim()) {
            leadsPorTag[tag.trim()] = (leadsPorTag[tag.trim()] || 0) + 1;
          }
        });
      }
    });

    // ============================================
    // POR OPERADOR (owner_user_id)
    // ============================================
    const leadsPorOperador: Record<string, number> = {};
    leadsFiltrados.forEach(lead => {
      if (lead.owner_user_id) {
        // Extrair ID numérico do UUID
        const lastPart = lead.owner_user_id.split('-').pop() || '';
        const userId = parseInt(lastPart, 10).toString();
        const label = `Operador ${userId}`;
        leadsPorOperador[label] = (leadsPorOperador[label] || 0) + 1;
      }
    });

    // ============================================
    // LEADS NÃO INICIADOS (da tabela leads_nao_iniciados)
    // ============================================
    const { data: naoIniciadosData, count: totalNaoIniciados } = await client
      .from('leads_nao_iniciados')
      .select('id, regiao', { count: 'exact' });

    // Agrupar não iniciados por região
    const naoIniciadosPorRegiao: Record<string, number> = {};
    (naoIniciadosData || []).forEach(lead => {
      const reg = (lead.regiao || 'Sem região').toUpperCase();
      naoIniciadosPorRegiao[reg] = (naoIniciadosPorRegiao[reg] || 0) + 1;
    });

    // ============================================
    // TEMPO MÉDIO (dos ativados no período por updated_at)
    // ============================================
    let tempoMedioFinalizacao = 0;

    if (leadsAtivadosCRM.length > 0) {
      const tempos = leadsAtivadosCRM
        .filter(l => l.created_at && l.updated_at)
        .map(l => {
          const inicio = new Date(l.created_at!).getTime();
          const fim = new Date(l.updated_at!).getTime();
          return (fim - inicio) / (1000 * 60 * 60);
        });
      
      if (tempos.length > 0) {
        tempoMedioFinalizacao = tempos.reduce((a, b) => a + b, 0) / tempos.length;
      }
    }

    // ============================================
    // RESPOSTA
    // ============================================
    const taxaConversao = contagem.total > 0 
      ? Math.round((contagem.finalizado / contagem.total) * 100) 
      : 0;

    const taxaPerda = contagem.total > 0 
      ? Math.round((contagem.lead_morto / contagem.total) * 100) 
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        // KPIs
        kpis: {
          total: contagem.total + (totalNaoIniciados || 0),
          novos: contagem.novo,
          qualificados: contagem.qualificado,
          finalizados: contagem.finalizado,
          mortos: contagem.lead_morto,
          naoIniciados: totalNaoIniciados || 0,
          ressuscitados: ressuscitados.length,
          taxaConversao,
          taxaPerda,
        },
        
        // Funil (incluindo mortos)
        funil: [
          { stage: 'Leads Novos', quantidade: contagem.novo, cor: '#3B82F6' },
          { stage: 'Cadastro Realizado', quantidade: contagem.qualificado, cor: '#EAB308' },
          { stage: 'Leads Ativados', quantidade: contagem.finalizado, cor: '#22C55E' },
          { stage: 'Lead Morto', quantidade: contagem.lead_morto, cor: '#6B7280' },
        ],
        
        // Por região
        porRegiao: Object.entries(leadsPorRegiao)
          .map(([regiao, quantidade]) => ({ regiao, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade)
          .slice(0, 10),
        
        // Top regiões
        topRegioes,
        
        // Por iniciador
        porIniciador: {
          lead: {
            ...porIniciador.lead,
            taxaConversao: porIniciador.lead.total > 0 
              ? Math.round((porIniciador.lead.finalizados / porIniciador.lead.total) * 100)
              : 0,
            taxaPerda: porIniciador.lead.total > 0 
              ? Math.round((porIniciador.lead.mortos / porIniciador.lead.total) * 100)
              : 0,
          },
          humano: {
            ...porIniciador.humano,
            taxaConversao: porIniciador.humano.total > 0 
              ? Math.round((porIniciador.humano.finalizados / porIniciador.humano.total) * 100)
              : 0,
            taxaPerda: porIniciador.humano.total > 0 
              ? Math.round((porIniciador.humano.mortos / porIniciador.humano.total) * 100)
              : 0,
          },
        },
        
        // Por dia
        porDia: Object.entries(leadsPorDia).map(([data, quantidade]) => ({
          data,
          quantidade,
        })),
        
        // Por tags (tráfego pago)
        porTags: Object.entries(leadsPorTag)
          .map(([tag, quantidade]) => ({ tag, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade)
          .slice(0, 15),
        
        // Por operador
        porOperador: Object.entries(leadsPorOperador)
          .map(([operador, quantidade]) => ({ operador, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade)
          .slice(0, 10),
        
        // Não iniciados por região
        naoIniciadosPorRegiao: Object.entries(naoIniciadosPorRegiao)
          .map(([regiao, quantidade]) => ({ regiao, quantidade }))
          .sort((a, b) => b.quantidade - a.quantidade),
        
        // Tempo médio
        tempoMedio: {
          finalizacaoHoras: Math.round(tempoMedioFinalizacao * 10) / 10,
          finalizacaoDias: Math.round((tempoMedioFinalizacao / 24) * 10) / 10,
        },

        // Ressuscitados detalhes
        ressuscitados: {
          total: ressuscitados.length,
          leads: ressuscitados.slice(0, 10).map(l => ({
            id: l.id,
            ressuscitado_em: l.ressuscitado_em,
            vezes: l.vezes_ressuscitado,
          })),
        },
        
        // Filtros
        filtros: {
          dataInicio: dataInicioStr,
          dataFim: dataFimStr,
          regiao: regiao || 'Todas',
        },
      },
    });
  } catch (error: any) {
    console.error('Erro na API analytics:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar analytics', success: false, details: error.message },
      { status: 500 }
    );
  }
}
