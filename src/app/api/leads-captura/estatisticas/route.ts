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

  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const url = `${BI_API_URL}/api/crm/leads-captura/estatisticas${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}),
    },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
