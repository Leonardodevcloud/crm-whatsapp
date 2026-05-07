// ===========================================
// API: /api/dashboard/alertas
// GET: Detecta automaticamente problemas no sistema
//
// Alertas críticos: cron parado, Tatiane sem atividade, Z-API falhando
// Alertas operacionais: leads pausados, follow-ups atrasados, sem chat_lid, backlog
// Alertas de performance: taxa de resposta caiu, conversão caiu
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

type Severidade = 'critico' | 'aviso' | 'info';

interface Alerta {
  id: string;
  severidade: Severidade;
  titulo: string;
  descricao: string;
  valor?: string | number;
  link?: string; // Caminho interno (ex: /kanban?filtro=morto)
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  const alertas: Alerta[] = [];
  const client = supabaseAdmin || supabase;

  try {
    const agora = new Date();
    const ha1h = new Date(agora.getTime() - 1 * 60 * 60 * 1000).toISOString();
    const ha2h = new Date(agora.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const ha24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const ha48h = new Date(agora.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const ha3d = new Date(agora.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const ha7d = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ha30d = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ============================================
    // 1. CRON ENRIQUECIMENTO PARADO (>1h)
    // ============================================
    const { data: ultimoEnriq } = await client
      .from('dados_cliente')
      .select('last_enriched_at')
      .not('last_enriched_at', 'is', null)
      .order('last_enriched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultimoEnriq?.last_enriched_at) {
      const ultimoMs = new Date(ultimoEnriq.last_enriched_at).getTime();
      const horasAtraso = Math.floor((agora.getTime() - ultimoMs) / (60 * 60 * 1000));
      if (horasAtraso > 1) {
        alertas.push({
          id: 'cron_enriquecimento_parado',
          severidade: horasAtraso > 24 ? 'critico' : 'aviso',
          titulo: 'Cron de enriquecimento parado',
          descricao: `Última execução há ${horasAtraso}h. Configure o n8n ou Vercel Cron pra disparar /api/cron/enriquecimento.`,
          valor: `${horasAtraso}h`,
        });
      }
    }

    // ============================================
    // 2. TATIANE PARADA (sem mensagens há 2h)
    // ============================================
    const { data: ultimaMsg } = await client
      .from('tatiane_chat_histories')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultimaMsg?.created_at) {
      const ultimaMs = new Date(ultimaMsg.created_at).getTime();
      const horasParada = Math.floor((agora.getTime() - ultimaMs) / (60 * 60 * 1000));
      // Só alerta se passou de 2h em horário comercial (8h-20h Salvador)
      const horaSalvador = parseInt(
        new Date().toLocaleString('en-US', { timeZone: 'America/Bahia', hour: 'numeric', hour12: false })
      );
      const horarioComercial = horaSalvador >= 8 && horaSalvador < 20;
      if (horasParada >= 2 && horarioComercial) {
        alertas.push({
          id: 'tatiane_parada',
          severidade: horasParada > 6 ? 'critico' : 'aviso',
          titulo: 'Tatiane sem atividade',
          descricao: `Nenhuma mensagem há ${horasParada}h em horário comercial. Verifique Railway/Z-API.`,
          valor: `${horasParada}h`,
        });
      }
    } else {
      alertas.push({
        id: 'tatiane_sem_dados',
        severidade: 'critico',
        titulo: 'Sem registros de mensagens',
        descricao: 'Nenhuma mensagem registrada em tatiane_chat_histories.',
      });
    }

    // ============================================
    // 3. Z-API FALHANDO (>5 follow-ups com falha em 24h)
    // ============================================
    const { count: falhas24h } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'falha')
      .gte('updated_at', ha24h);

    if ((falhas24h || 0) > 5) {
      alertas.push({
        id: 'zapi_falhando',
        severidade: 'critico',
        titulo: 'Z-API falhando',
        descricao: `${falhas24h} follow-ups com status="falha" nas últimas 24h. Verifique credenciais/saúde da Z-API.`,
        valor: falhas24h || 0,
      });
    }

    // ============================================
    // 4. LEADS PAUSADOS POR HUMANO HÁ 48H+
    // ============================================
    const { count: pausadosLongo } = await client
      .from('dados_cliente')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ativo')
      .eq('pausado_por', 'humano_celular')
      .lt('pausado_em', ha48h);

    if ((pausadosLongo || 0) > 0) {
      alertas.push({
        id: 'pausados_longos',
        severidade: 'aviso',
        titulo: `${pausadosLongo} leads pausados por humano há 48h+`,
        descricao: 'Possivelmente esquecidos. Reative a IA ou conclua o atendimento manualmente.',
        valor: pausadosLongo || 0,
        link: '/kanban',
      });
    }

    // ============================================
    // 5. FOLLOW-UPS ATRASADOS NÃO PROCESSADOS (>24h)
    // ============================================
    const { count: fupsMuitoAtrasados } = await client
      .from('tatiane_followups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pendente')
      .lt('data_agendada', ha24h);

    if ((fupsMuitoAtrasados || 0) > 0) {
      alertas.push({
        id: 'fups_muito_atrasados',
        severidade: (fupsMuitoAtrasados || 0) > 20 ? 'critico' : 'aviso',
        titulo: `${fupsMuitoAtrasados} follow-ups atrasados há 24h+`,
        descricao: 'Worker da Tatiane pode estar travado ou condições da query bloqueando.',
        valor: fupsMuitoAtrasados || 0,
        link: '/followups',
      });
    }

    // ============================================
    // 6. LEADS SEM chat_lid (não recebem follow-up automático)
    // Só conta os ativos novos/qualificados
    // ============================================
    const { count: semChatLid } = await client
      .from('dados_cliente')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ativo')
      .in('stage', ['novo', 'qualificado'])
      .is('chat_lid', null);

    if ((semChatLid || 0) > 10) {
      alertas.push({
        id: 'sem_chat_lid',
        severidade: 'info',
        titulo: `${semChatLid} leads sem chat_lid`,
        descricao: 'Esses leads não recebem follow-up automático nem podem ser respondidos pela Tatiane.',
        valor: semChatLid || 0,
      });
    }

    // ============================================
    // 7. BACKLOG DE CADASTROS (sem cod_profissional há 3+ dias)
    // ============================================
    const { count: backlog } = await client
      .from('dados_cliente')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ativo')
      .is('cod_profissional', null)
      .lt('created_at', ha3d);

    if ((backlog || 0) > 5) {
      alertas.push({
        id: 'backlog_cadastros',
        severidade: 'info',
        titulo: `${backlog} leads sem código profissional há 3d+`,
        descricao: 'Não foram encontrados na planilha Tutts. Pode ser falha de enriquecimento ou leads que não viraram cadastro.',
        valor: backlog || 0,
      });
    }

    // ============================================
    // 8. TAXA DE RESPOSTA CAIU (últimos 7d vs anteriores 30d)
    // ============================================
    const { data: fupsRecentes } = await client
      .from('tatiane_followups')
      .select('id, chat_lid, enviado_em')
      .eq('status', 'concluido')
      .not('enviado_em', 'is', null)
      .not('chat_lid', 'is', null)
      .gte('enviado_em', ha30d);

    const fupsArr = fupsRecentes || [];
    if (fupsArr.length > 30) {
      const chatLids = Array.from(new Set(fupsArr.map((f: any) => f.chat_lid).filter(Boolean)));
      const { data: msgsHuman } = await client
        .from('tatiane_chat_histories')
        .select('session_id, created_at')
        .in('session_id', chatLids)
        .eq('message_type', 'human')
        .gte('created_at', ha30d);

      const msgsBySession = new Map<string, string[]>();
      (msgsHuman || []).forEach((m: any) => {
        if (!msgsBySession.has(m.session_id)) msgsBySession.set(m.session_id, []);
        msgsBySession.get(m.session_id)!.push(m.created_at);
      });

      const calc = (arr: any[]) => {
        if (!arr.length) return 0;
        let resp = 0;
        for (const f of arr) {
          const enviadoMs = new Date(f.enviado_em).getTime();
          const limite48h = enviadoMs + 48 * 60 * 60 * 1000;
          const msgs = msgsBySession.get(f.chat_lid as string) || [];
          if (msgs.some(ts => {
            const t = new Date(ts).getTime();
            return t > enviadoMs && t < limite48h;
          })) resp++;
        }
        return Math.round((resp / arr.length) * 1000) / 10;
      };

      const ms7d = new Date(ha7d).getTime();
      const fups7d = fupsArr.filter((f: any) => new Date(f.enviado_em).getTime() >= ms7d);
      const fupsAnteriores = fupsArr.filter((f: any) => new Date(f.enviado_em).getTime() < ms7d);

      if (fups7d.length >= 10 && fupsAnteriores.length >= 30) {
        const taxaRecente = calc(fups7d);
        const taxaAnterior = calc(fupsAnteriores);
        if (taxaRecente > 0 && taxaAnterior > 0 && taxaRecente < taxaAnterior * 0.7) {
          alertas.push({
            id: 'taxa_resposta_caiu',
            severidade: 'aviso',
            titulo: 'Taxa de resposta caiu',
            descricao: `Últimos 7 dias: ${taxaRecente}%. Anteriores 23 dias: ${taxaAnterior}%. Queda significativa.`,
            valor: `${taxaRecente}% vs ${taxaAnterior}%`,
          });
        }
      }
    }

    // ============================================
    // 9. CONVERSÃO LEAD→ATIVO CAIU (mesmo padrão)
    // ============================================
    const { data: leadsHistorico } = await client
      .from('dados_cliente')
      .select('created_at, stage')
      .gte('created_at', ha30d);

    const lh = leadsHistorico || [];
    if (lh.length > 30) {
      const ms7d = new Date(ha7d).getTime();
      const recentes = lh.filter((l: any) => new Date(l.created_at).getTime() >= ms7d);
      const anteriores = lh.filter((l: any) => new Date(l.created_at).getTime() < ms7d);

      if (recentes.length >= 10 && anteriores.length >= 20) {
        const calcConv = (arr: any[]) => {
          const ativos = arr.filter((l: any) => l.stage === 'finalizado').length;
          return arr.length > 0 ? Math.round((ativos / arr.length) * 1000) / 10 : 0;
        };
        const convRecente = calcConv(recentes);
        const convAnterior = calcConv(anteriores);
        if (convRecente > 0 && convAnterior > 0 && convRecente < convAnterior * 0.7) {
          alertas.push({
            id: 'conversao_caiu',
            severidade: 'aviso',
            titulo: 'Conversão lead→ativo caiu',
            descricao: `Últimos 7 dias: ${convRecente}%. Anteriores 23 dias: ${convAnterior}%. Algo mudou no funil.`,
            valor: `${convRecente}% vs ${convAnterior}%`,
          });
        }
      }
    }

    // ============================================
    // ORDENAR POR SEVERIDADE
    // ============================================
    const ordem: Record<Severidade, number> = { critico: 0, aviso: 1, info: 2 };
    alertas.sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);

    return NextResponse.json({
      success: true,
      data: {
        alertas,
        total: alertas.length,
        por_severidade: {
          critico: alertas.filter(a => a.severidade === 'critico').length,
          aviso: alertas.filter(a => a.severidade === 'aviso').length,
          info: alertas.filter(a => a.severidade === 'info').length,
        },
      },
    });
  } catch (error: any) {
    console.error('[dashboard/alertas] Erro:', error);
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500 }
    );
  }
}
