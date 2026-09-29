// DISPONIVEIS_V1 — helper compartilhado das rotas /api/disponiveis/*
// Repassa pra Central (/api/crm/disponiveis) com a service key; quem fez vai no header x-usuario.
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';

export const BI_API_URL = process.env.BI_API_URL || 'https://tutts-backend-production.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

export async function proxyDisponiveis(req: NextRequest, path: string, init: { method: string; body?: any } ) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  const url = `${BI_API_URL}/api/crm/disponiveis${path}`;
  try {
    const response = await fetch(url, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        'x-usuario': encodeURIComponent(user.nome || user.codProfissional || ''),
        ...(CRM_SERVICE_KEY ? { 'x-service-key': CRM_SERVICE_KEY } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({ success: false, error: `HTTP ${response.status}` }));
    return NextResponse.json(data, { status: response.status });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: 'Central indisponível: ' + (e?.message || e) }, { status: 502 });
  }
}
