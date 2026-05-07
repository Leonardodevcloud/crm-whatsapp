// ===========================================
// API: /api/dashboard/alertas
// GET: Retorna status operacional dos 3 componentes-chave da operação:
//   1. Tatiane (Chat IA)   → última mensagem AI recente?
//   2. Worker Follow-up    → última rodada recente?
//   3. Cron Enriquecimento → leads enriquecidos recentemente?
//
// Cada componente retorna status: "ok" | "atencao" | "critico"
// + última atividade + tempo desde então.
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// Limites em minutos: dentro do limite = ok, acima do crítico = critico
// Atenção = entre os dois (ainda não falhou de vez, mas anormal)
const LIMITES = {
  tatiane:        { atencao: 30,  critico: 90  },  // sem msg em 30min = atenção, 90min = crítico
  worker_followup:{ atencao: 60,  critico: 120 },  // sem rodada em 60min = atenção, 120min = crítico (cron 30min)
  cron_enriq:     { atencao: 30,  critico: 90  },  // sem enriquecimento em 30min = atenção, 90min = crítico (cron 15min)
};

// Janela operacional Salvador
const JANELA_INICIO = 8;
const JANELA_FIM = 20;

function dentroJanela(): boolean {
  const horaSP = new Date().toLocaleString('en-US', {
    timeZone: 'America/Bahia',
    hour: 'numeric',
    hour12: false,
  });
  const h = parseInt(horaSP, 10);
  return h >= JANELA_INICIO && h < JANELA_FIM;
}

function calcularStatus(
  ultimaAtividade: Date | null,
  limites: { atencao: number; critico: number },
  foraJanelaOk: boolean = false
): { status: 'ok' | 'atencao' | 'critico' | 'fora_janela'; minutos_desde: number | null } {
  // Fora da janela: alguns workers nem deveriam estar rodando
  if (foraJanelaOk && !dentroJanela()) {
    return { status: 'fora_janela', minutos_desde: null };
  }

  if (!ultimaAtividade) {
    return { status: 'critico', minutos_desde: null };
  }

  const minutos = Math.floor((Date.now() - ultimaAtividade.getTime()) / 60000);
  if (minutos <= limites.atencao) return { status: 'ok', minutos_desde: minutos };
  if (minutos <= limites.critico) return { status: 'atencao', minutos_desde: minutos };
  return { status: 'critico', minutos_desde: minutos };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    const client = supabaseAdmin || supabase;

    // ============================================
    // 1. TATIANE (Chat IA) — última mensagem AI
    // ============================================
    const { data: ultimaMsgIa } = await client
      .from('tatiane_chat_histories')
      .select('created_at')
      .eq('message_type', 'ai')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const dataTatiane = ultimaMsgIa?.created_at ? new Date(ultimaMsgIa.created_at) : null;
    const tatianeStatus = calcularStatus(dataTatiane, LIMITES.tatiane);

    // ============================================
    // 2. WORKER FOLLOW-UP — última rodada (qualquer status, incluindo vazia)
    // Só checamos durante janela 8h-20h (cron não roda fora dela)
    // ============================================
    let workerStatus: { status: 'ok' | 'atencao' | 'critico' | 'fora_janela'; minutos_desde: number | null; ultima_rodada: string | null };
    let dataWorker: Date | null = null;

    try {
      const { data: ultimaRodada } = await client
        .from('tatiane_worker_runs')
        .select('iniciado_em')
        .eq('worker', 'followup')
        .order('iniciado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      dataWorker = ultimaRodada?.iniciado_em ? new Date(ultimaRodada.iniciado_em) : null;
    } catch {
      // Tabela ainda não existe — fallback: olha o último envio
      const { data: ultimoEnvio } = await client
        .from('tatiane_followups')
        .select('enviado_em')
        .eq('status', 'concluido')
        .not('enviado_em', 'is', null)
        .order('enviado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      dataWorker = ultimoEnvio?.enviado_em ? new Date(ultimoEnvio.enviado_em) : null;
    }

    const wsCalc = calcularStatus(dataWorker, LIMITES.worker_followup, true);
    workerStatus = {
      ...wsCalc,
      ultima_rodada: dataWorker ? dataWorker.toISOString() : null,
    };

    // ============================================
    // 3. CRON ENRIQUECIMENTO — último lead enriquecido
    // ============================================
    const { data: ultimoEnriq } = await client
      .from('dados_cliente')
      .select('last_enriched_at')
      .not('last_enriched_at', 'is', null)
      .order('last_enriched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const dataEnriq = ultimoEnriq?.last_enriched_at ? new Date(ultimoEnriq.last_enriched_at) : null;
    const enriqStatus = calcularStatus(dataEnriq, LIMITES.cron_enriq, true);

    // ============================================
    // Resposta
    // ============================================
    return NextResponse.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        dentro_janela: dentroJanela(),
        componentes: [
          {
            id: 'tatiane',
            nome: 'Tatiane (Chat IA)',
            descricao: 'Responde mensagens dos leads no WhatsApp',
            status: tatianeStatus.status,
            minutos_desde: tatianeStatus.minutos_desde,
            ultima_atividade: dataTatiane ? dataTatiane.toISOString() : null,
            label_atividade: 'Última resposta',
          },
          {
            id: 'worker_followup',
            nome: 'Worker de Follow-up',
            descricao: 'Envia follow-ups automáticos (a cada 30min, 8h-20h)',
            status: workerStatus.status,
            minutos_desde: workerStatus.minutos_desde,
            ultima_atividade: workerStatus.ultima_rodada,
            label_atividade: 'Última rodada',
          },
          {
            id: 'cron_enriquecimento',
            nome: 'Cron Enriquecimento',
            descricao: 'Sincroniza dados da Tutts (cadastros, ativações)',
            status: enriqStatus.status,
            minutos_desde: enriqStatus.minutos_desde,
            ultima_atividade: dataEnriq ? dataEnriq.toISOString() : null,
            label_atividade: 'Última sincronização',
          },
        ],
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
