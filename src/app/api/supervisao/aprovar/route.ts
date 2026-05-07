// ===========================================
// API: /api/supervisao/aprovar
// POST: marca uma flag como "aprovada/resolvida" (não mostra mais)
//
// Body: { flag_key, session_id, mensagem_created_at, regra_id, comentario? }
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { flag_key, session_id, mensagem_created_at, regra_id, comentario } = body;

  if (!flag_key || !session_id || !mensagem_created_at) {
    return NextResponse.json({ error: 'Campos obrigatórios: flag_key, session_id, mensagem_created_at', success: false }, { status: 400 });
  }

  const client = supabaseAdmin || supabase;
  const { data, error } = await client
    .from('tatiane_supervisao_aprovacoes')
    .upsert(
      {
        flag_key,
        session_id,
        mensagem_created_at,
        regra_id: regra_id || null,
        aprovado_por: user.nome || user.codProfissional || 'desconhecido',
        comentario: comentario || null,
      },
      { onConflict: 'flag_key' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}
