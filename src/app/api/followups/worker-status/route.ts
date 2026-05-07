// ===========================================
// API: /api/followups/worker-status
// GET: Retorna status operacional do worker de follow-up
// - Total de pendentes (sem filtro de data)
// - Última rodada (timestamp + quantos foram enviados)
// - Próxima rodada (calculada com base no schedule */30 8-20 * * *)
// - Enviados 24h, 7d
// - Taxa resposta 7d, 30d
// - Histórico das últimas 6 rodadas
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const TZ = 'America/Bahia';

// Calcula a próxima rodada considerando schedule */30 8-20 * * * em Salvador
function calcularProximaRodada(): string {
  const agora = new Date();
  // Hora atual em Salvador (UTC-3)
  const agoraSalvador = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const horaSalvador = agoraSalvador.getUTCHours();
  const minutoSalvador = agoraSalvador.getUTCMinutes();

  let proximaHora = horaSalvador;
  let proximoMinuto = minutoSalvador < 30 ? 30 : 0;
  if (proximoMinuto === 0) proximaHora += 1;

  // Fora da janela 8h-20h: próxima é 8h do dia seguinte (ou 8h hoje se for madrugada)
  if (proximaHora < 8) {
    proximaHora = 8;
    proximoMinuto = 0;
  } else if (proximaHora > 20 || (proximaHora === 20 && proximoMinuto > 0)) {
    // Próximo dia 8h
    const proximoDia = new Date(agoraSalvador);
    proximoDia.setUTCDate(proximoDia.getUTCDate() + 1);
    proximoDia.setUTCHours(8, 0, 0, 0);
    return new Date(proximoDia.getTime() + 3 * 60 * 60 * 1000).toISOString();
  }

  const proxima = new Date(agoraSalvador);
  proxima.setUTCHours(proximaHora, proximoMinuto, 0, 0);
  return new Date(proxima.getTime() + 3 * 60 * 60 * 1000).toISOString();
}

