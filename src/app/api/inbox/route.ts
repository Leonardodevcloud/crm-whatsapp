// ===========================================
// API: /api/inbox
// Lista leads para a Inbox com filtros
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { getInboxLeads } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  // Verificar autenticação
  const authHeader = req.headers.get('authorization');
  const user = getUserFromHeader(authHeader);

  if (!user) {
    return NextResponse.json(
      { error: 'Não autenticado', success: false },
      { status: 401 }
    );
  }

  try {
    // Extrair filtros da query string
    const { searchParams } = new URL(req.url);
    const stage = searchParams.get('stage') || undefined;
    const owner = searchParams.get('owner') || undefined;
    const search = searchParams.get('search') || undefined;
    const regiao = searchParams.get('regiao') || undefined;
    const iniciado_por = searchParams.get('iniciado_por') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Buscar leads
    const leads = await getInboxLeads({
      stage,
      owner_user_id: owner,
      search,
      regiao,
      iniciado_por,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: leads,
      filters: { stage, owner, search, regiao, iniciado_por },
      pagination: { limit, offset },
    });
  } catch (error: any) {
    console.error('Erro na API inbox:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar inbox', success: false, details: error.message },
      { status: 500 }
    );
  }
}
