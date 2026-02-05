// ===========================================
// Supabase Client - CRM WhatsApp Tutts
// ===========================================

import { createClient } from '@supabase/supabase-js';

// Variáveis de ambiente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validar variáveis obrigatórias
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórias');
}

// ===========================================
// Helper: Converter User ID para UUID
// ===========================================
// O Tutts usa IDs numéricos (ex: 123), mas o Supabase espera UUID
// Esta função converte de forma consistente: 123 -> "00000000-0000-0000-0000-000000000123"

export function userIdToUuid(userId: number | string): string {
  const id = userId.toString();
  const padded = id.padStart(12, '0'); // Garante 12 dígitos
  return `00000000-0000-0000-0000-${padded}`;
}

// Função reversa: UUID -> User ID
export function uuidToUserId(uuid: string): string {
  if (!uuid) return '';
  const lastPart = uuid.split('-').pop() || '';
  return parseInt(lastPart, 10).toString();
}

// Cliente público (frontend) - usa anon key
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // Não usamos Supabase Auth, usamos JWT do Tutts
  },
});

// Cliente admin (backend/server) - usa service role key
// NUNCA expor no frontend!
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

// Helper para verificar se temos acesso admin
export const hasAdminAccess = () => !!supabaseAdmin;

// ===========================================
// Database Helpers
// ===========================================

import type { Lead, Chat, ChatMessage, InboxItem } from '@/types';

/**
 * Buscar leads para a Inbox
 */
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
      id,
      uuid,
      telefone,
      nomewpp,
      stage,
      atendimento_ia,
      owner_user_id,
      tags,
      regiao,
      iniciado_por,
      updated_at,
      created_at,
      cod_profissional,
      resumo_ia,
      data_ativacao,
      chats!left (
        id,
        status,
        last_message_at
      ),
      followups!left (
        id,
        data_agendada,
        motivo,
        status
      )
    `)
    .eq('status', 'ativo')
    .order('updated_at', { ascending: false });

  // Aplicar filtros
  if (filters?.stage) {
    query = query.eq('stage', filters.stage);
  }
  if (filters?.owner_user_id) {
    query = query.eq('owner_user_id', filters.owner_user_id);
  }
  if (filters?.regiao) {
    query = query.eq('regiao', filters.regiao);
  }
  if (filters?.iniciado_por) {
    query = query.eq('iniciado_por', filters.iniciado_por);
  }
  if (filters?.search) {
    query = query.or(`nomewpp.ilike.%${filters.search}%,telefone.ilike.%${filters.search}%,cod_profissional.ilike.%${filters.search}%`);
  }
  
  // Paginação
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar inbox:', error);
    throw error;
  }

  // Transformar dados para InboxItem
  // NOTA: O filtro de profissionais já ativos é feito no N8N (na criação do lead)
  // Aqui mostramos TODOS os leads normalmente
  return (data || []).map((lead: any) => {
    const chat = lead.chats?.[0];
    // Pegar follow-up pendente mais próximo
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
      // Follow-up pendente
      followup_data: followupPendente?.data_agendada || null,
      followup_motivo: followupPendente?.motivo || null,
    };
  });
}

/**
 * Buscar lead por ID
 */
export async function getLeadById(leadId: number): Promise<Lead | null> {
  const client = supabaseAdmin || supabase;
  
  const { data, error } = await client
    .from('dados_cliente')
    .select('*')
    .eq('id', leadId)
    .single();

  if (error) {
    console.error('Erro ao buscar lead:', error);
    return null;
  }

  return data;
}

/**
 * Buscar lead por telefone
 */
export async function getLeadByPhone(phone: string): Promise<Lead | null> {
  const client = supabaseAdmin || supabase;
  const normalizedPhone = normalizePhone(phone);
  
  const { data, error } = await client
    .from('dados_cliente')
    .select('*')
    .eq('telefone', normalizedPhone)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    console.error('Erro ao buscar lead por telefone:', error);
  }

  return data || null;
}

/**
 * Buscar chat por lead_id (tenta primeiro por lead_id, depois por telefone)
 */
export async function getChatByLeadId(leadId: number): Promise<Chat | null> {
  const client = supabaseAdmin || supabase;
  
  // Primeiro, buscar o telefone do lead em dados_cliente
  const lead = await getLeadById(leadId);
  if (!lead || !lead.telefone) {
    return null;
  }
  
  // Normalizar telefone para busca
  const phone = normalizePhone(lead.telefone);
  const phoneWithSuffix = phone + '@s.whatsapp.net';
  
  // Buscar chat pelo telefone (tenta com e sem @s.whatsapp.net)
  const { data, error } = await client
    .from('chats')
    .select('*')
    .or(`phone.eq.${phone},phone.eq.${phoneWithSuffix}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Erro ao buscar chat:', error);
  }

  return data || null;
}

