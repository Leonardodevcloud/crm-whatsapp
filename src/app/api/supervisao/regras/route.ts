// ===========================================
// API: /api/supervisao/regras
// GET: lista todas as regras
// POST: cria nova regra
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const client = supabaseAdmin || supabase;
  const { data, error } = await client
    .from('tatiane_supervisao_regras')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data || [] });
}

export async function POST(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { nome, descricao, tipo, padrao, severidade } = body;

  if (!nome || !tipo || !padrao) {
    return NextResponse.json({ error: 'Campos obrigatórios: nome, tipo, padrao', success: false }, { status: 400 });
  }
  if (!['regex', 'keywords', 'mensagem_longa'].includes(tipo)) {
    return NextResponse.json({ error: 'Tipo inválido', success: false }, { status: 400 });
  }
  if (severidade && !['info', 'atencao', 'critico'].includes(severidade)) {
    return NextResponse.json({ error: 'Severidade inválida', success: false }, { status: 400 });
  }

  // Validar regex se for o caso
  if (tipo === 'regex') {
    try { new RegExp(padrao); }
    catch (e: any) {
      return NextResponse.json({ error: `Regex inválida: ${e.message}`, success: false }, { status: 400 });
    }
  }
  if (tipo === 'mensagem_longa' && isNaN(parseInt(padrao))) {
    return NextResponse.json({ error: 'Para mensagem_longa, padrao deve ser número (chars)', success: false }, { status: 400 });
  }

  const client = supabaseAdmin || supabase;
  const { data, error } = await client
    .from('tatiane_supervisao_regras')
    .insert({
      nome,
      descricao: descricao || null,
      tipo,
      padrao,
      severidade: severidade || 'atencao',
      ativa: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}
