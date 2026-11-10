// ===========================================
// API: /api/cerebro/*  (CEREBRO_TATI_V1)
// Proxy -> Tatiane /api/tatiane/cerebro/*  (áreas de atendimento, instruções,
// conhecimento e chat de teste). A lógica e os caches ficam na Tatiane; aqui só
// conferimos o login do CRM e repassamos com a chave de serviço.
// Requer env TATI_API_URL e CRM_SERVICE_KEY (os mesmos do Contato Auto).
// ===========================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // o chat de teste chama a IA (pode levar alguns segundos)

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';

const TATI_API_URL = process.env.TATI_API_URL || 'https://tatiane-ia-production-7dce.up.railway.app';
const CRM_SERVICE_KEY = process.env.CRM_SERVICE_KEY || '';

type Ctx = { params: Promise<{ path: string[] }> | { path: string[] } };

async function repassar(req: NextRequest, ctx: Ctx, method: string) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  if (!CRM_SERVICE_KEY) return NextResponse.json({ error: 'CRM_SERVICE_KEY não configurada no CRM', success: false }, { status: 500 });

  const { path } = await ctx.params;
  const caminho = (path || []).map((p) => encodeURIComponent(p)).join('/');
  const url = `${TATI_API_URL.replace(/\/$/, '')}/api/tatiane/cerebro/${caminho}${req.nextUrl.search || ''}`;
  let body: string | undefined;
  if (method !== 'GET' && method !== 'DELETE') {
    body = await req.text().catch(() => '');
    if (!body) body = '{}';
  }
  try {
    const res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': CRM_SERVICE_KEY,
        'x-usuario': encodeURIComponent(String(user.nome || user.codProfissional || 'CRM')),
      },
      ...(body !== undefined ? { body } : {}),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return NextResponse.json({ success: false, error: data.erro || data.error || `Tatiane respondeu ${res.status}` }, { status: res.ok ? 400 : res.status });
    }
    return NextResponse.json(Object.assign({ success: true }, data), { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: `Não consegui falar com a Tatiane: ${e.message}` }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: Ctx) { return repassar(req, ctx, 'GET'); }
export async function POST(req: NextRequest, ctx: Ctx) { return repassar(req, ctx, 'POST'); }
export async function PUT(req: NextRequest, ctx: Ctx) { return repassar(req, ctx, 'PUT'); }
export async function DELETE(req: NextRequest, ctx: Ctx) { return repassar(req, ctx, 'DELETE'); }
