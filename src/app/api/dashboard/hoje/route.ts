// ===========================================
// API: /api/dashboard/hoje
// GET: Retorna métricas operacionais do dia atual (timezone Salvador)
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const TZ = 'America/Bahia';

// Helpers de timezone — pegar início e fim do dia em horário Salvador
function inicioDoDiaSalvadorISO(): string {
  // Pega "agora" em Salvador e zera hora/minuto/segundo
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const ano = partes.find(p => p.type === 'year')?.value;
  const mes = partes.find(p => p.type === 'month')?.value;
  const dia = partes.find(p => p.type === 'day')?.value;
  // Salvador é UTC-3, então 00:00 Salvador = 03:00 UTC
  return `${ano}-${mes}-${dia}T03:00:00.000Z`;
}

function fimDoDiaSalvadorISO(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const ano = partes.find(p => p.type === 'year')?.value;
  const mes = partes.find(p => p.type === 'month')?.value;
  const dia = partes.find(p => p.type === 'day')?.value;
  // 23:59:59 Salvador do dia atual = 02:59:59 UTC do dia seguinte
  const proximoDia = new Date(`${ano}-${mes}-${dia}T03:00:00.000Z`);
  proximoDia.setUTCDate(proximoDia.getUTCDate() + 1);
  return proximoDia.toISOString();
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;

    const inicioDia = inicioDoDiaSalvadorISO();
    const fimDia = fimDoDiaSalvadorISO();
    const ha2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const ha24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // ============================================
    // 1. CONVERSAS ATIVAS DA TATIANE (últimas 2h)
    // ============================================
    const { data: convAtivas } = await client
      .from('tatiane_chat_histories')
      .select('session_id', { count: 'exact' })
      .gte('created_at', ha2h);

    const sessionsUnicas = new Set((convAtivas || []).map((c: any) => c.session_id));
    const conversasAtivas = sessionsUnicas.size;

    // ============================================
    // 2. FOLLOW-UPS ENVIADOS HOJE
    // ============================================
    const { count: followupsEnviados } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'concluido')
      .gte('enviado_em', inicioDia)
      .lt('enviado_em', fimDia);

    // ============================================
    // 3. LEADS ATIVADOS HOJE
    // Usa data_ativacao (campo específico) em vez de updated_at
    // (updated_at mudaria toda vez que o lead recebe mensagem nova,
    // gerando contagem incorreta de "ativados hoje")
    // ============================================
    const { count: leadsAtivadosHoje } = await client
      .from('dados_cliente')
      .select('*', { count: 'exact', head: true })
      .eq('stage', 'finalizado')
      .gte('data_ativacao', inicioDia)
      .lt('data_ativacao', fimDia);

    // ============================================
    // 4. NOVOS LEADS HOJE
    // ============================================
    const { count: novosLeadsHoje } = await client
      .from('dados_cliente')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', inicioDia)
      .lt('created_at', fimDia);

    // ============================================
    // 5. MENSAGENS HOJE (atividade total)
    // ============================================
    const { count: msgsHoje } = await client
      .from('tatiane_chat_histories')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', inicioDia)
      .lt('created_at', fimDia);

    const { count: msgsHumanasHoje } = await client
      .from('tatiane_chat_histories')
      .select('*', { count: 'exact', head: true })
      .eq('message_type', 'human')
      .gte('created_at', inicioDia)
      .lt('created_at', fimDia);

    // ============================================
    // 6. ÚLTIMA ATIVIDADE TATIANE
    // ============================================
    const { data: ultimaMsg } = await client
      .from('tatiane_chat_histories')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      data: {
        conversas_ativas: conversasAtivas,
        followups_enviados_hoje: followupsEnviados || 0,
        leads_ativados_hoje: leadsAtivadosHoje || 0,
        novos_leads_hoje: novosLeadsHoje || 0,
        mensagens_hoje: {
          total: msgsHoje || 0,
          humanas: msgsHumanasHoje || 0,
          ia: (msgsHoje || 0) - (msgsHumanasHoje || 0),
        },
        ultima_atividade_tatiane: ultimaMsg?.created_at || null,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[dashboard/hoje] Erro:', error);
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
}
