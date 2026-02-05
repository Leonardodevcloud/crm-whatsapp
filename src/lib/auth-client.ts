// ===========================================
// Auth Client - Funções de Auth para o Cliente
// ===========================================

import type { TuttsUser } from '@/types';

// ===========================================
// Helper: Converter User ID para UUID
// ===========================================
// O Tutts usa IDs numéricos (ex: 123), mas o Supabase espera UUID
// Esta função converte de forma consistente: 123 -> "00000000-0000-0000-0000-000000000123"

export function userIdToUuid(userId: number | string): string {
  const id = userId.toString();
  const padded = id.padStart(12, '0');
  return `00000000-0000-0000-0000-${padded}`;
}

// ===========================================
// Helpers de Telefone (para uso no cliente)
// ===========================================

export function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}

export function formatPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.length === 13 && normalized.startsWith('55')) {
    return `+${normalized.slice(0, 2)} (${normalized.slice(2, 4)}) ${normalized.slice(4, 9)}-${normalized.slice(9)}`;
  }
  if (normalized.length === 12 && normalized.startsWith('55')) {
    return `+${normalized.slice(0, 2)} (${normalized.slice(2, 4)}) ${normalized.slice(4, 8)}-${normalized.slice(8)}`;
  }
  return phone;
}

/**
 * Decodificar token sem verificar (para client-side)
 * ATENÇÃO: Não usar para autorização, apenas para UI
 */
export function decodeTokenUnsafe(token: string): TuttsUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    return payload as TuttsUser;
  } catch {
    return null;
  }
}

/**
 * Verificar se token está expirado (client-side)
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeTokenUnsafe(token);
  if (!decoded || !decoded.exp) return true;
  
  // exp é em segundos, Date.now() é em milissegundos
  return decoded.exp * 1000 < Date.now();
}
