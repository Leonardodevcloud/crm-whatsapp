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
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  MapPin,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';
import type { Lead, Chat, ChatMessage } from '@/types';

// Stages para dropdown
const STAGES = [
  { value: 'novo', label: 'Lead Novo' },
  { value: 'em_atendimento', label: 'Em Atendimento' },
  { value: 'qualificado', label: 'Cadastro Realizado' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'finalizado', label: 'Lead Ativado' },
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
  const [showSidebar, setShowSidebar] = useState(true);

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
                 lead.stage === 'qualificado' ? 'Cadastro Realizado' :
                 lead.stage === 'novo' ? 'Lead Novo' :
                 lead.stage === 'proposta' ? 'Proposta' :
                 lead.stage === 'finalizado' ? 'Lead Ativado' : lead.stage}
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

      {/* Container principal: Sidebar + Chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Resumo IA e Dados do Lead */}
        {showSidebar && (
          <aside className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
            {/* Header da Sidebar */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <User className="w-4 h-4" />
                Dados do Lead
              </h2>
              <button
                onClick={() => setShowSidebar(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                title="Fechar painel"
              >
                <PanelLeftClose className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Conteúdo da Sidebar */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Info básica */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">{formatPhone(lead.telefone || '')}</span>
                </div>
                {lead.regiao && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{lead.regiao}</span>
                  </div>
                )}
                {lead.cod_profissional && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400 font-mono text-xs">COD:</span>
                    <span className="text-gray-700 font-medium">{lead.cod_profissional}</span>
                  </div>
                )}
              </div>

              {/* Tags */}
              {lead.tags && lead.tags.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Tags</h3>
                  <div className="flex flex-wrap gap-1">
                    {lead.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Resumo IA */}
              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-3 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  Resumo IA
                </h3>
                
                {lead.resumo_ia ? (
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-100">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {lead.resumo_ia}
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <Sparkles className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                      Nenhum resumo gerado ainda
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      O resumo será gerado automaticamente quando o lead for qualificado
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Botão para abrir sidebar quando fechada */}
        {!showSidebar && (
          <button
            onClick={() => setShowSidebar(true)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white border border-gray-200 rounded-r-lg p-2 shadow-sm hover:bg-gray-50 transition-colors"
            title="Abrir painel"
          >
            <PanelLeftOpen className="w-4 h-4 text-gray-500" />
          </button>
        )}

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">Nenhuma mensagem ainda</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg, index) => {
              // 3 tipos de direction:
              // incoming/in = lead mandou
              // outcoming/out = IA mandou (via API)
              // outgoing_human = humano mandou (pelo celular)
              const isIncoming = msg.direction === 'in' || msg.direction === 'incoming';
              const isHumanOutgoing = msg.direction === 'outgoing_human';
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
                        isIncoming ? 'chat-bubble-in' : isHumanOutgoing ? 'chat-bubble-human' : 'chat-bubble-out'
                      )}
                    >
                      {/* Nome do remetente */}
                      <div className={clsx(
                        'text-xs font-semibold mb-1',
                        isIncoming ? 'text-gray-600' : isHumanOutgoing ? 'text-green-200' : 'text-blue-200'
                      )}>
                        {isIncoming 
                          ? (lead?.nomewpp || 'Cliente')
                          : isHumanOutgoing
                            ? '💬 Atendente'
                            : '🤖 Tatiane Bot'
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
