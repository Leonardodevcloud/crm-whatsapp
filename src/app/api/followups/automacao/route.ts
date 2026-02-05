// ===========================================
// API: /api/followups/automacao
// POST: Executa automação de follow-ups
// - Cria follow-ups automáticos para leads parados
// - Move leads para "lead_morto" se necessário
// - Ressuscita leads mortos que ficaram ativos
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin, updateLead } from '@/lib/supabase';
import { verificarStatusProfissional } from '@/lib/tutts-api';

// Configurações de prazos (em dias)
const PRAZOS = {
  NOVO_SEM_MUDANCA: 3,           // 3 dias novo sem qualificar/finalizar
  QUALIFICADO_SEM_FINALIZAR: 3, // 3 dias qualificado sem finalizar
  APOS_FOLLOWUP_CONCLUIDO: 5,   // 5 dias após concluir follow-up
  FOLLOWUP_NAO_ATENDIDO: 2,     // 2 dias com follow-up atrasado = lead morto
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
    const hojeStr = hoje.toISOString().split('T')[0];
    
    const resultados = {
      followupsCriados: 0,
      leadsMovidosParaMorto: 0,
      leadsRessuscitados: 0,
      erros: [] as string[],
    };

    // ============================================
    // 1. BUSCAR TODOS OS LEADS ATIVOS
    // ============================================
    const { data: leads, error: errorLeads } = await client
      .from('dados_cliente')
      .select('*')
      .eq('status', 'ativo')
      .in('stage', ['novo', 'qualificado', 'lead_morto']);

    if (errorLeads) throw errorLeads;

    console.log(`[Automação] Processando ${leads?.length || 0} leads...`);

    for (const lead of leads || []) {
      try {
        // ============================================
        // 2. VERIFICAR LEADS MORTOS PARA RESSUSCITAR
        // ============================================
        if (lead.stage === 'lead_morto' && lead.telefone) {
          const statusTutts = await verificarStatusProfissional(lead.telefone);
          
          if (statusTutts.found && statusTutts.ativo) {
            // Lead está ativo no Tutts! Ressuscitar!
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
        // 3. BUSCAR FOLLOW-UPS DO LEAD
        // ============================================
        const { data: followups } = await client
          .from('followups')
          .select('*')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false });

        const followupPendente = followups?.find(f => f.status === 'pendente');
        const ultimoFollowupConcluido = followups?.find(f => f.status === 'concluido');

        // ============================================
        // 4. VERIFICAR SE FOLLOW-UP ESTÁ MUITO ATRASADO
        // ============================================
        if (followupPendente && lead.stage !== 'lead_morto') {
          const dataAgendada = new Date(followupPendente.data_agendada);
          const diasAtrasado = Math.floor((hoje.getTime() - dataAgendada.getTime()) / (1000 * 60 * 60 * 24));

          if (diasAtrasado >= PRAZOS.FOLLOWUP_NAO_ATENDIDO) {
            // Follow-up atrasado há 2+ dias = Lead Morto
            await client
              .from('dados_cliente')
              .update({
                stage: 'lead_morto',
                updated_at: new Date().toISOString(),
              })
              .eq('id', lead.id);

            // Cancelar follow-up
            await client
              .from('followups')
              .update({ status: 'cancelado' })
              .eq('id', followupPendente.id);

            resultados.leadsMovidosParaMorto++;
            console.log(`[Automação] Lead ${lead.id} movido para LEAD MORTO (follow-up atrasado ${diasAtrasado} dias)`);
            continue;
          }
        }

        // ============================================
        // 5. CRIAR FOLLOW-UP AUTOMÁTICO SE NECESSÁRIO
        // ============================================
        
        // Pular se já tem follow-up pendente
        if (followupPendente) continue;
        
        // Pular se é lead morto
        if (lead.stage === 'lead_morto') continue;

        const dataAtualizacao = new Date(lead.updated_at || lead.created_at);
        const diasParado = Math.floor((hoje.getTime() - dataAtualizacao.getTime()) / (1000 * 60 * 60 * 24));

        let deveCriarFollowup = false;
        let motivo = '';
        let sequencia = 1;

        // Cenário A: Lead NOVO parado há 3+ dias
        if (lead.stage === 'novo' && diasParado >= PRAZOS.NOVO_SEM_MUDANCA) {
          deveCriarFollowup = true;
          motivo = MOTIVOS.NOVO;
        }

        // Cenário B: Lead QUALIFICADO parado há 3+ dias
        if (lead.stage === 'qualificado' && diasParado >= PRAZOS.QUALIFICADO_SEM_FINALIZAR) {
          deveCriarFollowup = true;
          motivo = MOTIVOS.QUALIFICADO;
        }

        // Cenário C: Follow-up foi concluído há 5+ dias e ainda não finalizou
        if (ultimoFollowupConcluido && !followupPendente) {
          const dataConclusao = new Date(ultimoFollowupConcluido.completed_at);
          const diasDesdeConclussao = Math.floor((hoje.getTime() - dataConclusao.getTime()) / (1000 * 60 * 60 * 24));

          if (diasDesdeConclussao >= PRAZOS.APOS_FOLLOWUP_CONCLUIDO) {
            deveCriarFollowup = true;
            motivo = lead.stage === 'novo' ? MOTIVOS.NOVO : MOTIVOS.QUALIFICADO;
            sequencia = (ultimoFollowupConcluido.sequencia || 1) + 1;
          }
        }

        // Criar follow-up se necessário
        if (deveCriarFollowup && motivo) {
          // Calcular próxima sequência
          const maxSequencia = followups?.reduce((max, f) => Math.max(max, f.sequencia || 1), 0) || 0;
          
          const dataFollowup = new Date(hoje);
          dataFollowup.setDate(dataFollowup.getDate() + 1); // Agendar para amanhã

          await client
            .from('followups')
            .insert({
              lead_id: lead.id,
              data_agendada: dataFollowup.toISOString().split('T')[0],
              motivo,
              tipo: 'automatico',
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
