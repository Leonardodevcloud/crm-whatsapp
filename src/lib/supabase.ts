// ===========================================
// Supabase Client - CRM WhatsApp Tutts
// v2 - chatLid support + deduplicação + busca robusta
// ===========================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórias');
}

// ===========================================
// Helpers
// ===========================================

export function userIdToUuid(userId: number | string): string {
  const id = userId.toString();
  return `00000000-0000-0000-0000-${id.padStart(12, '0')}`;
}

export function uuidToUserId(uuid: string): string {
  if (!uuid) return '';
  return parseInt(uuid.split('-').pop() || '', 10).toString();
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export const hasAdminAccess = () => !!supabaseAdmin;

// ===========================================
// Utils
// ===========================================

export function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace('@lid', '')
    .replace(/\D/g, '');
}

/**
 * Gerar todas as variações de identificador para busca
 * O n8n salva chatLid no campo phone em vários formatos
 */
function getPhoneVariations(phone: string, chatLid?: string | null): string[] {
  const variations: string[] = [];
  const normalized = normalizePhone(phone);
  
  if (normalized) {
    variations.push(normalized);
    variations.push(normalized + '@s.whatsapp.net');
  }
  
  if (phone && phone.includes('@lid')) {
    variations.push(phone);
  }
  
  if (chatLid) {
    variations.push(chatLid);
    const lidDigits = normalizePhone(chatLid);
    if (lidDigits) variations.push(lidDigits);
  }
  
  return Array.from(new Set(variations)).filter(Boolean);
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

// ===========================================
// Database Helpers
// ===========================================

import type { Lead, Chat, ChatMessage, InboxItem } from '@/types';

export async function getInboxLeads(filters?: {
  stage?: string;
  owner_user_id?: string;
  search?: string;
  regiao?: string;
  iniciado_por?: string;
  limit?: number;
  offset?: number;
}): Promise<InboxItem[]> {
  const client = supabaseAdmin || supabase;
  
  let query = client
    .from('dados_cliente')
    .select(`
      id, uuid, telefone, nomewpp, stage, atendimento_ia, owner_user_id,
      tags, regiao, iniciado_por, updated_at, created_at, cod_profissional,
      resumo_ia, data_ativacao, chat_lid,
      chats!left (id, status, last_message_at),
      followups!left (id, data_agendada, motivo, status)
    `)
    .eq('status', 'ativo')
    .order('updated_at', { ascending: false });

  if (filters?.stage) query = query.eq('stage', filters.stage);
  if (filters?.owner_user_id) query = query.eq('owner_user_id', filters.owner_user_id);
  if (filters?.regiao) query = query.eq('regiao', filters.regiao);
  if (filters?.iniciado_por) query = query.eq('iniciado_por', filters.iniciado_por);
  if (filters?.search) {
    query = query.or(`nomewpp.ilike.%${filters.search}%,telefone.ilike.%${filters.search}%,cod_profissional.ilike.%${filters.search}%`);
  }
  
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) { console.error('Erro ao buscar inbox:', error); throw error; }

  return (data || []).map((lead: any) => {
    const chat = lead.chats?.[0];
    const followupPendente = (lead.followups || [])
      .filter((f: any) => f.status === 'pendente')
      .sort((a: any, b: any) => a.data_agendada.localeCompare(b.data_agendada))[0];
    
    return {
      lead_id: lead.id,
      lead_uuid: lead.uuid,
      telefone: lead.telefone || '',
      nomewpp: lead.nomewpp,
      stage: lead.stage,
      atendimento_ia: lead.atendimento_ia,
      owner_user_id: lead.owner_user_id,
      tags: lead.tags || [],
      regiao: lead.regiao || null,
      iniciado_por: lead.iniciado_por || null,
      cod_profissional: lead.cod_profissional || null,
      resumo_ia: lead.resumo_ia || null,
      chat_id: chat?.id || null,
      chat_status: chat?.status || null,
      last_message_at: chat?.last_message_at || lead.updated_at,
      last_message_preview: null,
      unread_count: 0,
      followup_data: followupPendente?.data_agendada || null,
      followup_motivo: followupPendente?.motivo || null,
    };
  });
}

export async function getLeadById(leadId: number): Promise<Lead | null> {
  const client = supabaseAdmin || supabase;
  const { data, error } = await client.from('dados_cliente').select('*').eq('id', leadId).single();
  if (error) { console.error('Erro ao buscar lead:', error); return null; }
  return data;
}

