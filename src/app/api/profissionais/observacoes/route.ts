// ===========================================
// API: /api/profissionais/observacoes
// GET: Buscar todas as observações
// PUT: Salvar/atualizar observação de um profissional
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';

const getClient = () => supabaseAdmin || supabase;

// GET: Buscar todas as observações (mapa codigo -> {observacao, updated_at, updated_by})
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = getClient();
    const { data, error } = await client
      .from('profissionais_observacoes')
      .select('codigo, observacao, updated_at, updated_by');

    if (error) throw error;

    // Converter para mapa { codigo: { observacao, updated_at, updated_by } }
    const mapa: Record<string, { observacao: string; updated_at: string; updated_by: string }> = {};
    for (const row of data || []) {
      mapa[row.codigo] = {
        observacao: row.observacao || '',
        updated_at: row.updated_at || '',
        updated_by: row.updated_by || '',
      };
    }

    return NextResponse.json({ success: true, data: mapa });
  } catch (error: any) {
    console.error('[Observações] Erro GET:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar observações', success: false, details: error.message },
      { status: 500 }
    );
  }
}

// PUT: Salvar/atualizar observação
export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { codigo, telefone, observacao } = body;

    if (!codigo) {
      return NextResponse.json(
        { error: 'Código do profissional é obrigatório', success: false },
        { status: 400 }
      );
    }

    const client = getClient();
    const now = new Date().toISOString();
    const userName = user.nome || user.id?.toString() || 'desconhecido';

    // Upsert: insere se não existe, atualiza se existe
    const { data, error } = await client
      .from('profissionais_observacoes')
      .upsert(
        {
          codigo,
          telefone: telefone || null,
          observacao: observacao || '',
          updated_at: now,
          updated_by: userName,
        },
        { onConflict: 'codigo' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: {
        codigo: data.codigo,
        observacao: data.observacao,
        updated_at: data.updated_at,
        updated_by: data.updated_by,
      },
    });
  } catch (error: any) {
    console.error('[Observações] Erro PUT:', error);
    return NextResponse.json(
      { error: 'Erro ao salvar observação', success: false, details: error.message },
      { status: 500 }
    );
  }
}
