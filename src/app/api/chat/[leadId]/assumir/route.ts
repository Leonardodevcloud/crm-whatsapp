// ===========================================
// API: /api/chat/[leadId]/assumir
// POST: Assumir atendimento (first-write-wins)
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { assumirAtendimento, getLeadById, userIdToUuid } from '@/lib/supabase';

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

    // Tentar assumir (first-write-wins)
    // Convertendo ID numérico para UUID
    const userUuid = userIdToUuid(user.id);
    const result = await assumirAtendimento(leadIdNum, userUuid);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message, success: false },
        { status: 409 } // Conflict
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      data: {
        lead_id: leadIdNum,
        owner_user_id: userUuid,
        stage: 'em_atendimento',
        atendimento_ia: 'pause',
      },
    });
  } catch (error: any) {
    console.error('Erro ao assumir atendimento:', error);
    return NextResponse.json(
      { error: 'Erro ao assumir atendimento', success: false, details: error.message },
      { status: 500 }
    );
  }
}
