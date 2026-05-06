// ===========================================
// Supabase Client - CRM WhatsApp Tutts
// v3 - Adaptado para banco da Tatiane
//   - dados_cliente (compartilhado)
//   - tatiane_chat_histories (substitui chats + chat_messages + n8n_chat_histories)
//   - tatiane_followups (substitui followups)
//   - tatiane_resumos (origem do resumo_ia)
// ===========================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórias');
}

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

export function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace('@lid', '')
    .replace(/\D/g, '');
}

function getSessionIdVariations(phone: string, chatLid?: string | null): string[] {
  const variations: string[] = [];
  const normalized = normalizePhone(phone);

  if (chatLid) {
    variations.push(chatLid);
    const lidDigits = normalizePhone(chatLid);
    if (lidDigits) variations.push(lidDigits);
  }

  if (normalized) {
    variations.push(normalized);
    variations.push(normalized + '@s.whatsapp.net');
  }

  if (phone && phone.includes('@lid')) {
    variations.push(phone);
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

import type { Lead, ChatMessage, InboxItem } from '@/types';

async function getResumosBatch(leadIds: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (leadIds.length === 0) return result;

  const client = supabaseAdmin || supabase;
  const { data, error } = await client
    .from('tatiane_resumos')
    .select('lead_id, resumo, created_at')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar resumos:', error);
    return result;
  }

  for (const row of data || []) {
    if (row.lead_id && !result.has(row.lead_id)) {
      result.set(row.lead_id, row.resumo);
    }
  }
  return result;
}

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
      data_ativacao, chat_lid,
      tatiane_followups!left (id, data_agendada, motivo, status)
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

  const leadIds = (data || []).map((l: any) => l.id);
  const resumosMap = await getResumosBatch(leadIds);

  return (data || []).map((lead: any) => {
    const followupPendente = (lead.tatiane_followups || [])
      .filter((f: any) => f.status === 'pendente')
      .sort((a: any, b: any) => (a.data_agendada || '').localeCompare(b.data_agendada || ''))[0];

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
      resumo_ia: resumosMap.get(lead.id) || null,
      chat_id: null,
      chat_status: null,
      last_message_at: lead.updated_at,
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

export async function getResumoIA(leadId: number): Promise<string | null> {
  const client = supabaseAdmin || supabase;
  const { data, error } = await client
    .from('tatiane_resumos')
    .select('resumo')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error('Erro ao buscar resumo:', error); return null; }
  return data?.resumo || null;
}

export async function getTatianeChatHistory(
  phone: string, limit: number = 200, chatLid?: string | null
): Promise<ChatMessage[]> {
  const client = supabaseAdmin || supabase;
  const variations = getSessionIdVariations(phone, chatLid);
  if (variations.length === 0) return [];

  const orFilter = variations.map(v => `session_id.eq.${v}`).join(',');
  const { data, error } = await client
    .from('tatiane_chat_histories')
    .select('*')
    .or(orFilter)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);
  if (error) { console.error('Erro ao buscar histórico Tatiane:', error); return []; }
  if (!data || data.length === 0) return [];

  const normalizedPhone = normalizePhone(phone);

  return data.map((row: any, index: number) => {
    const direction: 'in' | 'out' = row.message_type === 'human' ? 'in' : 'out';
    const timestamp = row.created_at || new Date(Date.now() - (data.length - index) * 60000).toISOString();
    const meta = (typeof row.metadata === 'object' && row.metadata) ? row.metadata : {};

    return {
      id: row.id?.toString() || `tat_${index}`,
      created_at: timestamp,
      chat_id: `tat_${normalizedPhone || chatLid || 'sess'}`,
      direction,
      message_type: meta.message_type || 'text',
      body: row.content || '',
      media_url: meta.media_url || null,
      media_meta: meta.media_meta || meta || {},
      provider_message_id: meta.provider_message_id || `tat_${row.id}`,
      status: 'delivered',
      sent_at: timestamp,
      phone: normalizedPhone,
      lead_id: null,
    } as ChatMessage;
  });
}

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

  return true;
}

export async function getKanbanLeads(filters?: { regiao?: string; iniciado_por?: string; incluirFinalizados?: boolean }): Promise<any[]> {
  const client = supabaseAdmin || supabase;
  let query = client.from('dados_cliente')
    .select(`*, tatiane_followups!left (id, data_agendada, motivo, status)`)
    .eq('status', 'ativo').order('updated_at', { ascending: false }).limit(200);
  if (filters?.incluirFinalizados === false) query = query.neq('stage', 'finalizado');
  if (filters?.regiao) query = query.eq('regiao', filters.regiao);
  if (filters?.iniciado_por) query = query.eq('iniciado_por', filters.iniciado_por);
  const { data, error } = await query;
  if (error) { console.error('Erro ao buscar kanban:', error); throw error; }

  const rows = data || [];
  if (rows.length === 0) return [];

  const leadIds = rows.map((l: any) => l.id);
  const resumosMap = await getResumosBatch(leadIds);

  return rows.map((lead: any) => ({
    ...lead,
    followups: lead.tatiane_followups || [],
    resumo_ia: resumosMap.get(lead.id) || null,
  }));
}

export async function getRegioes(): Promise<string[]> {
  const client = supabaseAdmin || supabase;
  const { data, error } = await client.from('dados_cliente').select('regiao')
    .eq('status', 'ativo').not('regiao', 'is', null).not('regiao', 'eq', '');
  if (error) { console.error('Erro ao buscar regiões:', error); return []; }
  return (Array.from(new Set(data?.map((d: any) => d.regiao).filter(Boolean))) as string[]).sort();
}
