// ===========================================
// API: /api/supervisao/desconsiderar
// POST: cria uma exceção (regex que descarta a flag em contextos similares)
//
// Body: { regra_id, padrao_regex, nome, descricao?, flag_key_atual? }
//   - regra_id: qual regra ganha a exceção
//   - padrao_regex: regex que, se casar na mensagem, descarta a flag
//   - nome: rótulo curto da exceção
//   - flag_key_atual: opcional, pra também aprovar a flag atual
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { regra_id, padrao_regex, nome, descricao, flag_key_atual, session_id, mensagem_created_at } = body;

  if (!regra_id || !padrao_regex || !nome) {
    return NextResponse.json({
      error: 'Campos obrigatórios: regra_id, padrao_regex, nome',
      success: false
    }, { status: 400 });
  }

  // Validar regex
  try {
    new RegExp(padrao_regex, 'i');
  } catch (e: any) {
    return NextResponse.json({ error: `Regex inválida: ${e.message}`, success: false }, { status: 400 });
  }

  const client = supabaseAdmin || supabase;
  const aprovadoPor = String(user.nome || user.codProfissional || 'desconhecido').slice(0, 200);

  try {
    // 1. Criar exceção
    const { data: excecao, error: errExc } = await client
      .from('tatiane_supervisao_excecoes')
      .insert({
        regra_id: Number(regra_id),
        nome: String(nome).slice(0, 200),
        descricao: descricao ? String(descricao) : null,
        padrao_regex: String(padrao_regex),
        ativa: true,
        criado_por: aprovadoPor,
      })
      .select()
      .single();

    if (errExc) {
      console.error('[desconsiderar] Erro criando exceção:', errExc);
      return NextResponse.json({
        error: errExc.message,
        success: false,
        details: { code: errExc.code }
      }, { status: 500 });
    }

    // 2. Se tem flag_key_atual, aprovar também (pra sumir agora)
    if (flag_key_atual && session_id && mensagem_created_at) {
      await client
        .from('tatiane_supervisao_aprovacoes')
        .insert({
          flag_key: String(flag_key_atual),
          session_id: String(session_id),
          mensagem_created_at: String(mensagem_created_at),
          regra_id: Number(regra_id),
          aprovado_por: aprovadoPor,
          comentario: `Auto-aprovada via exceção: ${nome}`,
        })
        .select()
        .single()
        .then(({ error }) => {
          // Ignora conflito (flag_key já aprovada antes)
          if (error && error.code !== '23505') {
            console.warn('[desconsiderar] Aviso aprovando flag atual:', error.message);
          }
        });
    }

    return NextResponse.json({ success: true, data: excecao });
  } catch (e: any) {
    console.error('[desconsiderar] Exceção:', e);
    return NextResponse.json({ error: `Erro: ${e.message}`, success: false }, { status: 500 });
  }
}