/**
 * Buscar mensagens de um chat
 */
export async function getChatMessages(
  chatId: string,
  limit: number = 100
): Promise<ChatMessage[]> {
  const client = supabaseAdmin || supabase;
  
  const { data, error } = await client
    .from('chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Erro ao buscar mensagens:', error);
    throw error;
  }

  return data || [];
}

/**
 * Buscar mensagens por telefone (alternativa se não tiver chat_id)
 */
export async function getChatMessagesByPhone(
  phone: string,
  limit: number = 100
): Promise<ChatMessage[]> {
  const client = supabaseAdmin || supabase;
  const normalizedPhone = normalizePhone(phone);
  const phoneWithSuffix = normalizedPhone + '@s.whatsapp.net';
  
  const { data, error } = await client
    .from('chat_messages')
    .select('*')
    .or(`phone.eq.${normalizedPhone},phone.eq.${phoneWithSuffix}`)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Erro ao buscar mensagens por telefone:', error);
    throw error;
  }

  return data || [];
}

/**
 * Buscar mensagens do histórico n8n (tabela n8n_chat_histories)
 * Esta é a tabela onde o n8n salva as conversas humano/IA
 * 
 * IMPORTANTE: No n8n, a nomenclatura é invertida:
 * - type: "human" = mensagem do ATENDENTE (outgoing)
 * - type: "ai" = mensagem do CLIENTE (incoming)
 */
