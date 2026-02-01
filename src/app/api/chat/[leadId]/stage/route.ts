// ===========================================
// API: /api/chat/[leadId]/stage
// POST: Atualizar stage do lead
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader, isAdmin } from '@/lib/auth';
import { updateLead, getLeadById, userIdToUuid } from '@/lib/supabase';

// Stages válidos
const VALID_STAGES = ['novo', 'em_atendimento', 'qualificado', 'proposta', 'finalizado'];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  // Verificar autenticação
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json(
      { error: 'Não autenticado', success: false },
      { status: 401 }
    );
  }

  try {
    const { leadId } = await params;
    const leadIdNum = parseInt(leadId);

    if (isNaN(leadIdNum)) {
      return NextResponse.json(
        { error: 'ID do lead inválido', success: false },
        { status: 400 }
      );
    }

    // Parsear body
    const body = await req.json();
    const { stage } = body;

    if (!stage || !VALID_STAGES.includes(stage)) {
      return NextResponse.json(
        { 
          error: 'Stage inválido', 
          success: false,
          valid_stages: VALID_STAGES,
        },
        { status: 400 }
      );
    }

    // Verificar se lead existe
    const lead = await getLeadById(leadIdNum);
    if (!lead) {
      return NextResponse.json(
        { error: 'Lead não encontrado', success: false },
        { status: 404 }
      );
    }

    // Verificar permissão (apenas owner ou admin pode alterar stage)
    const userUuid = userIdToUuid(user.id);
    if (lead.owner_user_id && lead.owner_user_id !== userUuid && !isAdmin(user)) {
      return NextResponse.json(
        { error: 'Sem permissão para alterar este lead', success: false },
        { status: 403 }
      );
    }

    // Atualizar stage
    const updatedLead = await updateLead(leadIdNum, { stage });

    return NextResponse.json({
      success: true,
      message: `Stage atualizado para "${stage}"`,
      data: updatedLead,
    });
  } catch (error: any) {
    console.error('Erro ao atualizar stage:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar stage', success: false, details: error.message },
      { status: 500 }
    );
  }
}
