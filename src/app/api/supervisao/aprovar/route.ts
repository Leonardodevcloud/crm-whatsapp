// ===========================================
// API: /api/supervisao/aprovar (v3 — diagnostic)
// POST: marca uma flag como "aprovada/resolvida"
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  // STAGE 1: Auth
  let user: any;
  try {
    user = getUserFromHeader(req.headers.get('authorization'));
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado', success: false, stage: 'auth' }, { status: 401 });
    }
  } catch (e: any) {
    console.error('[aprovar] STAGE auth ERROR:', e);
    return NextResponse.json({ error: `Auth: ${e.message}`, success: false, stage: 'auth' }, { status: 500 });
  }

  // STAGE 2: Parse body
  let body: any = {};
  try {
    body = await req.json();
  } catch (e: any) {
    console.error('[aprovar] STAGE body ERROR:', e);
    return NextResponse.json({ error: `Body inválido: ${e.message}`, success: false, stage: 'body' }, { status: 400 });
  }

  const { flag_key, session_id, mensagem_created_at, regra_id, comentario } = body;

  if (!flag_key || !session_id || !mensagem_created_at) {
    return NextResponse.json({
      error: 'Campos obrigatórios: flag_key, session_id, mensagem_created_at',
      success: false,
      stage: 'validation',
      received: { flag_key, session_id, mensagem_created_at }
    }, { status: 400 });
  }

  // STAGE 3: Get client
  let client: any;
  try {
    client = supabaseAdmin || supabase;
    if (!client) {
      throw new Error('Nenhum cliente Supabase disponível');
    }
  } catch (e: any) {
    console.error('[aprovar] STAGE client ERROR:', e);
    return NextResponse.json({ error: `Client: ${e.message}`, success: false, stage: 'client' }, { status: 500 });
  }

  // STAGE 4: Build aprovado_por seguro
  let aprovadoPor = 'desconhecido';
  try {
    const candidato = user?.nome ?? user?.codProfissional ?? user?.id ?? 'desconhecido';
    aprovadoPor = String(candidato).slice(0, 200);
  } catch (e: any) {
    console.warn('[aprovar] aprovadoPor fallback:', e.message);
  }

  // STAGE 5: Check existing
  try {
    const { data: existente, error: errSelect } = await client
      .from('tatiane_supervisao_aprovacoes')
      .select('id, flag_key')
      .eq('flag_key', String(flag_key))
      .maybeSingle();

    if (errSelect) {
      console.error('[aprovar] STAGE select ERROR:', JSON.stringify(errSelect));
      return NextResponse.json({
        error: errSelect.message || 'Erro ao verificar',
        success: false,
        stage: 'select',
        details: { code: errSelect.code, hint: errSelect.hint, details: errSelect.details }
      }, { status: 500 });
    }

    if (existente) {
      return NextResponse.json({ success: true, data: existente, ja_existia: true });
    }
  } catch (e: any) {
    console.error('[aprovar] STAGE select EXCEPTION:', e);
    return NextResponse.json({ error: `Select exception: ${e.message}`, success: false, stage: 'select' }, { status: 500 });
  }

  // STAGE 6: Insert
  try {
    const payload = {
      flag_key: String(flag_key),
      session_id: String(session_id),
      mensagem_created_at: String(mensagem_created_at),
      regra_id: regra_id != null ? Number(regra_id) : null,
      aprovado_por: aprovadoPor,
      comentario: comentario ? String(comentario) : null,
    };

    console.log('[aprovar] STAGE insert payload:', JSON.stringify(payload));

    const { data, error } = await client
      .from('tatiane_supervisao_aprovacoes')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[aprovar] STAGE insert ERROR:', JSON.stringify(error));
      return NextResponse.json({
        error: error.message || 'Erro ao inserir',
        success: false,
        stage: 'insert',
        details: { code: error.code, hint: error.hint, details: error.details }
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('[aprovar] STAGE insert EXCEPTION:', e);
    return NextResponse.json({ error: `Insert exception: ${e.message}`, success: false, stage: 'insert' }, { status: 500 });
  }
}