// Agrupa enviados em "rodadas" — burst de envios consecutivos com gap < 5min
function agruparRodadas(enviados: Array<{ enviado_em: string }>): Array<{ inicio: string; total: number }> {
  if (enviados.length === 0) return [];

  // Ordena por data
  const ordenado = [...enviados].sort((a, b) =>
    new Date(a.enviado_em).getTime() - new Date(b.enviado_em).getTime()
  );

  const rodadas: Array<{ inicio: string; total: number }> = [];
  let rodadaAtual = { inicio: ordenado[0].enviado_em, total: 1 };

  for (let i = 1; i < ordenado.length; i++) {
    const anterior = new Date(ordenado[i - 1].enviado_em).getTime();
    const atual = new Date(ordenado[i].enviado_em).getTime();
    const gapMin = (atual - anterior) / 60000;

    if (gapMin < 5) {
      // Mesma rodada
      rodadaAtual.total++;
    } else {
      // Nova rodada
      rodadas.push(rodadaAtual);
      rodadaAtual = { inicio: ordenado[i].enviado_em, total: 1 };
    }
  }
  rodadas.push(rodadaAtual);

  // Retorna últimas 6, mais recente primeiro
  return rodadas.reverse().slice(0, 6);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;
    const agora = new Date();
    const ha24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const ha7d = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ha30d = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ha8h = new Date(agora.getTime() - 8 * 60 * 60 * 1000).toISOString();

    // ============================================
    // 1. TOTAL PENDENTES (sem filtro de data)
    // ============================================
    const { count: totalPendentes } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendente');

    // ============================================
    // 2. ATRASADOS (pendente E data_agendada < agora)
    // ============================================
    const { count: atrasados } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendente')
      .lt('data_agendada', agora.toISOString());

    // ============================================
    // 3. ENVIADOS 24h e 7d
    // ============================================
    const { count: enviados24h } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'concluido')
      .gte('enviado_em', ha24h);

    const { count: enviados7d } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'concluido')
      .gte('enviado_em', ha7d);

    // ============================================
    // 4. ÚLTIMO ENVIO + HISTÓRICO DE RODADAS
    // Lê direto de tatiane_worker_runs (registra TODAS as rodadas,
    // incluindo vazias e as puladas por janela horária).
    // Fallback: se a tabela ainda não existir, usa lógica antiga (agrupar enviados).
    // ============================================
    let rodadas: Array<{ inicio: string; enviados: number; pulou_janela?: boolean; falhas?: number }> = [];
    let ultimoEnvio: string | null = null;

    try {
      const { data: rodadasTabela, error: errRodadas } = await client
        .from('tatiane_worker_runs')
        .select('iniciado_em, enviados, pulou_janela, falhas')
        .eq('worker', 'followup')
        .order('iniciado_em', { ascending: false })
        .limit(8);

      if (errRodadas) throw errRodadas;

      rodadas = (rodadasTabela || []).map((r: any) => ({
        inicio: r.iniciado_em,
        enviados: r.enviados || 0,
        pulou_janela: r.pulou_janela || false,
        falhas: r.falhas || 0,
      }));

      // Pega o último envio real de followup pra subtítulo
      const { data: ultimoEnviado } = await client
        .from('tatiane_followups')
        .select('enviado_em')
        .eq('status', 'concluido')
        .not('enviado_em', 'is', null)
        .order('enviado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      ultimoEnvio = ultimoEnviado?.enviado_em || null;
    } catch (errFb: any) {
      // Fallback (tabela ainda não existe): agrupa enviados como antes
      console.warn('[worker-status] Fallback agrupar:', errFb.message);
      const { data: enviadosRecentes } = await client
        .from('tatiane_followups')
        .select('enviado_em')
        .eq('status', 'concluido')
        .not('enviado_em', 'is', null)
        .gte('enviado_em', ha8h)
        .order('enviado_em', { ascending: false });
      const grupos = agruparRodadas(enviadosRecentes || []);
      rodadas = grupos.map(g => ({
        inicio: g.inicio,
        enviados: g.total,
        pulou_janela: false,
        falhas: 0,
      }));
      ultimoEnvio = enviadosRecentes?.[0]?.enviado_em || null;
    }

    const ultimaRodada = rodadas[0] || null;

    // ============================================
    // 5. TAXA DE RESPOSTA 7d e 30d
    // (resposta humana em até 48h após o envio)
    // ============================================
    const calcularTaxa = async (limite: string) => {
      const { data: fups } = await client
        .from('tatiane_followups')
        .select('id, chat_lid, enviado_em')
        .eq('status', 'concluido')
        .not('enviado_em', 'is', null)
        .not('chat_lid', 'is', null)
        .gte('enviado_em', limite);

      const arr = fups || [];
      if (arr.length === 0) return { total: 0, respondidos: 0, taxa_pct: 0 };

      const chatLids = Array.from(new Set(arr.map((f: any) => f.chat_lid).filter(Boolean)));
      const { data: msgsHum } = await client
        .from('tatiane_chat_histories')
        .select('session_id, created_at')
        .in('session_id', chatLids)
        .eq('message_type', 'human')
        .gte('created_at', limite);

      const msgsBySession = new Map<string, string[]>();
      (msgsHum || []).forEach((m: any) => {
        if (!msgsBySession.has(m.session_id)) msgsBySession.set(m.session_id, []);
        msgsBySession.get(m.session_id)!.push(m.created_at);
      });

      let respondidos = 0;
      for (const f of arr) {
        const enviadoMs = new Date(f.enviado_em).getTime();
        const limite48h = enviadoMs + 48 * 60 * 60 * 1000;
        const msgs = msgsBySession.get(f.chat_lid as string) || [];
        if (msgs.some(ts => {
          const t = new Date(ts).getTime();
          return t > enviadoMs && t < limite48h;
        })) respondidos++;
      }

      return {
        total: arr.length,
        respondidos,
        taxa_pct: Math.round((respondidos / arr.length) * 1000) / 10,
      };
    };

    const taxa7d = await calcularTaxa(ha7d);
    const taxa30d = await calcularTaxa(ha30d);

    // ============================================
    // 6. PRÓXIMA RODADA (calculada via schedule)
    // ============================================
    const proximaRodada = calcularProximaRodada();

    // ============================================
    // 7. PRÓXIMOS 7 DIAS (pendentes futuros)
    // ============================================
    const em7d = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: prox7d } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendente')
      .gte('data_agendada', agora.toISOString())
      .lte('data_agendada', em7d);

    // ============================================
    // 8. ENVIADOS HOJE (em horário Salvador)
    // ============================================
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const ano = partes.find(p => p.type === 'year')?.value;
    const mes = partes.find(p => p.type === 'month')?.value;
    const dia = partes.find(p => p.type === 'day')?.value;
    const inicioDiaSalvador = `${ano}-${mes}-${dia}T03:00:00.000Z`;

    const { count: enviadosHoje } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'concluido')
      .gte('enviado_em', inicioDiaSalvador);

    return NextResponse.json({
      success: true,
      data: {
        // KPIs principais
        total_pendentes: totalPendentes || 0,
        atrasados: atrasados || 0,
        enviados_hoje: enviadosHoje || 0,
        prox_7_dias: prox7d || 0,

        // Card "Tatiane IA"
        ultima_rodada: ultimaRodada ? {
          inicio: ultimaRodada.inicio,
          enviados: ultimaRodada.enviados,
          pulou_janela: ultimaRodada.pulou_janela || false,
        } : null,
        proxima_rodada: proximaRodada,
        ultimo_envio: ultimoEnvio,

        // Métricas de período
        enviados_24h: enviados24h || 0,
        enviados_7d: enviados7d || 0,
        taxa_resposta_7d: taxa7d,
        taxa_resposta_30d: taxa30d,

        // Histórico
        historico_rodadas: rodadas.map(r => ({
          inicio: r.inicio,
          enviados: r.enviados,
          pulou_janela: r.pulou_janela || false,
          falhas: r.falhas || 0,
        })),

        // Meta
        timestamp: agora.toISOString(),
        schedule: 'a cada 30 min, 8h-20h Salvador',
      },
    });
  } catch (error: any) {
    console.error('[followups/worker-status] Erro:', error);
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
}
