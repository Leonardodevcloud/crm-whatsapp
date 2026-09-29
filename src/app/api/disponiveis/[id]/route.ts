export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { proxyDisponiveis } from '../_proxy';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  return proxyDisponiveis(req, `/${encodeURIComponent(params.id)}`, { method: 'PATCH', body });
}
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  return proxyDisponiveis(req, `/${encodeURIComponent(params.id)}`, { method: 'DELETE', body });
}
