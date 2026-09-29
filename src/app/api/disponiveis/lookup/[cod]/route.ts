export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { proxyDisponiveis } from '../../_proxy';

export async function GET(req: NextRequest, { params }: { params: { cod: string } }) {
  return proxyDisponiveis(req, `/lookup/${encodeURIComponent(params.cod)}`, { method: 'GET' });
}
