// ===========================================
// API: /api/leads-captura
// Proxy para Central Tutts Backend → /api/crm/leads-captura
// GET: Lista leads capturados
// POST: Disparar captura manual
// ===========================================

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';

const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

async function proxyToBackend(path: string, options: RequestInit = {}) {
  const url = `${BI_API_URL}/api/crm/leads-captura${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}),
  };

  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers as Record<string, string> },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const queryString = searchParams.toString();
  return proxyToBackend(queryString ? `/?${queryString}` : '/');
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  return proxyToBackend('/executar', {
    method: 'POST',
    body: JSON.stringify({ ...body, iniciado_por: user.nome || 'admin' }),
  });
}
