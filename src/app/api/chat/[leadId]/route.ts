// ===========================================
// API: /api/chat/[leadId]
// GET: Retorna lead, chat e mensagens
// + Verificação automática do status na API Tutts
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { getLeadById, getChatByLeadId, getChatMessages, getChatMessagesByPhone, getN8nChatHistory, updateLead } from '@/lib/supabase';
import { verificarStatusProfissional, determinarNovoStage } from '@/lib/tutts-api';

export async function GET(
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

    // Buscar lead
    let lead = await getLeadById(leadIdNum);
    if (!lead) {
      return NextResponse.json(
        { error: 'Lead não encontrado', success: false },
        { status: 404 }
      );
    }

    // ============================================
    // VERIFICAÇÃO AUTOMÁTICA NA API TUTTS
    // ============================================
    // Só verifica se o lead ainda não foi finalizado e tem telefone
    let tuttsStatus = null;
    let stageAtualizado = false;
    
    if (lead.telefone && lead.stage !== 'finalizado') {
      try {
        const statusTutts = await verificarStatusProfissional(lead.telefone);
        tuttsStatus = statusTutts;
        
        // Determinar se precisa mudar o stage
        const novoStage = determinarNovoStage(statusTutts, lead.stage);
        
        if (novoStage && novoStage !== lead.stage) {
          console.log(`[Chat API] Atualizando stage do lead ${leadIdNum}: ${lead.stage} -> ${novoStage}`);
          
          // Atualizar o lead no banco
          const leadAtualizado = await updateLead(leadIdNum, { stage: novoStage });
          
          if (leadAtualizado) {
            lead = leadAtualizado;
            stageAtualizado = true;
          }
        }
      } catch (tuttsError) {
        console.error('[Chat API] Erro ao verificar status Tutts:', tuttsError);
        // Não bloqueia a requisição se falhar a verificação
      }
    }

    // Buscar chat associado (por telefone)
    const chat = await getChatByLeadId(leadIdNum);

    // Buscar mensagens de múltiplas fontes
    let messages: any[] = [];
    
    if (chat) {
      // Se encontrou chat, busca mensagens pelo chat_id
      messages = await getChatMessages(chat.id, 200);
    }
    
    // Se não encontrou mensagens no chat_messages, tenta buscar por telefone
    if (messages.length === 0 && lead.telefone) {
      messages = await getChatMessagesByPhone(lead.telefone, 200);
    }
    
    // Se ainda não tem mensagens, busca no histórico do n8n (n8n_chat_histories)
    // Esta tabela é usada quando a conversa é "iniciada por humano"
    if (messages.length === 0 && lead.telefone) {
      const n8nMessages = await getN8nChatHistory(lead.telefone, 200);
      if (n8nMessages.length > 0) {
        messages = n8nMessages;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        lead,
        chat,
        messages,
        // Info extra sobre verificação Tutts
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
