// ===========================================
// API: /api/dashboard/periodo?dias=7|30|90
// GET: Métricas históricas (funnel, conversão, tempo médio, taxa resposta)
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const diasParam = parseInt(searchParams.get('dias') || '7');
    const dias = [7, 30, 90].includes(diasParam) ? diasParam : 7;

    const client = supabaseAdmin || supabase;
    const limiteMs = Date.now() - dias * 24 * 60 * 60 * 1000;
    const limite = new Date(limiteMs).toISOString();

    // ============================================
    // 1. FUNNEL — leads CRIADOS no período por stage atual
    // (vê quantos viraram cada coisa)
    // ============================================
    const { data: leadsPeriodo } = await client
      .from('dados_cliente')
      .select('id, stage, status, created_at, data_ativacao')
      .gte('created_at', limite);

    const leads = leadsPeriodo || [];
    const totalNovos = leads.length;

    // Conta leads que passaram por cada estágio (via stage atual + ressuscitação)
    // Como não temos histórico de stage, usamos estado atual
    const stageCount = {
      novo: 0,
      qualificado: 0,
      finalizado: 0,
      lead_morto: 0,
    };

    leads.forEach((l: any) => {
      const stage = l.stage || 'novo';
      if (stage === 'em_atendimento' || stage === 'proposta') {
        stageCount.novo++;
      } else if (stage in stageCount) {
        stageCount[stage as keyof typeof stageCount]++;
      } else {
        stageCount.novo++;
      }
    });

    // Funnel acumulativo: ativados ⊆ qualificados ⊆ novos
    // (lead que está finalizado, passou por qualificado antes)
    const funnelTotal = {
      novos: totalNovos,
      qualificados: stageCount.qualificado + stageCount.finalizado,
      finalizados: stageCount.finalizado,
      mortos: stageCount.lead_morto,
    };

    // ============================================
    // 2. TAXA DE CONVERSÃO LEAD → ATIVADO
    // ============================================
    const taxaConversao = totalNovos > 0
      ? Math.round((funnelTotal.finalizados / totalNovos) * 1000) / 10
      : 0;

    // ============================================
    // 3. TEMPO MÉDIO ATÉ ATIVAR
    // ============================================
    const tempos: number[] = [];
    leads.forEach((l: any) => {
      if (l.stage === 'finalizado' && l.created_at && l.data_ativacao) {
        const criado = new Date(l.created_at).getTime();
        const ativado = new Date(l.data_ativacao).getTime();
        if (ativado > criado) {
          tempos.push((ativado - criado) / (24 * 60 * 60 * 1000));
        }
      }
    });

    const tempoMedioDias = tempos.length > 0
      ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10
      : null;

    // ============================================
    // 4. TAXA DE RESPOSTA DE FOLLOW-UPS
    // ============================================
    const { data: fupsConcluidos } = await client
      .from('tatiane_followups')
      .select('id, chat_lid, enviado_em')
      .eq('status', 'concluido')
      .not('enviado_em', 'is', null)
      .not('chat_lid', 'is', null)
      .gte('enviado_em', limite);

    const fups = fupsConcluidos || [];
    const totalFollowups = fups.length;

    let respondidos = 0;
    if (fups.length > 0) {
      const chatLids = Array.from(new Set(fups.map((f: any) => f.chat_lid).filter(Boolean)));
      const { data: msgsHuman } = await client
        .from('tatiane_chat_histories')
        .select('session_id, created_at')
        .in('session_id', chatLids)
        .eq('message_type', 'human')
        .gte('created_at', limite);

      const msgsBySession = new Map<string, string[]>();
      (msgsHuman || []).forEach((m: any) => {
        if (!msgsBySession.has(m.session_id)) msgsBySession.set(m.session_id, []);
        msgsBySession.get(m.session_id)!.push(m.created_at);
      });

      for (const f of fups) {
        const enviadoMs = new Date(f.enviado_em).getTime();
        const limite48hMs = enviadoMs + 48 * 60 * 60 * 1000;
        const msgs = msgsBySession.get(f.chat_lid as string) || [];
        if (msgs.some(ts => {
          const t = new Date(ts).getTime();
          return t > enviadoMs && t < limite48hMs;
        })) {
          respondidos++;
        }
      }
    }

    const taxaRespostaFollowup = totalFollowups > 0
      ? Math.round((respondidos / totalFollowups) * 1000) / 10
      : 0;

    // ============================================
    // 5. ATIVIDADE GERAL (mensagens, follow-ups por dia)
    // Pra gráfico de linha temporal
    // ============================================
    const { data: msgsDiarias } = await client
      .from('tatiane_chat_histories')
      .select('created_at, message_type')
      .gte('created_at', limite)
      .order('created_at', { ascending: true });

    const porDia = new Map<string, { ia: number; humanas: number }>();
    (msgsDiarias || []).forEach((m: any) => {
      const dia = m.created_at.slice(0, 10); // YYYY-MM-DD
      if (!porDia.has(dia)) porDia.set(dia, { ia: 0, humanas: 0 });
      const stats = porDia.get(dia)!;
      if (m.message_type === 'human') stats.humanas++;
      else stats.ia++;
    });

    const serieTemporalMsgs = Array.from(porDia.entries())
      .map(([dia, stats]) => ({ dia, ...stats }))
      .sort((a, b) => a.dia.localeCompare(b.dia));

    // ============================================
    // 6. NOVOS LEADS POR DIA (pra ver tendência)
    // ============================================
    const novosPorDia = new Map<string, number>();
    leads.forEach((l: any) => {
      if (l.created_at) {
        const dia = l.created_at.slice(0, 10);
        novosPorDia.set(dia, (novosPorDia.get(dia) || 0) + 1);
      }
    });

    const serieTemporalLeads = Array.from(novosPorDia.entries())
      .map(([dia, total]) => ({ dia, total }))
      .sort((a, b) => a.dia.localeCompare(b.dia));

    return NextResponse.json({
      success: true,
      data: {
        periodo_dias: dias,
        funnel: funnelTotal,
        taxa_conversao_pct: taxaConversao,
        tempo_medio_ativar_dias: tempoMedioDias,
        followups: {
          total: totalFollowups,
          respondidos,
          taxa_resposta_pct: taxaRespostaFollowup,
        },
        serie_temporal_msgs: serieTemporalMsgs,
        serie_temporal_leads: serieTemporalLeads,
      },
    });
  } catch (error: any) {
    console.error('[dashboard/periodo] Erro:', error);
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
}
