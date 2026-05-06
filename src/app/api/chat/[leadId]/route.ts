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
          if (leadAtualizado) { lead = leadAtualizado; stageAtualizado =
