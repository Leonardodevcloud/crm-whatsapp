// ===========================================
// API: /api/analytics
// GET: Retorna métricas e dados para o dashboard
// Inclui: Lead Morto, Taxa de Perda, Ressuscitados
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const { searchParams } = new URL(req.url);
    
    const periodo = searchParams.get('periodo') || '30';
    const regiao = searchParams.get('regiao') || undefined;
    
    const diasAtras = parseInt(periodo);
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasAtras);

    // Buscar todos os leads
    const { data: allLeads, error: errorLeads } = await client
      .from('dados_cliente')
      .select('id, stage, regiao, iniciado_por, created_at, updated_at, ressuscitado_em, vezes_ressuscitado')
      .eq('status', 'ativo');

    if (errorLeads) throw errorLeads;

    // Filtrar por período
    const leadsNoPeriodo = allLeads?.filter(lead => {
      if (!lead.created_at) return true;
      return new Date(lead.created_at) >= dataLimite;
    }) || [];

    // Filtrar por região
    const leadsFiltrados = regiao 
      ? leadsNoPeriodo.filter(lead => lead.regiao === regiao)
      : leadsNoPeriodo;

    // ============================================
    // CONTAGEM POR STAGE
    // ============================================
    const contagem = {
      novo: 0,
      qualificado: 0,
      finalizado: 0,
      lead_morto: 0,
      total: leadsFiltrados.length,
    };

    leadsFiltrados.forEach(lead => {
      let stage = lead.stage || 'novo';
      if (stage === 'em_atendimento' || stage === 'proposta') {
        stage = 'novo';
      }
      if (stage in contagem) {
        (contagem as any)[stage]++;
      }
    });

    // ============================================
    // RESSUSCITADOS
    // ============================================
    const ressuscitados = leadsFiltrados.filter(lead => 
      lead.ressuscitado_em && new Date(lead.ressuscitado_em) >= dataLimite
    );

    // ============================================
    // POR REGIÃO
    // ============================================
    const leadsPorRegiao: Record<string, number> = {};
    const conversaoPorRegiao: Record<string, { total: number; finalizados: number; mortos: number }> = {};

    leadsFiltrados.forEach(lead => {
      const reg = lead.regiao || 'Sem região';
      leadsPorRegiao[reg] = (leadsPorRegiao[reg] || 0) + 1;
      
      if (!conversaoPorRegiao[reg]) {
        conversaoPorRegiao[reg] = { total: 0, finalizados: 0, mortos: 0 };
      }
      conversaoPorRegiao[reg].total++;
      
      let stage = lead.stage || 'novo';
      if (stage === 'finalizado') conversaoPorRegiao[reg].finalizados++;
      if (stage === 'lead_morto') conversaoPorRegiao[reg].mortos++;
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
    // ============================================
    const porIniciador = {
      lead: { total: 0, finalizados: 0, mortos: 0 },
      humano: { total: 0, finalizados: 0, mortos: 0 },
    };

    leadsFiltrados.forEach(lead => {
      const iniciador = lead.iniciado_por === 'humano' ? 'humano' : 'lead';
      porIniciador[iniciador].total++;
      
      let stage = lead.stage || 'novo';
      if (stage === 'finalizado') porIniciador[iniciador].finalizados++;
      if (stage === 'lead_morto') porIniciador[iniciador].mortos++;
    });

    // ============================================
    // LEADS POR DIA (últimos 7 dias)
    // ============================================
    const hoje = new Date();
    const leadsPorDia: Record<string, number> = {};
    
    for (let i = 6; i >= 0; i--) {
      const data = new Date(hoje);
      data.setDate(data.getDate() - i);
      const chave = data.toISOString().split('T')[0];
      leadsPorDia[chave] = 0;
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
    // TEMPO MÉDIO
    // ============================================
    let tempoMedioFinalizacao = 0;
    const finalizados = leadsFiltrados.filter(l => l.stage === 'finalizado');

    if (finalizados.length > 0) {
      const tempos = finalizados
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
          total: contagem.total,
          novos: contagem.novo,
          qualificados: contagem.qualificado,
          finalizados: contagem.finalizado,
          mortos: contagem.lead_morto,
          ressuscitados: ressuscitados.length,
          taxaConversao,
          taxaPerda,
        },
        
        // Funil (incluindo mortos)
        funil: [
          { stage: 'Novo', quantidade: contagem.novo, cor: '#3B82F6' },
          { stage: 'Qualificado', quantidade: contagem.qualificado, cor: '#EAB308' },
          { stage: 'Finalizado', quantidade: contagem.finalizado, cor: '#22C55E' },
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
          periodo: diasAtras,
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
