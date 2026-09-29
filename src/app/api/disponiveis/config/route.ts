export const dynamic = 'force-dynamic';
// DISPONIVEIS_V1 — entrega ao browser a URL do WebSocket da Central (derivada de BI_API_URL, que não é pública)
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { BI_API_URL } from '../_proxy';

export async function GET(req: NextRequest) {
  const user = getUserFromHeader(req.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autenticado', success: false }, { status: 401 });
  const wsUrl = process.env.BI_WS_URL || BI_API_URL.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws/disponibilidade';
  return NextResponse.json({ success: true, wsUrl });
}
