// ===========================================
// API: /api/analytics/debug-operacao
// POST: { codigos: number[], dataInicio, dataFim }
//  → retorna um resumo detalhado de quem está/não está em operação
//     no período, com total de entregas e última entrega.
//
// Uso típico: validar se o drilldown "TP Ativados" está coerente com
// a realidade do bi_entregas. Se você vê 52 ativados e 49 dizem
// "Em Operação=Não", esse endpoint confirma/contesta essa lista.
//
// Exemplo:
//   POST /api/analytics/debug-operacao
//   Body: {
//     "codigos": [17853, 17351, 17802, ...],
//     "dataInicio": "2026-04-01",
//     "dataFim": "2026-04-30"
//   }
// ===========================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { codigos, dataInicio, dataFim } = body;

    if (!Array.isArray(codigos) || codigos.length === 0) {
      return NextResponse.json({ error: 'Informe codigos: []' }, { status: 400 });
    }
    if (!dataInicio || !dataFim) {
      return NextResponse.json({ error: 'Informe dataInicio e dataFim' }, { status: 400 });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (CRM_SERVICE_KEY) headers['x-service-key'] = CRM_SERVICE_KEY;

    const resp = await fetch(`${BACKEND_URL}/api/crm/verificar-operacao`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        codigos: codigos.map(c => Number(c)),
        data_inicio: dataInicio,
        data_fim: dataFim,
      }),
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Backend retornou ${resp.status}`, auth_configurada: !!CRM_SERVICE_KEY },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    const resultado: any[] = data?.resultado || [];

    const emOperacao = resultado
      .filter(r => r.em_operacao)
      .map(r => ({
        cod: r.cod_profissional,
        nome: r.dados?.nome_prof || null,
        entregas: Number(r.dados?.total_entregas) || 0,
        ultima: r.dados?.ultima_entrega || null,
      }));

    const semOperacao = resultado
      .filter(r => !r.em_operacao)
      .map(r => r.cod_profissional);

    return NextResponse.json({
      periodo: { dataInicio, dataFim },
      total_consultados: codigos.length,
      total_em_operacao: emOperacao.length,
      total_sem_operacao: semOperacao.length,
      em_operacao: emOperacao.sort((a, b) => b.entregas - a.entregas),
      sem_operacao: semOperacao,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