export async function getN8nChatHistory(
  phone: string,
  limit: number = 200
): Promise<ChatMessage[]> {
  const client = supabaseAdmin || supabase;
  const normalizedPhone = normalizePhone(phone);
  const phoneWithWhatsApp = normalizedPhone + '@s.whatsapp.net';
  const phoneWithCUs = normalizedPhone + '@c.us';
  
  // Tentar buscar com diferentes formatos de telefone
  // O n8n pode salvar em qualquer um desses formatos
  const { data, error } = await client
    .from('n8n_chat_histories')
    .select('*')
    .or(`session_id.eq.${normalizedPhone},session_id.eq.${phoneWithWhatsApp},session_id.eq.${phoneWithCUs}`)
    .order('id', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Erro ao buscar histórico n8n:', error);
    // Não throw, apenas retorna vazio se a tabela não existir
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Converter formato n8n para formato ChatMessage
  return data.map((row: any, index: number) => {
    let messageData: any = {};
    
    // O campo message pode ser string JSON ou objeto
    if (typeof row.message === 'string') {
      try {
        messageData = JSON.parse(row.message);
      } catch {
        messageData = { type: 'human', content: row.message };
      }
    } else if (row.message) {
      messageData = row.message;
    }

    // LÓGICA INVERTIDA DO N8N:
    // type: "human" = atendente enviando (out)
    // type: "ai" = cliente enviando (in)
    const direction = messageData.type === 'human' ? 'out' : 'in';

    return {
      id: row.id?.toString() || `n8n_${index}`,
      created_at: row.created_at || new Date().toISOString(),
      chat_id: `n8n_${normalizedPhone}`,
      direction: direction,
      message_type: 'text',
      body: messageData.content || '',
      media_url: null,
      media_meta: {},
      provider_message_id: row.id?.toString() || null,
      status: 'delivered',
      sent_at: row.created_at || null,
      phone: normalizedPhone,
      lead_id: null,
    } as ChatMessage;
  });
}

/**
 * Atualizar lead (stage, owner, atendimento_ia)
 */
export async function updateLead(
  leadId: number,
  updates: Partial<Pick<Lead, 'stage' | 'owner_user_id' | 'atendimento_ia' | 'tags'>>
): Promise<Lead | null> {
  const client = supabaseAdmin || supabase;
  
  const { data, error } = await client
    .from('dados_cliente')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .select()
    .single();

  if (error) {
    console.error('Erro ao atualizar lead:', error);
    throw error;
  }

  return data;
}

/**
 * Assumir atendimento (first-write-wins)
 */
export async function assumirAtendimento(
  leadId: number,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const client = supabaseAdmin || supabase;
  
  console.log(`[assumir] Lead: ${leadId}, User: ${userId}`);
  
  // Verificar se já está assumido
  const { data: lead, error: selectError } = await client
    .from('dados_cliente')
    .select('owner_user_id, nomewpp')
    .eq('id', leadId)
    .single();

  if (selectError) {
    console.error('[assumir] Erro ao buscar lead:', selectError);
    return { success: false, message: 'Erro ao buscar lead' };
  }

  console.log(`[assumir] Lead atual: owner=${lead?.owner_user_id}`);

  // Se já tem owner e não é o mesmo usuário
  if (lead?.owner_user_id && lead.owner_user_id !== userId) {
    return {
      success: false,
      message: 'Este atendimento já foi assumido por outro agente',
    };
  }

  // Assumir - update direto sem condição OR (já verificamos acima)
  const { data, error } = await client
    .from('dados_cliente')
    .update({
      owner_user_id: userId,
      stage: 'em_atendimento',
      atendimento_ia: 'pause',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .select();

  if (error) {
    console.error('[assumir] Erro ao atualizar:', error);
    return { success: false, message: 'Erro ao assumir atendimento: ' + error.message };
  }

  if (!data || data.length === 0) {
    return {
      success: false,
      message: 'Lead não encontrado para atualização',
    };
  }

  console.log(`[assumir] Sucesso! Lead ${leadId} assumido por ${userId}`);
  return { success: true, message: 'Atendimento assumido com sucesso' };
}

/**
 * Reativar IA
 */
export async function reativarIA(leadId: number): Promise<boolean> {
  const client = supabaseAdmin || supabase;
  
  const { error } = await client
    .from('dados_cliente')
    .update({
      atendimento_ia: 'reativada',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (error) {
    console.error('Erro ao reativar IA:', error);
    return false;
  }

  return true;
}

/**
 * Finalizar atendimento
 */
export async function finalizarAtendimento(leadId: number): Promise<boolean> {
  const client = supabaseAdmin || supabase;
  
  const { error } = await client
    .from('dados_cliente')
    .update({
      stage: 'finalizado',
      atendimento_ia: 'ativa',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  if (error) {
    console.error('Erro ao finalizar atendimento:', error);
    return false;
  }

  // Atualizar chat para closed
  await client
    .from('chats')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('lead_id', leadId);

  return true;
}

/**
 * Buscar leads para Kanban
 */
export async function getKanbanLeads(filters?: {
  regiao?: string;
  iniciado_por?: string;
  incluirFinalizados?: boolean;
}): Promise<any[]> {
  const client = supabaseAdmin || supabase;
  
  let query = client
    .from('dados_cliente')
    .select(`
      *,
      followups!left (
        id,
        data_agendada,
        motivo,
        status
      )
    `)
    .eq('status', 'ativo')
    .order('updated_at', { ascending: false })
    .limit(200);

  // Por padrão, inclui finalizados no Kanban
  // Só exclui se explicitamente pedido
  if (filters?.incluirFinalizados === false) {
    query = query.neq('stage', 'finalizado');
  }

  // Filtro de região
  if (filters?.regiao) {
    query = query.eq('regiao', filters.regiao);
  }

  // Filtro de iniciado_por
  if (filters?.iniciado_por) {
    query = query.eq('iniciado_por', filters.iniciado_por);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar kanban:', error);
    throw error;
  }

  // NOTA: O filtro de profissionais já ativos é feito no N8N (na criação do lead)
  // Aqui mostramos TODOS os leads normalmente
  return data || [];
}

/**
 * Buscar regiões distintas (para filtros)
 */
export async function getRegioes(): Promise<string[]> {
  const client = supabaseAdmin || supabase;
  
  const { data, error } = await client
    .from('dados_cliente')
    .select('regiao')
    .eq('status', 'ativo')
    .not('regiao', 'is', null)
    .not('regiao', 'eq', '');

  if (error) {
    console.error('Erro ao buscar regiões:', error);
    return [];
  }

  // Extrair valores únicos
  const uniqueRegioes = Array.from(new Set(data?.map((d: any) => d.regiao).filter(Boolean)));
  return uniqueRegioes.sort() as string[];
}

// ===========================================
// Utils
// ===========================================

/**
 * Normalizar telefone (remover @s.whatsapp.net e caracteres especiais)
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace(/\D/g, ''); // Remove tudo que não é dígito
}

/**
 * Formatar telefone para exibição
 */
export function formatPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.length === 13 && normalized.startsWith('55')) {
    // 5511999998888 -> +55 (11) 99999-8888
    return `+${normalized.slice(0, 2)} (${normalized.slice(2, 4)}) ${normalized.slice(4, 9)}-${normalized.slice(9)}`;
  }
  if (normalized.length === 12 && normalized.startsWith('55')) {
    // 551199998888 -> +55 (11) 9999-8888
    return `+${normalized.slice(0, 2)} (${normalized.slice(2, 4)}) ${normalized.slice(4, 8)}-${normalized.slice(8)}`;
  }
  return phone;
}
