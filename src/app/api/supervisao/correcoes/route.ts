// ===========================================
// API: /api/supervisao/correcoes
// GET: lista todas as correções (filtrado por status, default = pendente)
// POST: cria nova correção pendente
//
// POST Body: {
//   licao: string (a regra que vai virar parte do prompt)
//   secao: 'regras_ouro' | 'fora_escopo' | 'fluxo' | 'outro' (onde inserir)
//   flag_key?, session_id?, mensagem_problematica? (origem opcional)
// }
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'pendente';

  const client = supabaseAdmin || supabase;

  let query = client
    .from('tatiane_correcoes_pendentes')
    .select('*')
    .order('criado_em', { ascending: false });

  if (status !== 'todas') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }

  // Conta totais por status
  const { data: cnt } = await client
    .from('tatiane_correcoes_pendentes')
    .select('status', { count: 'exact' });

  const totais = { pendente: 0, aplicada: 0, descartada: 0 };
  (cnt || []).forEach((r: any) => {
    if (r.status in totais) totais[r.status as keyof typeof totais]++;
  });

  return NextResponse.json({ success: true, data: data || [], totais });
}

export async function POST(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { licao, secao, flag_key, session_id, mensagem_problematica } = body;

  if (!licao || !String(licao).trim()) {
    return NextResponse.json({ error: 'Lição é obrigatória', success: false }, { status: 400 });
  }

  const secaoValida = ['regras_ouro', 'fora_escopo', 'fluxo', 'outro'].includes(secao)
    ? secao
    : 'regras_ouro';

  const client = supabaseAdmin || supabase;
  const criadoPor = String(user.nome || user.codProfissional || 'desconhecido').slice(0, 200);

  try {
    const { data, error } = await client
      .from('tatiane_correcoes_pendentes')
      .insert({
        licao: String(licao).trim(),
        secao: secaoValida,
        status: 'pendente',
        flag_key: flag_key ? String(flag_key) : null,
        session_id: session_id ? String(session_id) : null,
        mensagem_problematica: mensagem_problematica ? String(mensagem_problematica).slice(0, 4000) : null,
        criado_por: criadoPor,
      })
      .select()
      .single();

    if (error) {
      console.error('[corrigir] Erro:', error);
      return NextResponse.json({
        error: error.message,
        success: false,
        details: { code: error.code }
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('[corrigir] Exceção:', e);
    return NextResponse.json({ error: `Erro: ${e.message}`, success: false }, { status: 500 });
  }
}
