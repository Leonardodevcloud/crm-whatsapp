// ===========================================
// API: /api/alocacao/verificar-rodou
// Recebe uma lista de cod_prof (das alocações) + período e devolve quantos
// EFETIVAMENTE RODARAM (fizeram entrega em bi_entregas) no período.
// Usa a MESMA fonte do Analytics (/api/crm/verificar-operacao), então o número
// bate com o "Em Operação" do Analytics — independente do status da tabela de
// alocação (que pode estar desatualizado como "Não Rodou").
// ===========================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';

const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

export async function POST(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const codigos: string[] = Array.isArray(body?.codigos) ? body.codigos : [];
    const data_inicio: string | undefined = body?.data_inicio;
    const data_fim: string | undefined = body?.data_fim;

    if (codigos.length === 0) {
      return NextResponse.json({ success: true, em_operacao: 0, rodaram: [], resultado: [] });
    }

    // Payload: intervalo fixo quando vier data_inicio/data_fim; senão o backend usa últimos 30d
    const payload: any = { codigos };
    if (data_inicio && data_fim) { payload.data_inicio = data_inicio; payload.data_fim = data_fim; }

    const resp = await fetch(`${BI_API_URL}/api/crm/verificar-operacao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}) },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => null);

    if (!data?.resultado) {
      return NextResponse.json({ success: false, em_operacao: 0, rodaram: [], resultado: [], error: 'Sem resposta do backend' }, { status: 502 });
    }

    const rodaram = data.resultado
      .filter((r: any) => r.em_operacao)
      .map((r: any) => String(r.cod_profissional));

    return NextResponse.json({
      success: true,
      em_operacao: rodaram.length,
      rodaram,                 // lista de cod_prof que rodaram (pro front destacar)
      resultado: data.resultado,
      periodo: data.periodo || null,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, em_operacao: 0, rodaram: [], resultado: [], error: e.message }, { status: 500 });
  }
}
