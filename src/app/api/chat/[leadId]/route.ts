// ===========================================
// API: /api/chat/[leadId]
// GET: Retorna lead, chat e mensagens
// v2 - Passa chatLid para todas as buscas de mensagens
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { getLeadById, getChatByLeadId, getChatMessages, getChatMessagesByPhone, getN8nChatHistory, updateLead } from '@/lib/supabase';
import { verificarStatusProfissional, determinarNovoStage } from '@/lib/tutts-api';

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

    // Verificação automática na API Tutts
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

    // Buscar chat (cascata: chat_lid → lead_id → phone)
    const chat = await getChatByLeadId(leadIdNum);

    // Buscar mensagens — 3 fontes em cascata
    let messages: any[] = [];
    const chatLid = lead.chat_lid || null;
    
    // Fonte 1: chat_messages pelo chat_id
    if (chat) {
      messages = await getChatMessages(chat.id, 200);
    }
    
    // Fonte 2: chat_messages pelo phone/chatLid (com deduplicação)
    if (messages.length === 0 && (lead.telefone || chatLid)) {
      messages = await getChatMessagesByPhone(lead.telefone || '', 200, chatLid);
    }
    
    // Fonte 3: n8n_chat_histories (fallback, conversas humanas/IA)
    if (messages.length === 0 && (lead.telefone || chatLid)) {
      messages = await getN8nChatHistory(lead.telefone || '', 200, chatLid);
    }

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
