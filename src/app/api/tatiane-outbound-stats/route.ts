// API: /api/tatiane-outbound-stats (PIZZA_V1) -> backend /api/crm/outbound/stats
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';
export async function GET(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  try {
    const dias = new URL(req.url).searchParams.get('dias') || '2';
    const url = `${BI_API_URL.replace(/\/$/, '')}/api/crm/outbound/stats?dias=${encodeURIComponent(dias)}`;
    const res = await fetch(url, { method: 'GET', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}) } });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) { return NextResponse.json({ success: false, error: e.message }, { status: 500 }); }
}
