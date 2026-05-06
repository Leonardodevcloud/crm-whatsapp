// ===========================================
// API: /api/followups
// v3 - Adaptado para tatiane_followups
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const { searchParams } = new URL(req.url);

    const status = searchParams.get('status');
    const situacao = searchParams.get('situacao');
    const leadId = searchParams.get('lead_id');

    let query = client
      .from('tatiane_followups')
      .select(`
        *,
        dados_cliente (
          id,
          nomewpp,
          telefone,
          stage,
          regiao,
          iniciado_por
        )
      `)
      .order('data_agendada', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    } else {
      query = query.eq('status', 'pendente');
    }

    if (leadId) {
      query = query.eq('lead_id', parseInt(leadId));
    }

    const { data: followups, error } = await query;

    if (error) throw error;

    const hoje = new Date().toISOString().split('T')[0];

    const processados = (followups || []).map((f: any) => {
      let situacaoCalc = f.status;
      if (f.status === 'pendente' && f.data_agendada) {
        const dataAgendadaStr = String(f.data_agendada).slice(0, 10);
        if (dataAgendadaStr < hoje) situacaoCalc = 'atrasado';
        else if (dataAgendadaStr === hoje) situacaoCalc = 'hoje';
        else situacaoCalc = 'futuro';
      }
      return { ...f, situacao: situacaoCalc };
    });

    const filtrados = situacao
      ? processados.filter(f => f.situacao === situacao)
      : processados;

    const contagem = {
      atrasados: processados.filter(f => f.situacao === 'atrasado').length,
      hoje: processados.filter(f => f.situacao === 'hoje').length,
      futuro: processados.filter(f => f.situacao === 'futuro').length,
      concluidos: processados.filter(f => f.status === 'concluido').length,
      total: processados.filter(f => f.status === 'pendente').length,
    };

    return NextResponse.json({
      success: true,
      data: filtrados,
      contagem,
    });

  } catch (error: any) {
    console.error('Erro ao buscar follow-ups:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar follow-ups', success: false, details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const body = await req.json();

    const { lead_id, data_agendada, motivo, notas, tipo = 'manual' } = body;

    if (!lead_id || !data_agendada || !motivo) {
      return NextResponse.json(
        { error: 'lead_id, data_agendada e motivo são obrigatórios', success: false },
        { status: 400 }
      );
    }

    const { data: lead, error: leadErr } = await client
      .from('dados_cliente')
      .select('chat_lid')
      .eq('id', lead_id)
      .single();

    if (leadErr || !lead?.chat_lid) {
      return NextResponse.json(
        { error: 'Lead sem chat_lid — não é possível agendar follow-up', success: false },
        { status: 400 }
      );
    }

    const { data: existentes } = await client
      .from('tatiane_followups')
      .select('id, sequencia')
      .eq('lead_id', lead_id)
      .eq('status', 'pendente');

    if (existentes && existentes.length > 0) {
      await client
        .from('tatiane_followups')
        .update({ status: 'cancelado' })
        .eq('lead_id', lead_id)
        .eq('status', 'pendente');
    }

    const { data: todosFollowups } = await client
      .from('tatiane_followups')
      .select('sequencia')
      .eq('lead_id', lead_id)
      .order('sequencia', { ascending: false })
      .limit(1);

    const proximaSequencia = todosFollowups && todosFollowups.length > 0
      ? (todosFollowups[0].sequencia || 0) + 1
      : 1;

    const partesMensagem: string[] = [];
    if (notas) partesMensagem.push(`[notas: ${notas}]`);
    if (user.id) partesMensagem.push(`[por: ${user.id}]`);
    const mensagem = partesMensagem.length > 0 ? partesMensagem.join(' ') : null;

    const { data: novoFollowup, error } = await client
      .from('tatiane_followups')
      .insert({
        lead_id,
        chat_lid: lead.chat_lid,
        data_agendada,
        motivo,
        mensagem,
        tipo,
        status: 'pendente',
        sequencia: proximaSequencia,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: novoFollowup,
      message: 'Follow-up agendado com sucesso',
    });

  } catch (error: any) {
    console.error('Erro ao criar follow-up:', error);
    return NextResponse.json(
      { error: 'Erro ao criar follow-up', success: false, details: error.message },
      { status: 500 }
    );
  }
}