export async function getLeadByPhone(phone: string): Promise<Lead | null> {
  const client = supabaseAdmin || supabase;
  const { data, error } = await client.from('dados_cliente').select('*').eq('telefone', normalizePhone(phone)).single();
  if (error && error.code !== 'PGRST116') { console.error('Erro ao buscar lead por telefone:', error); }
  return data || null;
}

/**
 * Buscar chat por lead_id — cascata robusta:
 * 1. chat_lid (Z-API, mais confiável)
 * 2. lead_id (FK direta)
 * 3. phone/telefone/remotejid (todas as variações)
 */
export async function getChatByLeadId(leadId: number): Promise<Chat | null> {
  const client = supabaseAdmin || supabase;
  const lead = await getLeadById(leadId);
  if (!lead) return null;
  
  // 1. Por chat_lid
  if (lead.chat_lid) {
    const { data } = await client.from('chats').select('*')
      .eq('chat_lid', lead.chat_lid).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (data) return data;
  }

  // 2. Por lead_id
  {
    const { data } = await client.from('chats').select('*')
      .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (data) return data;
  }

  // 3. Por phone/telefone/remotejid (todas as variações)
  if (lead.telefone || lead.chat_lid) {
    const variations = getPhoneVariations(lead.telefone || '', lead.chat_lid);
    const orParts: string[] = [];
    for (const v of variations) {
      orParts.push(`phone.eq.${v}`, `telefone.eq.${v}`, `remotejid.eq.${v}`);
    }
    if (orParts.length > 0) {
      const { data } = await client.from('chats').select('*')
        .or(orParts.join(',')).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) return data;
    }
  }

  return null;
}

export async function getChatMessages(chatId: string, limit: number = 100): Promise<ChatMessage[]> {
  const client = supabaseAdmin || supabase;
  const { data, error } = await client.from('chat_messages').select('*')
    .eq('chat_id', chatId).order('created_at', { ascending: true }).limit(limit);
  if (error) { console.error('Erro ao buscar mensagens:', error); throw error; }
  return data || [];
}

/**
 * Buscar mensagens por telefone/chatLid
 * O n8n salva chatLid no campo "phone" de chat_messages
 * Deduplicação por provider_message_id (Z-API envia webhooks duplicados)
 */
export async function getChatMessagesByPhone(
  phone: string, limit: number = 100, chatLid?: string | null
): Promise<ChatMessage[]> {
  const client = supabaseAdmin || supabase;
  const variations = getPhoneVariations(phone, chatLid);
  if (variations.length === 0) return [];
  
  const orFilter = variations.map(v => `phone.eq.${v}`).join(',');
  const { data, error } = await client.from('chat_messages').select('*')
    .or(orFilter).order('created_at', { ascending: true }).limit(limit);
  if (error) { console.error('Erro ao buscar mensagens por telefone:', error); throw error; }

  // Deduplicar por provider_message_id
  const seen = new Set<string>();
  return (data || []).filter(msg => {
    if (!msg.provider_message_id) return true;
    if (seen.has(msg.provider_message_id)) return false;
    seen.add(msg.provider_message_id);
    return true;
  });
}

/**
 * Buscar mensagens do histórico n8n (n8n_chat_histories)
 * 
 * CUIDADO: Tabela NÃO tem created_at. Ordena por id (serial).
 * session_id pode ser telefone OU chatLid.
 * type "human" = out, type "ai" = in (invertido).
 * BUG CONHECIDO: Salvar Historicoo Humano salva humano como "ai" — corrigir no n8n.
 */
export async function getN8nChatHistory(
  phone: string, limit: number = 200, chatLid?: string | null
): Promise<ChatMessage[]> {
  const client = supabaseAdmin || supabase;
  const variations = getPhoneVariations(phone, chatLid);
  if (variations.length === 0) return [];
  
  const orFilter = variations.map(v => `session_id.eq.${v}`).join(',');
  const { data, error } = await client.from('n8n_chat_histories').select('*')
    .or(orFilter).order('id', { ascending: true }).limit(limit);
  if (error) { console.error('Erro ao buscar histórico n8n:', error); return []; }
  if (!data || data.length === 0) return [];

  const normalizedPhone = normalizePhone(phone);

  return data.map((row: any, index: number) => {
    let messageData: any = {};
    if (typeof row.message === 'string') {
      try { messageData = JSON.parse(row.message); } catch { messageData = { type: 'human', content: row.message }; }
    } else if (row.message) {
      messageData = row.message;
    }

    const direction = messageData.type === 'human' ? 'out' : 'in';
    const timestamp = row.created_at || new Date(Date.now() - (data.length - index) * 60000).toISOString();

    return {
      id: row.id?.toString() || `n8n_${index}`,
      created_at: timestamp,
      chat_id: `n8n_${normalizedPhone}`,
      direction,
      message_type: 'text',
      body: messageData.content || '',
      media_url: null,
      media_meta: {},
      provider_message_id: `n8n_${row.id}`,
      status: 'delivered',
      sent_at: timestamp,
      phone: normalizedPhone,
      lead_id: null,
    } as ChatMessage;
  });
}

