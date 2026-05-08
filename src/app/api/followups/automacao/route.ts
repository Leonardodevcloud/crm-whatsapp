// ===========================================
// API: /api/followups/automacao
// POST: Manutenção automática de leads
// - Move leads para "lead_morto" se follow-up atrasado 2+ dias
// - Ressuscita leads mortos que ficaram ativos no Tutts
//
// IMPORTANTE: ESTE ENDPOINT NÃO CRIA MAIS FOLLOW-UPS.
// A criação de follow-ups automáticos é responsabilidade exclusiva do
// Worker da Tatiane (followup.worker.js > processarFollowupsAutomaticos),
// que detecta leads parados, gera mensagem com IA e envia direto via Z-API.
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { verificarStatusProfissional } from '@/lib/tutts-api';

const PRAZOS = {
  FOLLOWUP_NAO_ATENDIDO: 2, // 2 dias com follow-up atrasado = lead morto
};

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const hoje = new Date();

    const resultados = {
      leadsMovidosParaMorto: 0,
      leadsRessuscitados: 0,
      erros: [] as string[],
    };

    // ============================================
    // BUSCAR LEADS ATIVOS (novos, qualificados ou mortos pra ressuscitar)
    // ============================================
    const { data: leads, error: errorLeads } = await client
      .from('dados_cliente')
      .select('*')
      .eq('status', 'ativo')
      .in('stage', ['novo', 'qualificado', 'lead_morto']);

    if (errorLeads) throw errorLeads;

    console.log(`[Automação] Processando ${leads?.length || 0} leads (manutenção apenas)...`);

    for (const lead of leads || []) {
      try {
        // ============================================
        // 1. RESSUSCITAR LEADS MORTOS QUE VIRARAM ATIVOS
        // ============================================
        if (lead.stage === 'lead_morto' && lead.telefone) {
          const statusTutts = await verificarStatusProfissional(lead.telefone);

          if (statusTutts.found && statusTutts.ativo) {
            await client
              .from('dados_cliente')
              .update({
                stage: 'finalizado',
                ressuscitado_em: new Date().toISOString(),
                vezes_ressuscitado: (lead.vezes_ressuscitado || 0) + 1,
                updated_at: new Date().toISOString(),
              })
              .eq('id', lead.id);

            resultados.leadsRessuscitados++;
            console.log(`[Automação] Lead ${lead.id} RESSUSCITADO!`);
            continue;
          }
        }

        // ============================================
        // 2. MOVER LEADS COM FOLLOW-UP MUITO ATRASADO PRA "LEAD_MORTO"
        // (Worker Tatiane também cancela follow-up de lead_morto, mas é redundância
        //  útil — captura casos onde lead atrasou follow-up e depois sumiu)
        // ============================================
        if (lead.stage !== 'lead_morto') {
          const { data: pendentes } = await client
            .from('tatiane_followups')
            .select('id, data_agendada')
            .eq('lead_id', lead.id)
            .eq('status', 'pendente')
            .order('data_agendada', { ascending: false })
            .limit(1);

          const followupPendente = pendentes?.[0];
          if (followupPendente) {
            const dataAgendada = new Date(followupPendente.data_agendada);
            const diasAtrasado = Math.floor((hoje.getTime() - dataAgendada.getTime()) / (1000 * 60 * 60 * 24));

            if (diasAtrasado >= PRAZOS.FOLLOWUP_NAO_ATENDIDO) {
              await client
                .from('dados_cliente')
                .update({
                  stage: 'lead_morto',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', lead.id);

              await client
                .from('tatiane_followups')
                .update({ status: 'cancelado' })
                .eq('id', followupPendente.id);

              resultados.leadsMovidosParaMorto++;
              console.log(`[Automação] Lead ${lead.id} → lead_morto (follow-up atrasado ${diasAtrasado}d)`);
            }
          }
        }

      } catch (leadError: any) {
        resultados.erros.push(`Lead ${lead.id}: ${leadError.message}`);
      }
    }

    console.log('[Automação] Concluído:', resultados);

    return NextResponse.json({
      success: true,
      data: resultados,
      message: `Manutenção: ${resultados.leadsMovidosParaMorto} leads mortos, ${resultados.leadsRessuscitados} ressuscitados`,
    });

  } catch (error: any) {
    console.error('Erro na automação:', error);
    return NextResponse.json(
      { error: 'Erro na automação', success: false, details: error.message },
      { status: 500 }
    );
  }
}
