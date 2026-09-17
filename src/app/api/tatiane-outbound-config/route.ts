// ===========================================
// API: /api/tatiane-outbound-config  (CONFIG_CONTATO_V1)
// GET: le a config do contato automatico da Tatiane (singleton id=1)
// PUT: atualiza { ativo, leads_por_dia, dias_apos_chegada }
//
// A mesma linha e lida pelo worker da Tatiane (outbound-d2.worker.js)
// via conexao pg direta no mesmo banco (Supabase).
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const DEFAULTS = { id: 1, ativo: false, leads_por_dia: 20, dias_apos_chegada: 2 };

export async function GET(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('tatiane_outbound_config')
      .select('id, ativo, leads_por_dia, dias_apos_chegada, updated_at, updated_by')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ success: true, data: data || DEFAULTS });
  } catch (e: any) {
    console.error('[tatiane-outbound-config][GET]', e.message);
    return NextResponse.json({ error: e.message, success: false }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({} as any));

    const ativo = body.ativo === true || body.ativo === 'true';

    let leadsPorDia = parseInt(body.leads_por_dia, 10);
    let diasApos = parseInt(body.dias_apos_chegada, 10);
    if (!Number.isFinite(leadsPorDia)) leadsPorDia = DEFAULTS.leads_por_dia;
    if (!Number.isFinite(diasApos)) diasApos = DEFAULTS.dias_apos_chegada;
    leadsPorDia = Math.max(0, Math.min(500, leadsPorDia));
    diasApos = Math.max(0, Math.min(60, diasApos));

    const client = supabaseAdmin || supabase;
    const { data, error } = await client
      .from('tatiane_outbound_config')
      .upsert(
        {
          id: 1,
          ativo,
          leads_por_dia: leadsPorDia,
          dias_apos_chegada: diasApos,
          updated_at: new Date().toISOString(),
          updated_by: (user as any)?.id ?? null,
        },
        { onConflict: 'id' }
      )
      .select('id, ativo, leads_por_dia, dias_apos_chegada, updated_at, updated_by')
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('[tatiane-outbound-config][PUT]', e.message);
    return NextResponse.json({ error: e.message, success: false }, { status: 500 });
  }
}
