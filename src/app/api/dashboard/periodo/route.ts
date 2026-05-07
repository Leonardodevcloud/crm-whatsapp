// ===========================================
// API: /api/dashboard/periodo?dias=7|30|90
// GET: Métricas históricas — usa API Tutts como fonte de verdade
//
// Fonte:
//   - Cadastros e Ativados → API Tutts (mesma do Analytics)
//   - Tempo médio até ativar → calculado da API Tutts (data_cadastro vs data_ativacao)
//   - Follow-ups + taxa resposta → tatiane_followups + tatiane_chat_histories (banco interno)
//   - Série temporal de mensagens → tatiane_chat_histories (banco interno)
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

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
    const limiteDataStr = new Date(limiteMs).toISOString().slice(0, 10);
    const hojeStr = new Date().toISOString().slice(0, 10);

    // ============================================
    // 1. PUXAR DADOS DA API TUTTS (fonte de verdade)
    // ============================================
    let totalCadastrosNoPeriodo = 0;
    let totalAtivadosNoPeriodo = 0;
    let temposAtivar: number[] = [];

    try {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('limit', '50000');
      const respApi = await fetch(`${BI_API_URL}/api/crm/leads-captura/?${params}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}),
        },
        signal: AbortSignal.timeout(15000),
      }).then(r => r.json());

      if (respApi?.success && Array.isArray(respApi.data)) {
        const leadsTutts = respApi.data;

        // Cadastros no período (data_cadastro >= limite)
        totalCadastrosNoPeriodo = leadsTutts.filter((l: any) => {
          if (!l.data_cadastro) return false;
          return l.data_cadastro.split('T')[0] >= limiteDataStr;
        }).length;

        // Ativados no período (status_api='ativo' AND data_ativacao >= limite)
        const ativadosNoPeriodo = leadsTutts.filter((l: any) => {
          if (l.status_api !== 'ativo') return false;
          if (!l.data_ativacao) return false;
          return l.data_ativacao.split('T')[0] >= limiteDataStr;
        });
        totalAtivadosNoPeriodo = ativadosNoPeriodo.length;

        // Tempo médio até ativar — para cada lead ATIVADO no período,
        // calcula diferença entre data_ativacao e data_cadastro
        ativadosNoPeriodo.forEach((l: any) => {
          if (l.data_cadastro && l.data_ativacao) {
            const cad = new Date(l.data_cadastro).getTime();
            const atv = new Date(l.data_ativacao).getTime();
            if (atv >= cad) {
              const dias = (atv - cad) / (1000 * 60 * 60 * 24);
              temposAtivar.push(dias);
            }
          }
        });
      }
    } catch (errApi: any) {
      console.warn('[dashboard/periodo] API Tutts falhou, usando fallback do banco:', errApi.message);
      // Fallback: usa banco interno
      const { data: leadsBanco } = await client
        .from('dados_cliente')
        .select('id, stage, status, created_at, data_ativacao')
        .gte('created_at', limite);
      const lb = leadsBanco || [];
      totalCadastrosNoPeriodo = lb.length;
      const ativadosFallback = lb.filter((l: any) => l.stage === 'finalizado' && l.data_ativacao);
      totalAtivadosNoPeriodo = ativadosFallback.length;
      ativadosFallback.forEach((l: any) => {
        if (l.created_at && l.data_ativacao) {
          const cad = new Date(l.created_at).getTime();
          const atv = new Date(l.data_ativacao).getTime();
          if (atv >= cad) {
            temposAtivar.push((atv - cad) / (1000 * 60 * 60 * 24));
          }
        }
      });
    }

    // ============================================
    // 2. TAXA DE CONVERSÃO LEAD → ATIVADO
    // ============================================
    const taxaConversao = totalCadastrosNoPeriodo > 0
      ? Math.round((totalAtivadosNoPeriodo / totalCadastrosNoPeriodo) * 1000) / 10
      : 0;

    // ============================================
    // 3. TEMPO MÉDIO ATÉ ATIVAR (mediana é mais robusta que média)
    // ============================================
    let tempoMedianaDias: number | null = null;
    let tempoMedioDias: number | null = null;
    if (temposAtivar.length > 0) {
      const ordenado = [...temposAtivar].sort((a, b) => a - b);
      const meio = Math.floor(ordenado.length / 2);
      const mediana = ordenado.length % 2 === 0
        ? (ordenado[meio - 1] + ordenado[meio]) / 2
        : ordenado[meio];
      tempoMedianaDias = Math.round(mediana * 10) / 10;

      const soma = temposAtivar.reduce((a, b) => a + b, 0);
      tempoMedioDias = Math.round((soma / temposAtivar.length) * 10) / 10;
    }

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
    // 5. SÉRIE TEMPORAL DE MENSAGENS
    // Agrupa por DIA EM SALVADOR usando Intl (não UTC).
    // Garante todos os dias do período (zera os sem dados).
    // ============================================
    const { data: msgsDiarias } = await client
      .from('tatiane_chat_histories')
      .select('created_at, message_type')
      .gte('created_at', limite)
      .order('created_at', { ascending: true });

    // Normaliza timestamp Postgres pra ISO válido (Postgres usa "+00" sem ":00")
    const normalizarTimestamp = (ts: string): string => {
      let s = String(ts);
      if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T');
      if (/[+-]\d{2}$/.test(s)) s = s + ':00';                   // "+00" -> "+00:00"
      if (!/[+-]\d{2}:?\d{0,2}$|Z$/.test(s)) s = s + 'Z';        // sem TZ -> assume UTC
      return s;
    };

    // Helper robusto: converte timestamp pra YYYY-MM-DD em Salvador via Intl
    const dataSalvador = (input: string | Date): string => {
      const d = typeof input === 'string' ? new Date(normalizarTimestamp(input)) : input;
      if (isNaN(d.getTime())) return '0000-00-00';
      const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bahia',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(d);
      const ano = partes.find(p => p.type === 'year')?.value;
      const mes = partes.find(p => p.type === 'month')?.value;
      const dia = partes.find(p => p.type === 'day')?.value;
      return `${ano}-${mes}-${dia}`;
    };

    const porDia = new Map<string, { ia: number; humanas: number }>();
    (msgsDiarias || []).forEach((m: any) => {
      const dia = dataSalvador(m.created_at);
      if (!porDia.has(dia)) porDia.set(dia, { ia: 0, humanas: 0 });
      const stats = porDia.get(dia)!;
      if (m.message_type === 'human') stats.humanas++;
      else stats.ia++;
    });

    // Gera array de dias YYYY-MM-DD desde "limite" até hoje (Salvador)
    // Vai do dia mais antigo ao dia atual, em Salvador.
    const hojeSalvadorStr = dataSalvador(new Date());
    const inicioSalvadorStr = dataSalvador(new Date(limiteMs));
    const dias_arr: string[] = [];
    // Usa Date em UTC só pra incrementar dia (com hora 12:00 evita TZ borda)
    const cursor = new Date(inicioSalvadorStr + 'T12:00:00Z');
    const fim = new Date(hojeSalvadorStr + 'T12:00:00Z');
    while (cursor.getTime() <= fim.getTime()) {
      dias_arr.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const serieTemporalMsgs = dias_arr.map(dia => ({
      dia,
      ia: porDia.get(dia)?.ia ?? 0,
      humanas: porDia.get(dia)?.humanas ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        periodo_dias: dias,
        // KPIs principais (usados pelo dashboard simplificado)
        total_cadastros: totalCadastrosNoPeriodo,
        total_ativados: totalAtivadosNoPeriodo,
        taxa_conversao_pct: taxaConversao,
        tempo_mediana_ativar_dias: tempoMedianaDias,
        tempo_medio_ativar_dias: tempoMedioDias,
        amostra_tempo_ativar: temposAtivar.length,
        followups: {
          total: totalFollowups,
          respondidos,
          taxa_resposta_pct: taxaRespostaFollowup,
        },
        serie_temporal_msgs: serieTemporalMsgs,
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
