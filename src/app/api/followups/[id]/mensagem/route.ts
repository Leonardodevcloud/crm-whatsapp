// ===========================================
// API: /api/followups/[id]/mensagem
// GET: Retorna a mensagem real que a Tatiane enviou via Z-API
//      + se o lead respondeu nas próximas 48h
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const { id } = await params;
    const followupId = parseInt(id);
    if (isNaN(followupId)) {
      return NextResponse.json({ error: 'ID inválido', success: false }, { status: 400 });
    }

    const client = supabaseAdmin || supabase;

    // 1. Buscar o follow-up
    const { data: followup, error: errFup } = await client
      .from('tatiane_followups')
      .select('id, lead_id, chat_lid, enviado_em, status, motivo, mensagem, tipo, sequencia')
      .eq('id', followupId)
      .single();

    if (errFup || !followup) {
      return NextResponse.json(
        { error: 'Follow-up não encontrado', success: false },
        { status: 404 }
      );
    }

    if (!followup.enviado_em || followup.status !== 'concluido') {
      return NextResponse.json({
        success: true,
        data: {
          followup_id: followup.id,
          status: followup.status,
          mensagem_enviada: null,
          enviado_em: null,
          respondeu: false,
          tempo_resposta_horas: null,
          info: 'Follow-up ainda não foi enviado',
        },
      });
    }

    // 2. Buscar a mensagem AI imediatamente após enviado_em (mesma sessão)
    let mensagemEnviada: string | null = null;
    if (followup.chat_lid) {
      const enviadoEm = new Date(followup.enviado_em);
      const janela5min = new Date(enviadoEm.getTime() + 5 * 60 * 1000);

      const { data: msgAi } = await client
        .from('tatiane_chat_histories')
        .select('content, created_at')
        .eq('session_id', followup.chat_lid)
        .eq('message_type', 'ai')
        .gte('created_at', enviadoEm.toISOString())
        .lte('created_at', janela5min.toISOString())
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      mensagemEnviada = msgAi?.content || null;
    }

    // 3. Verificar resposta do lead em 48h
    let respondeu = false;
    let respondeuEm: string | null = null;
    let tempoRespostaHoras: number | null = null;

    if (followup.chat_lid) {
      const enviadoEm = new Date(followup.enviado_em);
      const limite48h = new Date(enviadoEm.getTime() + 48 * 60 * 60 * 1000);

      const { data: msgHuman } = await client
        .from('tatiane_chat_histories')
        .select('content, created_at')
        .eq('session_id', followup.chat_lid)
        .eq('message_type', 'human')
        .gt('created_at', enviadoEm.toISOString())
        .lt('created_at', limite48h.toISOString())
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (msgHuman) {
        respondeu = true;
        respondeuEm = msgHuman.created_at;
        const diff = new Date(msgHuman.created_at).getTime() - enviadoEm.getTime();
        tempoRespostaHoras = Math.round((diff / (60 * 60 * 1000)) * 10) / 10;
      }
    }

    // 4. Nome do lead
    const { data: lead } = await client
      .from('dados_cliente')
      .select('nomewpp, telefone, stage')
      .eq('id', followup.lead_id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      data: {
        followup_id: followup.id,
        lead_id: followup.lead_id,
        nome_lead: lead?.nomewpp || null,
        telefone: lead?.telefone || null,
        stage_atual: lead?.stage || null,
        tipo: followup.tipo,
        sequencia: followup.sequencia,
        motivo: followup.motivo,
        enviado_em: followup.enviado_em,
        mensagem_enviada: mensagemEnviada,
        // Fallback: se não achou em chat_histories, usa o campo mensagem do followup
        mensagem_planejada: followup.mensagem,
        respondeu,
        respondeu_em: respondeuEm,
        tempo_resposta_horas: tempoRespostaHoras,
      },
    });
  } catch (error: any) {
    console.error('[followups/mensagem] Erro:', error);
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
}
