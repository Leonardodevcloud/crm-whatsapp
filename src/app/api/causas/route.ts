// ===========================================
// API: /api/causas
// GET: lista análises de leads_morto com filtros
// 
// Query params:
//   ?dias=N (default 30) — leads que morreram nos últimos N dias
//   ?categoria=preco|cidade_fora|... — filtra por causa
//   ?estagio=etapa_1|...
//   ?regiao=... 
//   ?limit=N (default 100, max 500)
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dias = Math.max(1, Math.min(365, parseInt(searchParams.get('dias') || '30', 10) || 30));
  const categoria = searchParams.get('categoria');
  const estagio = searchParams.get('estagio');
  const regiao = searchParams.get('regiao');
  const limit = Math.max(1, Math.min(500, parseInt(searchParams.get('limit') || '100', 10) || 100));

  const limiteData = new Date();
  limiteData.setDate(limiteData.getDate() - dias);

  const client = supabaseAdmin || supabase;

  let query = client
    .from('tatiane_lead_morto_analises')
    .select(`
      id,
      lead_id,
      morreu_em,
      causa_categoria,
      causa_descricao,
      estagio_que_parou,
      sinal_churn_pct,
      trecho_chave,
      recomendacao,
      lead_regiao,
      lead_cidade,
      lead_iniciado_por,
      total_mensagens,
      analisado_em,
      dados_cliente (
        id,
        nomewpp,
        telefone,
        chat_lid,
        stage
      )
    `)
    .gte('morreu_em', limiteData.toISOString())
    .order('morreu_em', { ascending: false })
    .limit(limit);

  if (categoria) query = query.eq('causa_categoria', categoria);
  if (estagio) query = query.eq('estagio_que_parou', estagio);
  if (regiao) query = query.eq('lead_regiao', regiao);

  const { data, error } = await query;
  if (error) {
    console.error('[GET /causas] Erro:', error);
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data || [], total: data?.length || 0 });
}
