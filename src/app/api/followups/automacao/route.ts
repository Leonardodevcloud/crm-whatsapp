// ===========================================
// API: /api/followups/automacao
// v3 - tatiane_followups + skip leads sem chat_lid
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin, updateLead } from '@/lib/supabase';
import { verificarStatusProfissional } from '@/lib/tutts-api';

const PRAZOS = {
  NOVO_SEM_MUDANCA: 3,
  QUALIFICADO_SEM_FINALIZAR: 3,
  APOS_FOLLOWUP_CONCLUIDO: 5,
  FOLLOWUP_NAO_ATENDIDO: 2,
};

const MOTIVOS = {
  NOVO: 'Formalizar cadastro no aplicativo',
  QUALIFICADO: 'Formalizar ativação',
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
      followupsCriados: 0,
      leadsMovidosParaMorto: 0,
      leadsRessuscitados: 0,
      erros: [] as string[],
    };

    const { data: leads, error: errorLeads } = await client
      .from('dados_cliente')
      .select('*')
      .eq('status', 'ativo')
      .in('stage', ['novo', 'qualificado', 'lead_morto']);

    if (errorLeads) throw errorLeads;

    console.log(`[Automação] Processando ${leads?.length || 0} leads...`);

    for (const lead of leads || []) {
      try {
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

        const { data: followups } = await client
          .from('tatiane_followups')
          .select('*')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false });

        const followupPendente = followups?.find((f: any) => f.status === 'pendente');
        const ultimoFollowupConcluido = followups?.find((f: any) => f.status === 'concluido');

        if (followupPendente && lead.stage !== 'lead_morto' && followupPendente.data_agendada) {
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
            console.log(`[Automação] Lead ${lead.id} → LEAD MORTO (atrasado ${diasAtrasado}d)`);
            continue;
          }
        }

        if (followupPendente) continue;
        if (lead.stage === 'lead_morto') continue;
        if (!lead.chat_lid) continue;

        const dataAtualizacao = new Date(lead.updated_at || lead.created_at);
        const diasParado = Math.floor((hoje.getTime() - dataAtualizacao.getTime()) / (1000 * 60 * 60 * 24));

        let deveCriarFollowup = false;
        let motivo = '';
        let sequencia = 1;

        if (lead.stage === 'novo' && diasParado >= PRAZOS.NOVO_SEM_MUDANCA) {
          deveCriarFollowup = true;
          motivo = MOTIVOS.NOVO;
        }

        if (lead.stage === 'qualificado' && diasParado >= PRAZOS.QUALIFICADO_SEM_FINALIZAR) {
          deveCriarFollowup = true;
          motivo = MOTIVOS.QUALIFICADO;
        }

        if (ultimoFollowupConcluido && !followupPendente && ultimoFollowupConcluido.enviado_em) {
          const dataConclusao = new Date(ultimoFollowupConcluido.enviado_em);
          const diasDesdeConclussao = Math.floor((hoje.getTime() - dataConclusao.getTime()) / (1000 * 60 * 60 * 24));

          if (diasDesdeConclussao >= PRAZOS.APOS_FOLLOWUP_CONCLUIDO) {
            deveCriarFollowup = true;
            motivo = lead.stage === 'novo' ? MOTIVOS.NOVO : MOTIVOS.QUALIFICADO;
            sequencia = (ultimoFollowupConcluido.sequencia || 1) + 1;
          }
        }

        if (deveCriarFollowup && motivo) {
          const maxSequencia = followups?.reduce((max: number, f: any) => Math.max(max, f.sequencia || 1), 0) || 0;

          const dataFollowup = new Date(hoje);
          dataFollowup.setDate(dataFollowup.getDate() + 1);

          await client
            .from('tatiane_followups')
            .insert({
              lead_id: lead.id,
              chat_lid: lead.chat_lid,
              data_agendada: dataFollowup.toISOString(),
              motivo,
              tipo: 'automatico',
              status: 'pendente',
              sequencia: Math.max(sequencia, maxSequencia + 1),
            });

          resultados.followupsCriados++;
          console.log(`[Automação] Follow-up criado para lead ${lead.id}: "${motivo}"`);
        }

      } catch (leadError: any) {
        resultados.erros.push(`Lead ${lead.id}: ${leadError.message}`);
      }
    }

    console.log(`[Automação] Concluído:`, resultados);

    return NextResponse.json({
      success: true,
      data: resultados,
      message: `Automação executada: ${resultados.followupsCriados} follow-ups criados, ${resultados.leadsMovidosParaMorto} leads mortos, ${resultados.leadsRessuscitados} ressuscitados`,
    });

  } catch (error: any) {
    console.error('Erro na automação:', error);
    return NextResponse.json(
      { error: 'Erro na automação', success: false, details: error.message },
      { status: 500 }
    );
  }
}
