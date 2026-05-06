// ===========================================
// API: /api/leads/[leadId]/reativar
// POST: Reativa lead arquivado (status: arquivado → ativo)
//
// Não confundir com /api/chat/[leadId]/reativar (que reativa a IA do atendimento).
// Este endpoint é usado pelo botão "Reativar" em cards arquivados do Kanban.
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { reativarLeadArquivado, getLeadById } from '@/lib/supabase';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const { leadId } = await params;
    const leadIdNum = parseInt(leadId);
    if (isNaN(leadIdNum)) {
      return NextResponse.json({ error: 'ID do lead inválido', success: false }, { status: 400 });
    }

    const lead = await getLeadById(leadIdNum);
    if (!lead) {
      return NextResponse.json({ error: 'Lead não encontrado', success: false }, { status: 404 });
    }

    if (lead.status !== 'arquivado') {
      return NextResponse.json(
        { error: 'Lead não está arquivado', success: false, current_status: lead.status },
        { status: 400 }
      );
    }

    const ok = await reativarLeadArquivado(leadIdNum);
    if (!ok) {
      return NextResponse.json(
        { error: 'Erro ao reativar lead', success: false },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Lead reativado com sucesso',
      data: { lead_id: leadIdNum, status: 'ativo' },
    });
  } catch (error: any) {
    console.error('Erro ao reativar lead:', error);
    return NextResponse.json(
      { error: 'Erro ao reativar lead', success: false, details: error.message },
      { status: 500 }
    );
  }
}
