// ===========================================
// API: /api/tatiane-outbound-rodar  (RODAR_AGORA_V1)
// Proxy -> Tatiane /api/tatiane/outbound-d2/rodar (dispara o worker na hora)
// Requer env TATI_API_URL (URL do servico Tatiane-IA) e CRM_SERVICE_KEY.
// ===========================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';

const TATI_API_URL = process.env.TATI_API_URL || 'https://tatiane-ia-production-7dce.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

export async function POST(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  try {
    const url = `${TATI_API_URL.replace(/\/$/, '')}/api/tatiane/outbound-d2/rodar`;
    const res = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}) },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
