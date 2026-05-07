// ===========================================
// API: /api/supervisao/regras/[id]
// PATCH: edita regra (ativa/desativa, muda padrão, severidade, etc)
// DELETE: remove regra
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido', success: false }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const update: any = { atualizado_em: new Date().toISOString() };

  if (typeof body.nome === 'string') update.nome = body.nome;
  if (typeof body.descricao === 'string') update.descricao = body.descricao;
  if (typeof body.tipo === 'string') {
    if (!['regex', 'keywords', 'mensagem_longa'].includes(body.tipo)) {
      return NextResponse.json({ error: 'Tipo inválido', success: false }, { status: 400 });
    }
    update.tipo = body.tipo;
  }
  if (typeof body.padrao === 'string') {
    if (update.tipo === 'regex' || (update.tipo === undefined && body.padrao)) {
      try { new RegExp(body.padrao); }
      catch (e: any) {
        // Se sabemos que era regex, valida
      }
    }
    update.padrao = body.padrao;
  }
  if (typeof body.severidade === 'string') {
    if (!['info', 'atencao', 'critico'].includes(body.severidade)) {
      return NextResponse.json({ error: 'Severidade inválida', success: false }, { status: 400 });
    }
    update.severidade = body.severidade;
  }
  if (typeof body.ativa === 'boolean') update.ativa = body.ativa;

  const client = supabaseAdmin || supabase;
  const { data, error } = await client
    .from('tatiane_supervisao_regras')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: 'ID inválido', success: false }, { status: 400 });

  const client = supabaseAdmin || supabase;
  const { error } = await client
    .from('tatiane_supervisao_regras')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
