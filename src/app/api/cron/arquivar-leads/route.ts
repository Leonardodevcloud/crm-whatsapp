// ===========================================
// API: /api/cron/arquivar-leads
// POST: Arquiva leads finalizados/mortos antigos
//
// Critério:
//   - finalizado >15 dias → status = 'arquivado'
//   - lead_morto >30 dias → status = 'arquivado'
//
// Auth: CRON_SECRET no header (Vercel Cron) ou JWT normal
// Agendamento: diário às 3h (definido em vercel.json)
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const CRON_SECRET = process.env.CRON_SECRET || 'tutts-cron-2026';

// Critérios de arquivamento (em dias)
const DIAS_FINALIZADO = 15;
const DIAS_LEAD_MORTO = 30;

export async function POST(req: NextRequest) {
  // Auth: CRON_SECRET ou JWT
  const cronSecret = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('authorization');
  const vercelCronHeader = req.headers.get('x-vercel-cron');

  let autenticado = false;
  if (cronSecret === CRON_SECRET) autenticado = true;
  if (vercelCronHeader === '1') autenticado = true; // Vercel Cron Job
  if (!autenticado) {
    const user = getUserFromHeader(authHeader);
    if (user) autenticado = true;
  }

  if (!autenticado) {
    return NextResponse.json({ error: 'Não autorizado', success: false }, { status: 401 });
  }

  const inicio = Date.now();
  const client = supabaseAdmin || supabase;

  try {
    const limiteFinalizado = new Date(Date.now() - DIAS_FINALIZADO * 24 * 60 * 60 * 1000).toISOString();
    const limiteMorto = new Date(Date.now() - DIAS_LEAD_MORTO * 24 * 60 * 60 * 1000).toISOString();

    // 1. ARQUIVAR FINALIZADOS ANTIGOS
    const { data: finalizadosArquivados, error: errFin } = await client
      .from('dados_cliente')
      .update({ status: 'arquivado' })
      .eq('status', 'ativo')
      .eq('stage', 'finalizado')
      .lt('updated_at', limiteFinalizado)
      .select('id');

    if (errFin) {
      console.error('[ARQUIVAR] Erro ao arquivar finalizados:', errFin);
      throw errFin;
    }

    const totalFinalizados = finalizadosArquivados?.length || 0;
    console.log(`[ARQUIVAR] ${totalFinalizados} leads finalizados arquivados (>${DIAS_FINALIZADO}d)`);

    // 2. ARQUIVAR LEADS MORTOS ANTIGOS
    const { data: mortosArquivados, error: errMor } = await client
      .from('dados_cliente')
      .update({ status: 'arquivado' })
      .eq('status', 'ativo')
      .eq('stage', 'lead_morto')
      .lt('updated_at', limiteMorto)
      .select('id');

    if (errMor) {
      console.error('[ARQUIVAR] Erro ao arquivar mortos:', errMor);
      throw errMor;
    }

    const totalMortos = mortosArquivados?.length || 0;
    console.log(`[ARQUIVAR] ${totalMortos} leads mortos arquivados (>${DIAS_LEAD_MORTO}d)`);

    const tempo_ms = Date.now() - inicio;
    console.log(`[ARQUIVAR] ✅ Concluído em ${tempo_ms}ms — Total: ${totalFinalizados + totalMortos}`);

    return NextResponse.json({
      success: true,
      data: {
        finalizados_arquivados: totalFinalizados,
        mortos_arquivados: totalMortos,
        total: totalFinalizados + totalMortos,
        criterios: {
          dias_finalizado: DIAS_FINALIZADO,
          dias_lead_morto: DIAS_LEAD_MORTO,
        },
        tempo_ms,
      },
      message: `Arquivados: ${totalFinalizados} finalizados + ${totalMortos} mortos = ${totalFinalizados + totalMortos} total`,
    });

  } catch (error: any) {
    console.error('[ARQUIVAR] ERRO:', error);
    return NextResponse.json(
      { error: 'Erro no arquivamento', success: false, details: error.message },
      { status: 500 }
    );
  }
}

// GET para checar quantos seriam arquivados (preview, sem alterar nada)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;

    const limiteFinalizado = new Date(Date.now() - DIAS_FINALIZADO * 24 * 60 * 60 * 1000).toISOString();
    const limiteMorto = new Date(Date.now() - DIAS_LEAD_MORTO * 24 * 60 * 60 * 1000).toISOString();

    const { count: finalizadosCount } = await client
      .from('dados_cliente')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ativo')
      .eq('stage', 'finalizado')
      .lt('updated_at', limiteFinalizado);

    const { count: mortosCount } = await client
      .from('dados_cliente')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ativo')
      .eq('stage', 'lead_morto')
      .lt('updated_at', limiteMorto);

    const { count: arquivadosTotal } = await client
      .from('dados_cliente')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'arquivado');

    return NextResponse.json({
      success: true,
      data: {
        seriam_arquivados: {
          finalizados: finalizadosCount || 0,
          mortos: mortosCount || 0,
          total: (finalizadosCount || 0) + (mortosCount || 0),
        },
        ja_arquivados: arquivadosTotal || 0,
        criterios: {
          dias_finalizado: DIAS_FINALIZADO,
          dias_lead_morto: DIAS_LEAD_MORTO,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
}
