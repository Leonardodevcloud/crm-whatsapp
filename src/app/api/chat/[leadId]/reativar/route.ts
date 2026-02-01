// ===========================================
// API: /api/chat/[leadId]/reativar
// POST: Reativar IA para o lead
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader, isAdmin } from '@/lib/auth';
import { reativarIA, getLeadById, userIdToUuid } from '@/lib/supabase';

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

    // Verificar se lead existe
    const lead = await getLeadById(leadIdNum);
    if (!lead) {
      return NextResponse.json(
        { error: 'Lead não encontrado', success: false },
        { status: 404 }
      );
    }

    // Verificar permissão (apenas owner ou admin pode reativar)
    const userUuid = userIdToUuid(user.id);
    if (lead.owner_user_id !== userUuid && !isAdmin(user)) {
      return NextResponse.json(
        { error: 'Sem permissão para reativar este atendimento', success: false },
        { status: 403 }
      );
    }

    // Reativar IA
    const success = await reativarIA(leadIdNum);

    if (!success) {
      return NextResponse.json(
        { error: 'Erro ao reativar IA', success: false },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'IA reativada com sucesso',
      data: {
        lead_id: leadIdNum,
        atendimento_ia: 'reativada',
      },
    });
  } catch (error: any) {
    console.error('Erro ao reativar IA:', error);
    return NextResponse.json(
      { error: 'Erro ao reativar IA', success: false, details: error.message },
      { status: 500 }
    );
  }
}
