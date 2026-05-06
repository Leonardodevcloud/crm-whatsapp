// ===========================================
// API: /api/chat/[leadId]
// v3 - Adaptado para tatiane_chat_histories
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { getLeadById, getTatianeChatHistory, updateLead } from '@/lib/supabase';
import { verificarStatusProfissional, determinarNovoStage } from '@/lib/tutts-api';
import type { Chat } from '@/types';

export async function GET(
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

    let lead = await getLeadById(leadIdNum);
    if (!lead) {
      return NextResponse.json({ error: 'Lead não encontrado', success: false }, { status: 404 });
    }

    let tuttsStatus = null;
    let stageAtualizado = false;

    if (lead.telefone && lead.stage !== 'finalizado') {
      try {
        const statusTutts = await verificarStatusProfissional(lead.telefone);
        tuttsStatus = statusTutts;
        const novoStage = determinarNovoStage(statusTutts, lead.stage);
        if (novoStage && novoStage !== lead.stage) {
          console.log(`[Chat API] Stage: ${lead.stage} -> ${novoStage}`);
          const leadAtualizado = await updateLead(leadIdNum, { stage: novoStage });
          if (leadAtualizado) { lead = leadAtualizado; stageAtualizado = true; }
        }
      } catch (tuttsError) {
        console.error('[Chat API] Erro Tutts:', tuttsError);
      }
    }

    const chatLid = lead.chat_lid || null;
    const messages = await getTatianeChatHistory(lead.telefone || '', 200, chatLid);

    const chat: Chat = {
      id: chatLid || `lead_${leadIdNum}`,
      status: lead.stage === 'finalizado' ? 'closed' : 'open',
      last_message_at: messages.length > 0 ? messages[messages.length - 1].created_at : lead.updated_at,
      lead_id: leadIdNum,
      chat_lid: chatLid,
    };

    return NextResponse.json({
      success: true,
      data: {
        lead,
        chat,
        messages,
        tuttsVerificacao: tuttsStatus ? {
          encontrado: tuttsStatus.found,
          ativo: tuttsStatus.ativo,
          stageAtualizado,
        } : null,
      },
    });
  } catch (error: any) {
    console.error('Erro na API chat:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar chat', success: false, details: error.message },
      { status: 500 }
    );
  }
}
