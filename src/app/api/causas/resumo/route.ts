// ===========================================
// API: /api/causas/resumo
// GET: KPIs agregados pra dashboard
// 
// Query params:
//   ?dias=N (default 30)
// 
// Retorna:
//   - total: total de leads analisados
//   - por_categoria: { preco: 71, cidade_fora: 17, ... }
//   - por_estagio: { etapa_1: 30, ... }
//   - por_regiao: { Salvador: 50, Aracaju: 22, ... }
//   - sinal_medio: % médio de churn
//   - pendentes: na fila aguardando análise
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dias = Math.max(1, Math.min(365, parseInt(searchParams.get('dias') || '30', 10) || 30));

  const limiteData = new Date();
  limiteData.setDate(limiteData.getDate() - dias);

  const client = supabaseAdmin || supabase;

  // ============================================
  // Query única: traz tudo pra agregar em JS
  // ============================================
  const { data: analises, error } = await client
    .from('tatiane_lead_morto_analises')
    .select('causa_categoria, estagio_que_parou, sinal_churn_pct, lead_regiao, lead_cidade, morreu_em')
    .gte('morreu_em', limiteData.toISOString());

  if (error) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }

  const total = analises?.length || 0;

  // Agregações
  const porCategoria: Record<string, number> = {};
  const porEstagio: Record<string, number> = {};
  const porRegiao: Record<string, number> = {};
  let somaSinal = 0;

  for (const a of analises || []) {
    porCategoria[a.causa_categoria] = (porCategoria[a.causa_categoria] || 0) + 1;
    porEstagio[a.estagio_que_parou] = (porEstagio[a.estagio_que_parou] || 0) + 1;
    const regiao = a.lead_regiao || '(sem região)';
    porRegiao[regiao] = (porRegiao[regiao] || 0) + 1;
    somaSinal += a.sinal_churn_pct || 0;
  }

  const sinalMedio = total > 0 ? Math.round(somaSinal / total) : 0;

  // ============================================
  // Tendência diária (últimos N dias)
  // ============================================
  const porDia: Record<string, number> = {};
  for (const a of analises || []) {
    const dia = (a.morreu_em || '').split('T')[0];
    if (dia) porDia[dia] = (porDia[dia] || 0) + 1;
  }

  // ============================================
  // Pendentes na fila
  // ============================================
  const { count: pendentesCount } = await client
    .from('tatiane_lead_morto_pendentes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pendente');

  const { count: falhasCount } = await client
    .from('tatiane_lead_morto_pendentes')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'falha');

  return NextResponse.json({
    success: true,
    data: {
      total,
      por_categoria: porCategoria,
      por_estagio: porEstagio,
      por_regiao: porRegiao,
      por_dia: porDia,
      sinal_medio: sinalMedio,
      fila: {
        pendentes: pendentesCount || 0,
        falhas: falhasCount || 0,
      },
      periodo_dias: dias,
    }
  });
}
