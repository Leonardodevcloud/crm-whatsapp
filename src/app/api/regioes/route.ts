// ===========================================
// API: /api/regioes
// GET: Listar regiões disponíveis
// ===========================================

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeader } from '@/lib/auth';
import { getRegioes } from '@/lib/supabase';

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
    const regioes = await getRegioes();

    return NextResponse.json({
      success: true,
      data: regioes,
    });
  } catch (error: any) {
    console.error('Erro ao buscar regiões:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar regiões', success: false },
      { status: 500 }
    );
  }
}
