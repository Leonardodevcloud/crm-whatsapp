// ===========================================
// Types - CRM WhatsApp Tutts
// v3 - Refletindo schema do banco da Tatiane
// ===========================================

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

export interface Lead {
  id: number;
  created_at: string;
  updated_at: string;
  uuid: string;
  telefone: string | null;
  nomewpp: string | null;
  atendimento_ia: 'ativa' | 'on' | 'pause' | 'reativada' | null;
  stage: string;
  status: string;
  owner_user_id: string | null;
  tags: string[];
  origem: string;
  regiao: string | null;
  iniciado_por: 'lead' | 'humano' | string | null;
  ressuscitado_em?: string | null;
  vezes_ressuscitado?: number;
  cod_profissional?: string | null;
  resumo_ia?: string | null;
  data_ativacao?: string | null;
  last_enriched_at?: string | null;
  remotejid?: string | null;
  chat_lid?: string | null;
  remote_jid?: string | null;
  telefone_numerico?: string | null;
  pausado_por?: string | null;
  pausado_em?: string | null;
  pausado_ate?: string | null;
  tatiane_ultima_interacao?: string | null;
  tatiane_total_mensagens?: number;
  mapp_status?: string | null;
  mapp_verificado_em?: string | null;
}

export interface TatianeChatHistory {
  id: number;
  session_id: string;
  message_type: 'human' | 'ai';
  content: string;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  created_at: string;
  chat_id: string;
  direction: 'in' | 'out' | 'incoming' | 'outcoming' | 'outgoing_human' | string;
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

export interface Chat {
  id: string;
  status: 'open' | 'closed' | string;
  last_message_at: string | null;
  lead_id: number | null;
  chat_lid?: string | null;
}

export interface Followup {
  id: number;
  lead_id: number | null;
  chat_lid: string;
  sequencia: number;
  tipo: string;
  status: 'pendente' | 'concluido' | 'falha' | 'cancelado';
  motivo: string | null;
  mensagem: string | null;
  data_agendada: string | null;
  enviado_em: string | null;
  created_at: string;
  notas?: string | null;
  completed_at?: string | null;
  criado_por?: number | null;
}

export interface TatianeResumo {
  id: number;
  chat_lid: string;
  lead_id: number | null;
  resumo: string;
  created_at: string;
}

export interface LeadNaoIniciado {
  id: number;
  codigo: string | null;
  nome: string | null;
  telefone: string;
  telefone_normalizado: string;
  regiao: string | null;
  created_at: string;
  uploaded_by: number | null;
  data_cadastro: string | null;
}

export interface ProfissionalObservacao {
  id: number;
  codigo: string;
  telefone: string | null;
  observacao: string;
  updated_at: string;
  updated_by: string | null;
  created_at: string;
}

export interface InboxItem {
  lead_id: number;
  lead_uuid: string;
  telefone: string;
  nomewpp: string | null;
  stage: string;
  atendimento_ia: string | null;
  owner_user_id: string | null;
  tags: string[];
  regiao: string | null;
  iniciado_por: 'lead' | 'humano' | string | null;
  cod_profissional: string | null;
  resumo_ia: string | null;
  chat_id: string | null;
  chat_status: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  followup_data: string | null;
  followup_motivo: string | null;
}

export interface ChatDetail {
  lead: Lead;
  chat: Chat | null;
  messages: ChatMessage[];
}

export type KanbanStage = 'novo' | 'qualificado' | 'finalizado' | 'lead_morto';

export interface KanbanCard {
  lead_id: number;
  lead_uuid: string;
  nomewpp: string | null;
  telefone: string;
  stage: string;
  last_message_at?: string | null;
  atendimento_ia: string | null;
  tags: string[];
  regiao: string | null;
  iniciado_por: 'lead' | 'humano' | string | null;
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

export interface InboxFilters {
  stage?: string;
  owner?: string;
  search?: string;
  atendimento_ia?: string;
  regiao?: string;
  iniciado_por?: string;
}
