// ===========================================
// API: /api/followups
// GET: Lista follow-ups (com filtros) — agora lê de tatiane_followups
//
// MUDANÇA IMPORTANTE: A tabela 'followups' (sem prefixo) NÃO EXISTE.
// Toda a operação de follow-ups agora roda em 'tatiane_followups'.
//
// Filtros (query string):
//   ?status=pendente|concluido|cancelado|falha
//   ?situacao=atrasado|hoje|futuro
//   ?lead_id=N
//   ?dias=N (default 7) — limite de dias atrás pra concluídos
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
    const { searchParams } = new URL(req.url);

    const status = searchParams.get('status');     // pendente, concluido, cancelado, falha
    const situacao = searchParams.get('situacao'); // atrasado, hoje, futuro
    const leadId = searchParams.get('lead_id');
    const dias = Math.max(1, Math.min(30, parseInt(searchParams.get('dias') || '7', 10) || 7));

    // ============================================
    // Query base com JOIN no lead
    // ============================================
    let query = client
      .from('tatiane_followups')
      .select(`
        id,
        lead_id,
        chat_lid,
        sequencia,
        tipo,
        status,
        motivo,
        mensagem,
        data_agendada,
        enviado_em,
        created_at,
        dados_cliente (
          id,
          nomewpp,
          telefone,
          stage,
          regiao
        )
      `);

    // ============================================
    // Filtro de status (default: pendente)
    // ============================================
    if (status) {
      query = query.eq('status', status);
      // Pra concluídos/cancelados, ordenar pelo mais recente primeiro e limitar dias
      if (status === 'concluido' || status === 'cancelado' || status === 'falha') {
        const limiteData = new Date();
        limiteData.setDate(limiteData.getDate() - dias);
        query = query
          .gte('enviado_em', limiteData.toISOString())
          .order('enviado_em', { ascending: false })
          .limit(1000);
      } else {
        query = query.order('data_agendada', { ascending: true });
      }
    } else {
      query = query.eq('status', 'pendente').order('data_agendada', { ascending: true });
    }

    if (leadId) {
      query = query.eq('lead_id', parseInt(leadId, 10));
    }

    const { data: followups, error } = await query;
    if (error) throw error;

    // ============================================
    // Adicionar campo "situacao" calculado pra pendentes
    // ============================================
    const hojeStr = new Date().toISOString().split('T')[0];

    const processados = (followups || []).map((f: any) => {
      let situacaoCalc = f.status;
      if (f.status === 'pendente' && f.data_agendada) {
        const dataAg = String(f.data_agendada).split('T')[0];
        if (dataAg < hojeStr) situacaoCalc = 'atrasado';
        else if (dataAg === hojeStr) situacaoCalc = 'hoje';
        else situacaoCalc = 'futuro';
      }
      return { ...f, situacao: situacaoCalc };
    });

    // Filtro de situação (só faz sentido pra pendentes)
    const filtrados = situacao
      ? processados.filter((f: any) => f.situacao === situacao)
      : processados;

    // ============================================
    // Contagem global (sempre baseada em pendentes)
    // ============================================
    let contagem = { atrasados: 0, hoje: 0, futuro: 0, concluidos: 0, total: 0 };

    // Pra ter contagem completa, faz uma segunda query rápida (agregada)
    const { data: pendentesContagem } = await client
      .from('tatiane_followups')
      .select('id, data_agendada, status')
      .eq('status', 'pendente');

    if (pendentesContagem) {
      const proc = pendentesContagem.map((f: any) => {
        const dataAg = String(f.data_agendada || '').split('T')[0];
        if (dataAg < hojeStr) return { ...f, situacao: 'atrasado' };
        if (dataAg === hojeStr) return { ...f, situacao: 'hoje' };
        return { ...f, situacao: 'futuro' };
      });
      contagem.atrasados = proc.filter((f: any) => f.situacao === 'atrasado').length;
      contagem.hoje = proc.filter((f: any) => f.situacao === 'hoje').length;
      contagem.futuro = proc.filter((f: any) => f.situacao === 'futuro').length;
      contagem.total = pendentesContagem.length;
    }

    // Concluídos nos últimos N dias
    const limiteData = new Date();
    limiteData.setDate(limiteData.getDate() - dias);
    const { count: concluidosCount } = await client
      .from('tatiane_followups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'concluido')
      .gte('enviado_em', limiteData.toISOString());
    contagem.concluidos = concluidosCount || 0;

    return NextResponse.json({
      success: true,
      data: filtrados,
      contagem,
    });
  } catch (error: any) {
    console.error('[GET /api/followups] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao listar follow-ups', success: false, details: error.message },
      { status: 500 }
    );
  }
}
