// ===========================================
// API: /api/tatiane-outbound-config  (CONFIG_CONTATO_V2)
// Proxy para o tutts-backend -> /api/crm/outbound/config
// (a config vive no Postgres do backend, NAO no Supabase).
// GET: le a config | PUT: atualiza { ativo, leads_por_dia, dias_apos_chegada }
// ===========================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';

const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

async function proxy(method: string, body?: any) {
  const url = `${BI_API_URL.replace(/\/$/, '')}/api/crm/outbound/config`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function GET(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  try {
    return await proxy('GET');
  } catch (e: any) {
    return NextResponse.json({ error: e.message, success: false }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    return await proxy('PUT', {
      ativo: body?.ativo,
      leads_por_dia: body?.leads_por_dia,
      dias_apos_chegada: body?.dias_apos_chegada,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, success: false }, { status: 500 });
  }
}
