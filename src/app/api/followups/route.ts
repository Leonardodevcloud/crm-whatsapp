// ===========================================
// API: /api/followups
// GET: Lista follow-ups (com filtros)
// POST: Criar novo follow-up
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

    const status = searchParams.get('status'); // pendente, concluido, cancelado, falha
    const situacao = searchParams.get('situacao'); // atrasado, hoje, futuro
    const leadId = searchParams.get('lead_id');

    // tatiane_followups com dados do lead
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

    // Por padrão, só mostra pendentes
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

    // Processar situação (atrasado, hoje, futuro)
    // IMPORTANTE: usar timezone America/Bahia (UTC-3), não UTC
    // O backend roda em UTC mas o usuário enxerga horário de Salvador.
    const TZ = 'America/Bahia';

    // Helper: extrai 'YYYY-MM-DD' no timezone alvo
    const dataLocal = (d: Date | string): string => {
      const date = typeof d === 'string' ? new Date(d) : d;
      // pt-BR + sv-SE retornam YYYY-MM-DD; usamos sv-SE pra garantir hifenado
      const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(date);
    };

    const hoje = dataLocal(new Date());

    const processados = (followups || []).map((f: any) => {
      let situacaoCalc = f.status;
      if (f.status === 'pendente' && f.data_agendada) {
        // Compara a data em horário de Salvador, não UTC
        const dataAgendadaStr = dataLocal(f.data_agendada);
        if (dataAgendadaStr < hoje) situacaoCalc = 'atrasado';
        else if (dataAgendadaStr === hoje) situacaoCalc = 'hoje';
        else situacaoCalc = 'futuro';
      }
      return { ...f, situacao: situacaoCalc };
    });

    // Filtrar por situação se solicitado
    const filtrados = situacao
      ? processados.filter(f => f.situacao === situacao)
      : processados;

    // Contar por situação
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

    // tatiane_followups exige chat_lid (NOT NULL) — buscar do lead
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

    // Cancelar follow-ups pendentes anteriores (só pode ter 1 ativo por lead)
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

    // Calcular sequência
    const { data: todosFollowups } = await client
      .from('tatiane_followups')
      .select('sequencia')
      .eq('lead_id', lead_id)
      .order('sequencia', { ascending: false })
      .limit(1);

    const proximaSequencia = todosFollowups && todosFollowups.length > 0
      ? (todosFollowups[0].sequencia || 0) + 1
      : 1;

    // Persistir notas + criado_por dentro de "mensagem" como prefixo (sem coluna dedicada)
    // Convenção: "[notas: ...] [por: userId] motivo livre"
    const partesMensagem: string[] = [];
    if (notas) partesMensagem.push(`[notas: ${notas}]`);
    if (user.id) partesMensagem.push(`[por: ${user.id}]`);
    const mensagem = partesMensagem.length > 0 ? partesMensagem.join(' ') : null;

    // Criar novo follow-up
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
