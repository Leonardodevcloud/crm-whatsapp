// ===========================================
// API: /api/followups
// GET: Lista follow-ups (com filtros)
// POST: Criar novo follow-up
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
    
    const status = searchParams.get('status'); // pendente, concluido, cancelado
    const situacao = searchParams.get('situacao'); // atrasado, hoje, futuro
    const leadId = searchParams.get('lead_id');

    // Buscar follow-ups com dados do lead
    let query = client
      .from('followups')
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

    // Por padrão, só mostra pendentes (a menos que especifique outro status)
    if (status) {
      query = query.eq('status', status);
    } else {
      // Se não especificou status, mostra apenas pendentes
      query = query.eq('status', 'pendente');
    }

    if (leadId) {
      query = query.eq('lead_id', parseInt(leadId));
    }

    const { data: followups, error } = await query;

    if (error) throw error;

    // Processar situação (atrasado, hoje, futuro)
    const hoje = new Date().toISOString().split('T')[0];
    
    const processados = (followups || []).map(f => {
      let situacaoCalc = f.status;
      if (f.status === 'pendente') {
        if (f.data_agendada < hoje) situacaoCalc = 'atrasado';
        else if (f.data_agendada === hoje) situacaoCalc = 'hoje';
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

    // Verificar quantos follow-ups pendentes o lead já tem
    const { data: existentes } = await client
      .from('followups')
      .select('id, sequencia')
      .eq('lead_id', lead_id)
      .eq('status', 'pendente');

    // Cancelar follow-ups pendentes anteriores (só pode ter 1 ativo)
    if (existentes && existentes.length > 0) {
      await client
        .from('followups')
        .update({ status: 'cancelado' })
        .eq('lead_id', lead_id)
        .eq('status', 'pendente');
    }

    // Calcular sequência
    const { data: todosFollowups } = await client
      .from('followups')
      .select('sequencia')
      .eq('lead_id', lead_id)
      .order('sequencia', { ascending: false })
      .limit(1);

    const proximaSequencia = todosFollowups && todosFollowups.length > 0 
      ? todosFollowups[0].sequencia + 1 
      : 1;

    // Criar novo follow-up
    const { data: novoFollowup, error } = await client
      .from('followups')
      .insert({
        lead_id,
        data_agendada,
        motivo,
        notas,
        tipo,
        sequencia: proximaSequencia,
        criado_por: user.id || null,
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
