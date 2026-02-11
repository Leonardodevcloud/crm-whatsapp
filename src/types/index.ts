// ===========================================
// Types - CRM WhatsApp Tutts
// ===========================================

// ==================== AUTH ====================
export interface TuttsUser {
  id: number;
  codProfissional: string;
  role: 'admin' | 'admin_master' | 'admin_financeiro' | 'user';
  nome: string;
  iat?: number;
  exp?: number;
}

export interface AuthState {
  user: TuttsUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ==================== DATABASE ====================

// Tabela: dados_cliente (Lead)
export interface Lead {
  id: number;
  created_at: string;
  updated_at: string;
  uuid: string;
  telefone: string | null;
  nomewpp: string | null;
  atendimento_ia: 'ativa' | 'pause' | 'reativada' | null;
  stage: string;
  status: string;
  owner_user_id: string | null;
  tags: string[];
  origem: string;
  regiao: string | null;
  iniciado_por: 'lead' | 'humano' | null;
  // Campos de ressuscitação
  ressuscitado_em?: string | null;
  vezes_ressuscitado?: number;
  // Código do profissional (da planilha)
  cod_profissional?: string | null;
  // Resumo gerado pela IA
  resumo_ia?: string | null;
}

// Tabela: chats
export interface Chat {
  id: string; // UUID
  created_at: string;
  updated_at: string;
  lead_id: number | null;
  channel: string;
  provider: string;
  remote_jid: string | null;
  instance_name: string | null;
  status: 'open' | 'closed' | string;
  assigned_user_id: string | null;
  last_message_at: string | null;
  phone: string | null;
}

// Tabela: chat_messages
export interface ChatMessage {
  id: string; // UUID
  created_at: string;
  chat_id: string;
  direction: 'in' | 'out' | 'incoming' | 'outcoming' | 'outgoing_human' | string; // in/incoming = cliente, out/outcoming = bot, outgoing_human = atendente humano
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document' | string;
  body: string | null;
  media_url: string | null;
  media_meta: Record<string, any>;
  provider_message_id: string | null;
  status: 'received' | 'sent' | 'delivered' | 'read' | string;
  sent_at: string | null;
  phone: string | null;
  lead_id: number | null;
}

// ==================== API RESPONSES ====================

// Inbox item (lead + chat combinado)
export interface InboxItem {
  // Dados do Lead
  lead_id: number;
  lead_uuid: string;
  telefone: string;
  nomewpp: string | null;
  stage: string;
  atendimento_ia: string | null;
  owner_user_id: string | null;
  tags: string[];
  regiao: string | null;
  iniciado_por: 'lead' | 'humano' | null;
  cod_profissional: string | null;
  resumo_ia: string | null;
  
  // Dados do Chat
  chat_id: string | null;
  chat_status: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  
  // Follow-up pendente
  followup_data: string | null;
  followup_motivo: string | null;
}

// Chat detail (para página de conversa)
export interface ChatDetail {
  lead: Lead;
  chat: Chat | null;
  messages: ChatMessage[];
}

// ==================== KANBAN ====================

export type KanbanStage = 'novo' | 'qualificado' | 'finalizado' | 'lead_morto';

export interface KanbanCard {
  lead_id: number;
  lead_uuid: string;
  nomewpp: string | null;
  telefone: string;
  stage: string;
  last_message_at: string | null;
  atendimento_ia: string | null;
  tags: string[];
  regiao: string | null;
  iniciado_por: 'lead' | 'humano' | null;
  ressuscitado_em?: string | null;
  vezes_ressuscitado?: number;
  cod_profissional?: string | null;
  followup_data?: string | null;
  followup_motivo?: string | null;
  resumo_ia?: string | null;
}

export interface KanbanColumn {
  id: KanbanStage;
  title: string;
  cards: KanbanCard[];
}

// ==================== API ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ==================== FILTERS ====================

export interface InboxFilters {
  stage?: string;
  owner?: string;
  search?: string;
  atendimento_ia?: string;
  regiao?: string;
  iniciado_por?: string;
}
