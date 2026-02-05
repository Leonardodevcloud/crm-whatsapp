'use client';

// ===========================================
// Página Kanban - Pipeline de Leads
// ===========================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { useApi } from '@/lib/hooks';
import { formatPhone } from '@/lib/auth-client';
import {
  User,
  Phone,
  Clock,
  RefreshCw,
  Loader2,
  AlertCircle,
  GripVertical,
  MapPin,
  UserPlus,
  Search,
  CalendarPlus,
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatDistanceToNow, format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';

// Configuração das colunas do Kanban (4 estágios)
const KANBAN_COLUMNS = [
  { id: 'novo', title: 'Leads Novos', color: 'blue' },
  { id: 'qualificado', title: 'Leads com Cadastro Realizado', color: 'yellow' },
  { id: 'finalizado', title: 'Leads Ativados', color: 'green' },
  { id: 'lead_morto', title: 'Lead Morto', color: 'gray' },
];

interface KanbanCard {
  lead_id: number;
  lead_uuid: string;
  nomewpp: string | null;
  telefone: string;
  stage: string;
  atendimento_ia: string | null;
  tags: string[];
  regiao: string | null;
  iniciado_por: 'lead' | 'humano' | null;
  updated_at: string;
  cod_profissional?: string | null;
  followup_data?: string | null;
  followup_motivo?: string | null;
  resumo_ia?: string | null;
}

// Função para formatar nome com código como prefixo
function formatNomeComCodigo(nomewpp: string | null, cod_profissional: string | null | undefined): string {
  if (cod_profissional && nomewpp) {
    return `${cod_profissional} - ${nomewpp}`;
  }
  if (cod_profissional) {
    return `${cod_profissional} - Sem nome`;
  }
  return nomewpp || 'Sem nome';
}

// Modal de criar Follow-up
function FollowupModal({ 
  card, 
  onClose, 
  onSuccess 
}: { 
  card: KanbanCard; 
  onClose: () => void; 
  onSuccess: () => void;
}) {
  const [dataAgendada, setDataAgendada] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [motivo, setMotivo] = useState('Acompanhamento');
  const [notas, setNotas] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { fetchApi } = useApi();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await fetchApi('/api/followups', {
      method: 'POST',
      body: JSON.stringify({
        lead_id: card.lead_id,
        data_agendada: dataAgendada,
        motivo,
        notas,
        tipo: 'manual',
      }),
    });

    setIsLoading(false);

    if (error) {
      alert('Erro ao criar follow-up: ' + error);
    } else {
      alert('✅ Follow-up agendado com sucesso!');
      onSuccess();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">Agendar Follow-up</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lead</label>
            <p className="text-gray-900">{formatNomeComCodigo(card.nomewpp, card.cod_profissional)}</p>
            <p className="text-sm text-gray-500">{formatPhone(card.telefone)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data do Follow-up</label>
            <input
              type="date"
              value={dataAgendada}
              onChange={(e) => setDataAgendada(e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="input w-full"
            >
              <option value="Acompanhamento">Acompanhamento</option>
              <option value="Formalizar cadastro">Formalizar cadastro</option>
              <option value="Formalizar ativação">Formalizar ativação</option>
              <option value="Verificar interesse">Verificar interesse</option>
              <option value="Enviar proposta">Enviar proposta</option>
              <option value="Outro">Outro</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observações sobre o follow-up..."
              className="input w-full h-20 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
              Agendar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface KanbanData {
  [key: string]: KanbanCard[];
}

function KanbanContent() {
  const [data, setData] = useState<KanbanData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [draggingCard, setDraggingCard] = useState<KanbanCard | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [regiaoFilter, setRegiaoFilter] = useState('');
  const [iniciadoPorFilter, setIniciadoPorFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [regioes, setRegioes] = useState<string[]>([]);
  const [verificacaoInfo, setVerificacaoInfo] = useState<{verificados: number; atualizados: number} | null>(null);
  const [followupModalCard, setFollowupModalCard] = useState<KanbanCard | null>(null);
  const [expandedResumo, setExpandedResumo] = useState<number | null>(null);

  const { fetchApi } = useApi();
  const router = useRouter();

  // Carregar regiões disponíveis
  useEffect(() => {
    const loadRegioes = async () => {
      const { data } = await fetchApi<{ success: boolean; data: string[] }>('/api/regioes');
      if (data?.success) {
        setRegioes(data.data);
      }
    };
    loadRegioes();
  }, [fetchApi]);

  // Carregar dados (já verifica status automaticamente na API)
  const loadKanban = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    const params = new URLSearchParams();
    if (regiaoFilter) params.set('regiao', regiaoFilter);
    if (iniciadoPorFilter) params.set('iniciado_por', iniciadoPorFilter);

    const { data: response, error } = await fetchApi<{ 
      success: boolean; 
      data: KanbanData;
      verificacao?: { verificados: number; atualizados: number };
    }>(
      `/api/leads?${params.toString()}`
    );

    if (error) {
      setError(error);
    } else if (response?.success) {
      setData(response.data);
      if (response.verificacao) {
        setVerificacaoInfo(response.verificacao);
      }
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [fetchApi, regiaoFilter, iniciadoPorFilter]);

  useEffect(() => {
    loadKanban();
  }, [loadKanban]);

  // Polling (30 segundos - menos frequente que inbox)
  useEffect(() => {
    const interval = setInterval(loadKanban, 30000);
    return () => clearInterval(interval);
  }, [loadKanban]);

  // Drag & Drop handlers
  const handleDragStart = (card: KanbanCard) => {
    setDraggingCard(card);
  };

  const handleDragEnd = () => {
    setDraggingCard(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, newStage: string) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggingCard || draggingCard.stage === newStage) {
      setDraggingCard(null);
      return;
    }

    // Atualizar localmente (otimistic update)
    const oldStage = draggingCard.stage;
    setData((prev) => {
      const newData = { ...prev };
      // Remover do estágio antigo
      newData[oldStage] = newData[oldStage].filter(
        (c) => c.lead_id !== draggingCard.lead_id
      );
      // Adicionar ao novo estágio
      newData[newStage] = [
        { ...draggingCard, stage: newStage },
        ...(newData[newStage] || []),
      ];
      return newData;
    });

    // Chamar API
    const { error } = await fetchApi(`/api/chat/${draggingCard.lead_id}/stage`, {
      method: 'POST',
      body: JSON.stringify({ stage: newStage }),
    });

    if (error) {
      setError(error);
      // Reverter em caso de erro
      await loadKanban();
    }

    setDraggingCard(null);
  };

  // Abrir chat
  const openChat = (leadId: number) => {
    router.push(`/chat/${leadId}`);
  };

  // Cor do header baseada na coluna
  const getColumnHeaderColor = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-500',
      yellow: 'bg-yellow-500',
      green: 'bg-green-500',
      purple: 'bg-purple-500',
      gray: 'bg-gray-500',
    };
    return colors[color] || 'bg-gray-500';
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 h-screen flex flex-col">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4 flex-shrink-0">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Kanban</h1>
          <p className="text-gray-600">Arraste os cards para mudar o estágio</p>
        </div>

        {/* Campo de Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar código, nome, telefone..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="input pl-10 min-w-[220px]"
          />
        </div>

        {/* Filtro de Região */}
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <select
            value={regiaoFilter}
            onChange={(e) => setRegiaoFilter(e.target.value)}
            className="input pl-10 pr-8 appearance-none cursor-pointer min-w-[160px]"
          >
            <option value="">Todas as regiões</option>
            {regioes.map((regiao) => (
              <option key={regiao} value={regiao}>
                {regiao}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro Iniciado Por */}
        <div className="relative">
          <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <select
            value={iniciadoPorFilter}
            onChange={(e) => setIniciadoPorFilter(e.target.value)}
            className="input pl-10 pr-8 appearance-none cursor-pointer min-w-[160px]"
          >
            <option value="">Todos os leads</option>
            <option value="lead">Iniciado por Lead</option>
            <option value="humano">Iniciado por Humano</option>
          </select>
        </div>

        <button
          onClick={loadKanban}
          disabled={isRefreshing}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={clsx('w-4 h-4', isRefreshing && 'animate-spin')} />
          <span>{isRefreshing ? 'Verificando...' : 'Atualizar'}</span>
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="card mb-4 p-4 bg-red-50 border-red-200 flex-shrink-0">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 h-full pb-4 min-w-max">
          {KANBAN_COLUMNS.map((column) => {
            // Filtrar cards por busca local
            const allCards = data[column.id] || [];
            const cards = searchFilter 
              ? allCards.filter(card => {
                  const searchLower = searchFilter.toLowerCase();
                  const nome = (card.nomewpp || '').toLowerCase();
                  const telefone = (card.telefone || '').toLowerCase();
                  const cod = (card.cod_profissional || '').toLowerCase();
                  return nome.includes(searchLower) || telefone.includes(searchLower) || cod.includes(searchLower);
                })
              : allCards;
            const isDropTarget = dragOverColumn === column.id;

            return (
              <div
                key={column.id}
                className={clsx(
                  'kanban-column flex flex-col',
                  isDropTarget && 'ring-2 ring-blue-400 ring-offset-2'
                )}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {/* Header da coluna */}
                <div className="flex items-center gap-2 mb-3">
                  <div className={clsx('w-3 h-3 rounded-full', getColumnHeaderColor(column.color))} />
                  <h2 className="font-semibold text-gray-700">{column.title}</h2>
                  <span className="ml-auto text-sm text-gray-500 bg-white px-2 py-0.5 rounded-full">
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin">
                  {cards.map((card) => (
                    <div
                      key={card.lead_id}
                      draggable
                      onDragStart={() => handleDragStart(card)}
                      onDragEnd={handleDragEnd}
                      onClick={() => openChat(card.lead_id)}
                      className={clsx(
                        'kanban-card group',
                        draggingCard?.lead_id === card.lead_id && 'opacity-50'
                      )}
                    >
                      {/* Drag handle */}
                      <div className="flex items-start gap-2">
                        <GripVertical className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          {/* Nome com código como prefixo */}
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="font-medium text-gray-900 truncate">
                              {formatNomeComCodigo(card.nomewpp, card.cod_profissional)}
                            </span>
                          </div>

                          {/* Telefone */}
                          <div className="flex items-center gap-1 text-sm text-gray-500 mt-2">
                            <Phone className="w-3 h-3" />
                            <span>{formatPhone(card.telefone)}</span>
                          </div>

                          {/* Região */}
                          {card.regiao && (
                            <div className="flex items-center gap-1 mt-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                <MapPin className="w-3 h-3" />
                                {card.regiao}
                              </span>
                            </div>
                          )}

                          {/* Badge Iniciado por Humano */}
                          {card.iniciado_por === 'humano' && (
                            <div className="flex items-center gap-1 mt-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                <UserPlus className="w-3 h-3" />
                                Iniciado por Humano
                              </span>
                            </div>
                          )}

                          {/* Badge Follow-up Agendado */}
                          {card.followup_data && (
                            <div className="flex items-center gap-1 mt-2">
                              <span className={clsx(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                                new Date(card.followup_data + 'T12:00:00') < new Date() 
                                  ? 'bg-red-100 text-red-700' 
                                  : new Date(card.followup_data + 'T12:00:00').toDateString() === new Date().toDateString()
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-blue-100 text-blue-700'
                              )}>
                                <CalendarPlus className="w-3 h-3" />
                                {format(new Date(card.followup_data + 'T12:00:00'), "dd/MM")}
                              </span>
                            </div>
                          )}

                          {/* Badge Resumo IA - Clicável */}
                          {card.resumo_ia && (
                            <div className="mt-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedResumo(expandedResumo === card.lead_id ? null : card.lead_id);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 hover:from-purple-200 hover:to-pink-200 transition-colors"
                              >
                                <Sparkles className="w-3 h-3" />
                                Resumo IA
                                {expandedResumo === card.lead_id ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                              
                              {/* Resumo Expandido */}
                              {expandedResumo === card.lead_id && (
                                <div 
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-2 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg text-xs text-gray-700 border border-purple-100"
                                >
                                  <p className="whitespace-pre-wrap">{card.resumo_ia}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Tags */}
                          {card.tags && card.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {card.tags.slice(0, 3).map((tag, i) => (
                                <span key={i} className="tag-blue text-xs">
                                  {tag}
                                </span>
                              ))}
                              {card.tags.length > 3 && (
                                <span className="tag-gray text-xs">
                                  +{card.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Última atividade e botão follow-up */}
                          <div className="flex items-center justify-between mt-2">
                            {card.updated_at && (
                              <div className="flex items-center gap-1 text-xs text-gray-400">
                                <Clock className="w-3 h-3" />
                                <span>
                                  {formatDistanceToNow(new Date(card.updated_at), {
                                    addSuffix: true,
                                    locale: ptBR,
                                  })}
                                </span>
                              </div>
                            )}
                            {/* Botão Follow-up */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFollowupModalCard(card);
                              }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                              title="Agendar Follow-up"
                            >
                              <CalendarPlus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Empty state */}
                  {cards.length === 0 && (
                    <div className="h-32 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                      Nenhum lead
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de Follow-up */}
      {followupModalCard && (
        <FollowupModal
          card={followupModalCard}
          onClose={() => setFollowupModalCard(null)}
          onSuccess={loadKanban}
        />
      )}
    </div>
  );
}

export default function KanbanPage() {
  return (
    <AuthLayout>
      <KanbanContent />
    </AuthLayout>
  );
}
