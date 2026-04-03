export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';

const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}),
  };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const url = `${BI_API_URL}/api/crm/alocacao/${params.id}`;

  const response = await fetch(url, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });

  const url = `${BI_API_URL}/api/crm/alocacao/${params.id}`;
  const response = await fetch(url, { method: 'DELETE', headers: headers() });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
