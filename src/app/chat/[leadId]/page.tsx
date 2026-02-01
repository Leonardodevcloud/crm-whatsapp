'use client';

// ===========================================
// Página Chat - Histórico de Mensagens
// ===========================================

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { useApi, useAuth } from '@/lib/hooks';
import { userIdToUuid, formatPhone } from '@/lib/auth-client';
import {
  ArrowLeft,
  User,
  Bot,
  Phone,
  Clock,
  UserCheck,
  RefreshCw,
  CheckCircle,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
  FileText,
  Play,
  Mic,
  MessageCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';
import type { Lead, Chat, ChatMessage } from '@/types';

// Stages para dropdown
const STAGES = [
  { value: 'novo', label: 'Novo' },
  { value: 'em_atendimento', label: 'Em Atendimento' },
  { value: 'qualificado', label: 'Qualificado' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'finalizado', label: 'Finalizado' },
];

interface ChatDetailResponse {
  success: boolean;
  data: {
    lead: Lead;
    chat: Chat | null;
    messages: ChatMessage[];
  };
}

function ChatContent({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { fetchApi } = useApi();
  const { user } = useAuth();
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carregar dados
  const loadChat = async () => {
    setError(null);
    
    const { data, error } = await fetchApi<ChatDetailResponse>(`/api/chat/${leadId}`);

    if (error) {
      setError(error);
    } else if (data?.success) {
      setLead(data.data.lead);
      setChat(data.data.chat);
      setMessages(data.data.messages);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadChat();
  }, [leadId]);

  // Polling para novas mensagens (10 segundos)
  useEffect(() => {
    const interval = setInterval(loadChat, 10000);
    return () => clearInterval(interval);
  }, [leadId]);

  // Scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Ações
  const handleAction = async (action: 'assumir' | 'reativar' | 'finalizar') => {
    setActionLoading(action);
    setError(null);

    const { data, error } = await fetchApi(`/api/chat/${leadId}/${action}`, {
      method: 'POST',
    });

    if (error) {
      setError(error);
    } else if (data?.success) {
      await loadChat(); // Recarregar dados
    }

    setActionLoading(null);
  };

  // Atualizar stage
  const handleStageChange = async (newStage: string) => {
    setActionLoading('stage');
    setError(null);

    const { data, error } = await fetchApi(`/api/chat/${leadId}/stage`, {
      method: 'POST',
      body: JSON.stringify({ stage: newStage }),
    });

    if (error) {
      setError(error);
    } else if (data?.success) {
      await loadChat();
    }

    setActionLoading(null);
  };

  // Renderizar ícone do tipo de mensagem
  const renderMessageTypeIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="w-4 h-4" />;
      case 'audio':
        return <Mic className="w-4 h-4" />;
      case 'video':
        return <Play className="w-4 h-4" />;
      case 'document':
        return <FileText className="w-4 h-4" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Lead não encontrado</p>
          <button onClick={() => router.push('/inbox')} className="btn-primary mt-4">
            Voltar para Inbox
          </button>
        </div>
      </div>
    );
  }

  const isOwner = user?.id ? lead.owner_user_id === userIdToUuid(user.id) : false;
  const canManage = isOwner || ['admin', 'admin_master'].includes(user?.role || '');

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          {/* Voltar */}
          <button
            onClick={() => router.push('/inbox')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Avatar */}
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-blue-600" />
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-gray-900">{lead.nomewpp || 'Sem nome'}</h1>
              {/* Badge Stage - CORES FORTES */}
              <span className={clsx(
                'inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm',
                lead.stage === 'novo' && 'bg-blue-500',
                lead.stage === 'em_atendimento' && 'bg-yellow-500',
                lead.stage === 'qualificado' && 'bg-green-500',
                lead.stage === 'proposta' && 'bg-purple-500',
                lead.stage === 'finalizado' && 'bg-gray-500',
                !['novo', 'em_atendimento', 'qualificado', 'proposta', 'finalizado'].includes(lead.stage) && 'bg-gray-400'
              )}>
                {lead.stage === 'em_atendimento' ? 'Em Atendimento' : 
                 lead.stage === 'qualificado' ? 'Qualificado' :
                 lead.stage === 'novo' ? 'Novo' :
                 lead.stage === 'proposta' ? 'Proposta' :
                 lead.stage === 'finalizado' ? 'Finalizado' : lead.stage}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {formatPhone(lead.telefone || '')}
              </span>
              {lead.atendimento_ia && (
                <span className={clsx('flex items-center gap-1', `ia-${lead.atendimento_ia}`)}>
                  <Bot className="w-3 h-3" />
                  {lead.atendimento_ia === 'pause' ? 'IA pausada' : 
                   lead.atendimento_ia === 'reativada' ? 'IA reativada' : 'IA ativa'}
                </span>
              )}
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Dropdown Stage */}
            <select
              value={lead.stage}
              onChange={(e) => handleStageChange(e.target.value)}
              disabled={actionLoading === 'stage'}
              className="input py-2 px-3 text-sm"
            >
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {/* Assumir */}
            {!lead.owner_user_id && (
              <button
                onClick={() => handleAction('assumir')}
                disabled={!!actionLoading}
                className="btn-primary btn-sm flex items-center gap-2"
              >
                {actionLoading === 'assumir' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserCheck className="w-4 h-4" />
                )}
                <span>Assumir</span>
              </button>
            )}

            {/* Reativar IA */}
            {canManage && lead.atendimento_ia === 'pause' && (
              <button
                onClick={() => handleAction('reativar')}
                disabled={!!actionLoading}
                className="btn-warning btn-sm flex items-center gap-2 h-9"
              >
                {actionLoading === 'reativar' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
                <span>Reativar IA</span>
              </button>
            )}

            {/* Finalizar */}
            {canManage && lead.stage !== 'finalizado' && (
              <button
                onClick={() => handleAction('finalizar')}
                disabled={!!actionLoading}
                className="btn-success btn-sm flex items-center gap-2 h-9"
              >
                {actionLoading === 'finalizar' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                <span>Finalizar</span>
              </button>
            )}

            {/* Refresh */}
            <button onClick={loadChat} className="btn-secondary btn-sm p-2">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}
      </header>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-100 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">Nenhuma mensagem ainda</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg, index) => {
              // Aceita 'in'/'incoming' como mensagem do cliente
              const isIncoming = msg.direction === 'in' || msg.direction === 'incoming';
              const showDate =
                index === 0 ||
                format(new Date(msg.created_at), 'yyyy-MM-dd') !==
                  format(new Date(messages[index - 1].created_at), 'yyyy-MM-dd');

              return (
                <div key={msg.id}>
                  {/* Separador de data */}
                  {showDate && (
                    <div className="flex justify-center my-4">
                      <span className="bg-white px-3 py-1 rounded-full text-xs text-gray-500 shadow-sm">
                        {format(new Date(msg.created_at), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                      </span>
                    </div>
                  )}

                  {/* Mensagem */}
                  <div
                    className={clsx(
                      'flex',
                      isIncoming ? 'justify-start' : 'justify-end'
                    )}
                  >
                    <div
                      className={clsx(
                        isIncoming ? 'chat-bubble-in' : 'chat-bubble-out'
                      )}
                    >
                      {/* Nome do remetente */}
                      <div className={clsx(
                        'text-xs font-semibold mb-1',
                        isIncoming ? 'text-gray-600' : 'text-blue-200'
                      )}>
                        {isIncoming 
                          ? (lead?.iniciado_por === 'humano' ? '👤 Lead' : (lead?.nomewpp || 'Cliente'))
                          : (lead?.iniciado_por === 'humano' ? '💬 Atendente' : '🤖 Tatiane Bot')
                        }
                      </div>

                      {/* Tipo de mídia (só se for mídia real) */}
                      {msg.message_type && ['image', 'audio', 'video', 'document', 'sticker'].includes(msg.message_type) && (
                        <div className="flex items-center gap-2 mb-1 opacity-70">
                          {renderMessageTypeIcon(msg.message_type)}
                          <span className="text-xs capitalize">{msg.message_type}</span>
                        </div>
                      )}

                      {/* Conteúdo */}
                      {msg.body && (
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      )}

                      {/* Mídia */}
                      {msg.media_url && msg.message_type === 'image' && (
                        <img
                          src={msg.media_url}
                          alt="Imagem"
                          className="rounded-lg max-w-full mt-2"
                        />
                      )}

                      {/* Timestamp */}
                      <div
                        className={clsx(
                          'text-xs mt-1 opacity-70',
                          isIncoming ? 'text-gray-500' : 'text-blue-100'
                        )}
                      >
                        {format(new Date(msg.created_at), 'HH:mm')}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Footer compacto com botão WhatsApp */}
      {lead.telefone && (
        <div className="bg-white border-t border-gray-200 px-4 py-2">
          <a
            href={`https://wa.me/${lead.telefone.replace(/@.*$/, '').replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-whatsapp w-full flex items-center justify-center gap-2 py-2 text-sm"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="font-medium">Abrir conversa no WhatsApp</span>
          </a>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const params = useParams();
  const leadId = params.leadId as string;
  
  return (
    <AuthLayout>
      <ChatContent leadId={leadId} />
    </AuthLayout>
  );
}
