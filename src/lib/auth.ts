// ===========================================
// Auth - Validação JWT do Tutts
// ===========================================

import jwt from 'jsonwebtoken';
import type { TuttsUser } from '@/types';

// JWT Secret (DEVE ser o mesmo do servidor Tutts!)
const JWT_SECRET = process.env.JWT_SECRET;

// ===========================================
// Server-side Auth Functions
// ===========================================

/**
 * Verificar e decodificar token JWT
 */
export function verifyToken(token: string): TuttsUser | null {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET não configurado');
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TuttsUser;
    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      console.log('Token expirado');
    } else if (error.name === 'JsonWebTokenError') {
      console.log('Token inválido:', error.message);
    }
    return null;
  }
}

/**
 * Obter usuário autenticado a partir do header Authorization
 */
export function getUserFromHeader(authHeader: string | null): TuttsUser | null {
  if (!authHeader) return null;
  
  // Formato: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return verifyToken(parts[1]);
}

/**
 * Verificar se usuário é admin
 */
export function isAdmin(user: TuttsUser | null): boolean {
  if (!user) return false;
  return ['admin', 'admin_master', 'admin_financeiro'].includes(user.role);
}

/**
 * Verificar se usuário pode acessar o CRM
 * (todos os roles podem acessar por enquanto)
 */
export function canAccessCRM(user: TuttsUser | null): boolean {
  return !!user;
}

// ===========================================
// API Route Helpers
// ===========================================

import { NextRequest, NextResponse } from 'next/server';

/**
 * Wrapper para rotas protegidas
 */
export function withAuth(
  handler: (req: NextRequest, user: TuttsUser) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const authHeader = req.headers.get('authorization');
    const user = getUserFromHeader(authHeader);

    if (!user) {
      return NextResponse.json(
        { error: 'Não autenticado', success: false },
        { status: 401 }
      );
    }

    return handler(req, user);
  };
}

/**
 * Wrapper para rotas que requerem admin
 */
export function withAdmin(
  handler: (req: NextRequest, user: TuttsUser) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const authHeader = req.headers.get('authorization');
    const user = getUserFromHeader(authHeader);

    if (!user) {
      return NextResponse.json(
        { error: 'Não autenticado', success: false },
        { status: 401 }
      );
    }

    if (!isAdmin(user)) {
      return NextResponse.json(
        { error: 'Acesso negado. Requer permissão de administrador.', success: false },
        { status: 403 }
      );
    }

    return handler(req, user);
  };
}
