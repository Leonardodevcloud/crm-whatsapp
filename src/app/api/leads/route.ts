// ===========================================
// API: /api/leads
// GET: Lista leads para Kanban
// v3 - Adaptado para tatiane_followups + resumo de tatiane_resumos
// v4 - Suporte a ?incluir_arquivados=true
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { getKanbanLeads, updateLead } from '@/lib/supabase';
import { verificarStatusProfissional, determinarNovoStage } from '@/lib/tutts-api';

async function verificarLeadsBackground(leads: any[]) {
  const leadsParaVerificar = leads.filter(
    lead => lead.stage !== 'finalizado' && lead.telefone
  ).slice(0, 20);

  if (leadsParaVerificar.length === 0) return;

  console.log(`[Background] Verificando ${leadsParaVerificar.length} leads na API Tutts...`);

  let atualizados = 0;
  for (const lead of leadsParaVerificar) {
    try {
      const statusTutts = await verificarStatusProfissional(lead.telefone!);
      const novoStage = determinarNovoStage(statusTutts, lead.stage || 'novo');

      if (novoStage && novoStage !== lead.stage) {
        console.log(`[Background] Lead ${lead.id}: ${lead.stage} -> ${novoStage}`);
        await updateLead(lead.id, { stage: novoStage });
        atualizados++;
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (err) {
      console.error(`[Background] Erro no lead ${lead.id}:`, err);
    }
  }

  console.log(`[Background] Concluído: ${atualizados} leads atualizados`);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json(
      { error: 'Não autenticado', success: false },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const regiao = searchParams.get('regiao') || undefined;
    const iniciado_por = searchParams.get('iniciado_por') || undefined;
    const incluirArquivados = searchParams.get('incluir_arquivados') === 'true';

    const leads = await getKanbanLeads({ regiao, iniciado_por, incluirArquivados });

    verificarLeadsBackground([...leads]).catch(err => {
      console.error('[Background] Erro na verificação:', err);
    });

    const grouped: Record<string, any[]> = {
      novo: [],
      qualificado: [],
      finalizado: [],
      lead_morto: [],
    };

    leads.forEach((lead) => {
      let stage = lead.stage || 'novo';
      if (stage === 'em_atendimento' || stage === 'proposta') {
        stage = 'novo';
      }

      const followupsArr = lead.followups || lead.tatiane_followups || [];
      const followupPendente = followupsArr
        .filter((f: any) => f.status === 'pendente')
        .sort((a: any, b: any) => (a.data_agendada || '').localeCompare(b.data_agendada || ''))[0];

      if (grouped[stage]) {
        grouped[stage].push({
          lead_id: lead.id,
          lead_uuid: lead.uuid,
          nomewpp: lead.nomewpp,
          telefone: lead.telefone,
          stage: stage,
          status: lead.status, // 'ativo' ou 'arquivado' — UI usa pra mostrar badge/botão
          atendimento_ia: lead.atendimento_ia,
          tags: lead.tags || [],
          regiao: lead.regiao,
          iniciado_por: lead.iniciado_por,
          updated_at: lead.updated_at,
          ressuscitado_em: lead.ressuscitado_em,
          vezes_ressuscitado: lead.vezes_ressuscitado,
          cod_profissional: lead.cod_profissional,
          followup_data: followupPendente?.data_agendada || null,
          followup_motivo: followupPendente?.motivo || null,
          resumo_ia: lead.resumo_ia || null,
        });
      }
    });

    return NextResponse.json({
      success: true,
      data: grouped,
      total: leads.length,
      filters: { regiao, iniciado_por, incluirArquivados },
    });
  } catch (error: any) {
    console.error('Erro na API leads:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar leads', success: false, details: error.message },
      { status: 500 }
    );
  }
}