// ===========================================
// Write Operations
// ===========================================

export async function updateLead(
  leadId: number,
  updates: Partial<Pick<Lead, 'stage' | 'owner_user_id' | 'atendimento_ia' | 'tags'>>
): Promise<Lead | null> {
  const client = supabaseAdmin || supabase;
  const { data, error } = await client.from('dados_cliente')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', leadId).select().single();
  if (error) { console.error('Erro ao atualizar lead:', error); throw error; }
  return data;
}

export async function assumirAtendimento(leadId: number, userId: string): Promise<{ success: boolean; message: string }> {
  const client = supabaseAdmin || supabase;
  console.log(`[assumir] Lead: ${leadId}, User: ${userId}`);
  
  const { data: lead, error: selectError } = await client.from('dados_cliente')
    .select('owner_user_id, nomewpp').eq('id', leadId).single();
  if (selectError) { console.error('[assumir] Erro:', selectError); return { success: false, message: 'Erro ao buscar lead' }; }
  if (lead?.owner_user_id && lead.owner_user_id !== userId) {
    return { success: false, message: 'Este atendimento já foi assumido por outro agente' };
  }

  const { data, error } = await client.from('dados_cliente')
    .update({ owner_user_id: userId, stage: 'em_atendimento', atendimento_ia: 'pause', updated_at: new Date().toISOString() })
    .eq('id', leadId).select();
  if (error) { return { success: false, message: 'Erro ao assumir: ' + error.message }; }
  if (!data || data.length === 0) { return { success: false, message: 'Lead não encontrado' }; }
  
  console.log(`[assumir] Sucesso! Lead ${leadId} assumido por ${userId}`);
  return { success: true, message: 'Atendimento assumido com sucesso' };
}

export async function reativarIA(leadId: number): Promise<boolean> {
  const client = supabaseAdmin || supabase;
  const { error } = await client.from('dados_cliente')
    .update({ atendimento_ia: 'reativada', updated_at: new Date().toISOString() }).eq('id', leadId);
  if (error) { console.error('Erro ao reativar IA:', error); return false; }
  return true;
}

export async function finalizarAtendimento(leadId: number): Promise<boolean> {
  const client = supabaseAdmin || supabase;
  
  const { error } = await client.from('dados_cliente')
    .update({ stage: 'finalizado', atendimento_ia: 'ativa', updated_at: new Date().toISOString() })
    .eq('id', leadId);
  if (error) { console.error('Erro ao finalizar:', error); return false; }

  const lead = await getLeadById(leadId);
  await client.from('chats').update({ status: 'closed' }).eq('lead_id', leadId);
  if (lead?.chat_lid) {
    await client.from('chats').update({ status: 'closed' }).eq('chat_lid', lead.chat_lid);
  }
  return true;
}

export async function getKanbanLeads(filters?: { regiao?: string; iniciado_por?: string; incluirFinalizados?: boolean }): Promise<any[]> {
  const client = supabaseAdmin || supabase;
  let query = client.from('dados_cliente')
    .select(`*, followups!left (id, data_agendada, motivo, status)`)
    .eq('status', 'ativo').order('updated_at', { ascending: false }).limit(200);
  if (filters?.incluirFinalizados === false) query = query.neq('stage', 'finalizado');
  if (filters?.regiao) query = query.eq('regiao', filters.regiao);
  if (filters?.iniciado_por) query = query.eq('iniciado_por', filters.iniciado_por);
  const { data, error } = await query;
  if (error) { console.error('Erro ao buscar kanban:', error); throw error; }
  return data || [];
}

export async function getRegioes(): Promise<string[]> {
  const client = supabaseAdmin || supabase;
  const { data, error } = await client.from('dados_cliente').select('regiao')
    .eq('status', 'ativo').not('regiao', 'is', null).not('regiao', 'eq', '');
  if (error) { console.error('Erro ao buscar regiões:', error); return []; }
  return (Array.from(new Set(data?.map((d: any) => d.regiao).filter(Boolean))) as string[]).sort();
}
