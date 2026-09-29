export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { proxyDisponiveis } from './_proxy';

export async function GET(req: NextRequest) {
  const historico = req.nextUrl.searchParams.get('historico');
  return proxyDisponiveis(req, historico ? `/historico?limite=${encodeURIComponent(historico)}` : '', { method: 'GET' });
}
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return proxyDisponiveis(req, '', { method: 'POST', body });
}
