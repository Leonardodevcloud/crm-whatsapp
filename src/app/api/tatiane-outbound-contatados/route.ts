// ===========================================
// API: /api/tatiane-outbound-contatados  (CONTATADOS_COL_V1)
// Proxy -> tutts-backend /api/crm/outbound/contatados
// Lista os leads que a Tati ja contatou (nome, cod, telefone).
// ===========================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';

const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

export async function GET(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const limite = searchParams.get('limite') || '50';
    const url = `${BI_API_URL.replace(/\/$/, '')}/api/crm/outbound/contatados?limite=${encodeURIComponent(limite)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}) },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, success: false }, { status: 500 });
  }
}
