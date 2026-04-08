// ===========================================
// API: /api/profissionais
// GET: Lista profissionais do banco (crm_leads_capturados → planilha fallback)
//
// Antes: lia CSV do Google Sheets diretamente.
// Agora: proxy para o backend Central Tutts, que resolve CRM → planilha.
// ===========================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';

const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  try {
    console.log('[Profissionais] Consultando backend (CRM + planilha fallback)...');
    const resp = await fetch(`${BI_API_URL}/api/crm/profissionais-cadastro`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}),
      },
      // Sem cache — sempre dado fresco
      cache: 'no-store',
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Backend HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const payload = await resp.json();
    const dados: Array<any> = Array.isArray(payload?.data) ? payload.data : [];

    console.log(`[Profissionais] Backend retornou: ${dados.length} registros (origem CRM=${payload?.estatisticas?.por_origem?.crm ?? '?'} planilha=${payload?.estatisticas?.por_origem?.planilha ?? '?'})`);

    // Formato compatível com o consumidor antigo (/src/app/profissionais/page.tsx)
    return NextResponse.json({
      success: true,
      data: dados.map((p) => ({
        codigo:       p.codigo || '',
        nome:         p.nome || '',
        telefone:     p.telefone || '',
        regiao:       p.regiao || '',
        dataAtivacao: p.dataAtivacao || '',
        quemAtivou:   p.quemAtivou || '',
      })),
      estatisticas: payload?.estatisticas || { total: dados.length, porRegiao: {}, porAtivador: {} },
      regioes:      payload?.regioes    || [],
      ativadores:   payload?.ativadores || [],
    });
  } catch (error: any) {
    console.error('[Profissionais] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar profissionais', success: false, details: error.message },
      { status: 500 }
    );
  }
}
