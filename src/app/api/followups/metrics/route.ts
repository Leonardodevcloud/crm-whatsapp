// ===========================================
// API: /api/followups/metrics
// GET: Retorna métricas agregadas dos follow-ups da Tatiane
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
    const client = supabaseAdmin || supabase;

    // Período 24h
    const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const limite7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const limite30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const agora = new Date().toISOString();

    // ============================================
    // 1. CONTAGENS DE ENVIO
    // ============================================
    const { count: enviados24h } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'concluido')
      .gte('enviado_em', limite24h);

    const { count: enviados7d } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'concluido')
      .gte('enviado_em', limite7d);

    const { count: enviados30d } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'concluido')
      .gte('enviado_em', limite30d);

    // ============================================
    // 2. PENDENTES / ATRASADOS
    // ============================================
    const { count: atrasados } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendente')
      .lte('data_agendada', agora);

    const { count: pendentesTotal } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendente');

    // ============================================
    // 3. ÚLTIMO ENVIO
    // ============================================
    const { data: ultimoEnvio } = await client
      .from('tatiane_followups')
      .select('enviado_em')
      .eq('status', 'concluido')
      .not('enviado_em', 'is', null)
      .order('enviado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    // ============================================
    // 4. TAXA DE RESPOSTA (últimos 7 e 30 dias)
    // Calculamos via SQL bruta porque envolve EXISTS subquery
    // ============================================
    const { data: taxaData, error: taxaErr } = await client.rpc('calcular_taxa_resposta_followups', {
      dias_analise: 30,
    });

    let taxaResposta7d = 0;
    let taxaResposta30d = 0;
    let totalRespondidos7d = 0;
    let totalRespondidos30d = 0;

    if (taxaErr || !taxaData) {
      // RPC não existe — calcular manualmente buscando os concluídos e checando histories
      console.warn('[metrics] RPC indisponível, calculando manualmente:', taxaErr?.message);

      // Pega últimos 30 dias de followups concluídos com chat_lid
      const { data: followupsConcluidos } = await client
        .from('tatiane_followups')
        .select('id, lead_id, chat_lid, enviado_em')
        .eq('status', 'concluido')
        .not('enviado_em', 'is', null)
        .not('chat_lid', 'is', null)
        .gte('enviado_em', limite30d);

      const fups = followupsConcluidos || [];

      // Para cada um, ver se há mensagem 'human' nas próximas 48h
      // OTIMIZAÇÃO: pega todas as mensagens 'human' do período de uma vez
      const chatLids = Array.from(new Set(fups.map(f => f.chat_lid).filter(Boolean)));
      const { data: msgsHuman } = await client
        .from('tatiane_chat_histories')
        .select('session_id, created_at')
        .in('session_id', chatLids)
        .eq('message_type', 'human')
        .gte('created_at', limite30d);

      // Indexar mensagens humanas por session_id (timestamps ordenados)
      const msgsBySession = new Map<string, string[]>();
      (msgsHuman || []).forEach(m => {
        if (!msgsBySession.has(m.session_id)) msgsBySession.set(m.session_id, []);
        msgsBySession.get(m.session_id)!.push(m.created_at);
      });

      let total7d = 0, resp7d = 0;
      let total30d = 0, resp30d = 0;

      for (const f of fups) {
        const enviadoEm = new Date(f.enviado_em).getTime();
        const limite48h = enviadoEm + 48 * 60 * 60 * 1000;

        // Verificar se há resposta humana entre enviado_em e enviado_em+48h
        const msgs = msgsBySession.get(f.chat_lid as string) || [];
        const respondeu = msgs.some(ts => {
          const t = new Date(ts).getTime();
          return t > enviadoEm && t < limite48h;
        });

        total30d++;
        if (respondeu) resp30d++;

        if (enviadoEm >= new Date(limite7d).getTime()) {
          total7d++;
          if (respondeu) resp7d++;
        }
      }

      taxaResposta7d = total7d > 0 ? Math.round((resp7d / total7d) * 1000) / 10 : 0;
      taxaResposta30d = total30d > 0 ? Math.round((resp30d / total30d) * 1000) / 10 : 0;
      totalRespondidos7d = resp7d;
      totalRespondidos30d = resp30d;
    }

    return NextResponse.json({
      success: true,
      data: {
        enviados: {
          ultimas_24h: enviados24h || 0,
          ultimos_7d: enviados7d || 0,
          ultimos_30d: enviados30d || 0,
        },
        pendentes: {
          atrasados: atrasados || 0,
          total: pendentesTotal || 0,
        },
        taxa_resposta: {
          ultimos_7d: taxaResposta7d,
          ultimos_30d: taxaResposta30d,
          respondidos_7d: totalRespondidos7d,
          respondidos_30d: totalRespondidos30d,
        },
        ultimo_envio: ultimoEnvio?.enviado_em || null,
      },
    });
  } catch (error: any) {
    console.error('[followups/metrics] Erro:', error);
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
}
