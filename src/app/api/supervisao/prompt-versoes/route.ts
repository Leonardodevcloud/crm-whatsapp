// ===========================================
// API: /api/supervisao/prompt-versoes
// GET: lista todas as versões do prompt (mais recentes primeiro)
// POST: reverte pra uma versão específica (body: { versao_id })
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const client = supabaseAdmin || supabase;

  const { data, error } = await client
    .from('tatiane_system_prompt')
    .select('id, versao, ativa, criado_em, criado_por, resumo_mudancas, correcoes_aplicadas')
    .order('versao', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data || [] });
}

export async function POST(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const versaoId = Number(body.versao_id);
  if (!versaoId) {
    return NextResponse.json({ error: 'versao_id é obrigatório', success: false }, { status: 400 });
  }

  const client = supabaseAdmin || supabase;

  try {
    // Confere se a versão existe
    const { data: alvo, error: errAlvo } = await client
      .from('tatiane_system_prompt')
      .select('id, versao, ativa')
      .eq('id', versaoId)
      .maybeSingle();

    if (errAlvo || !alvo) {
      return NextResponse.json({ error: 'Versão não encontrada', success: false }, { status: 404 });
    }

    if (alvo.ativa) {
      return NextResponse.json({ error: 'Esta versão já está ativa', success: false }, { status: 400 });
    }

    // Desativa todas, ativa só a alvo
    await client.from('tatiane_system_prompt').update({ ativa: false }).eq('ativa', true);
    const { error: errAtivar } = await client
      .from('tatiane_system_prompt')
      .update({ ativa: true })
      .eq('id', versaoId);

    if (errAtivar) {
      return NextResponse.json({ error: errAtivar.message, success: false }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { versao_ativada: alvo.versao, id: alvo.id },
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Erro: ${e.message}`, success: false }, { status: 500 });
  }
}
