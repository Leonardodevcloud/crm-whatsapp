// ===========================================
// API: /api/followups/[id]
// PATCH: Atualizar follow-up (concluir, cancelar)
// DELETE: Deletar follow-up
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const { id } = await params;
    const body = await req.json();
    
    const { acao, data_agendada, notas } = body;

    if (!acao) {
      return NextResponse.json(
        { error: 'Ação é obrigatória (concluir, cancelar, reagendar)', success: false },
        { status: 400 }
      );
    }

    let updateData: any = {};

    switch (acao) {
      case 'concluir':
        updateData = {
          status: 'concluido',
          completed_at: new Date().toISOString(),
        };
        break;

      case 'cancelar':
        updateData = {
          status: 'cancelado',
        };
        break;

      case 'reagendar':
        if (!data_agendada) {
          return NextResponse.json(
            { error: 'data_agendada é obrigatória para reagendar', success: false },
            { status: 400 }
          );
        }
        updateData = {
          data_agendada,
          notas: notas || undefined,
        };
        break;

      default:
        return NextResponse.json(
          { error: 'Ação inválida', success: false },
          { status: 400 }
        );
    }

    const { data, error } = await client
      .from('followups')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
      message: `Follow-up ${acao === 'concluir' ? 'concluído' : acao === 'cancelar' ? 'cancelado' : 'reagendado'} com sucesso`,
    });

  } catch (error: any) {
    console.error('Erro ao atualizar follow-up:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar follow-up', success: false, details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const { id } = await params;

    const { error } = await client
      .from('followups')
      .delete()
      .eq('id', parseInt(id));

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Follow-up deletado com sucesso',
    });

  } catch (error: any) {
    console.error('Erro ao deletar follow-up:', error);
    return NextResponse.json(
      { error: 'Erro ao deletar follow-up', success: false, details: error.message },
      { status: 500 }
    );
  }
}
