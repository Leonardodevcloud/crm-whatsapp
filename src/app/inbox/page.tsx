'use client';

// ===========================================
// Página Inbox - Lista de Conversas
// ===========================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { useApi } from '@/lib/hooks';
import { formatPhone } from '@/lib/auth-client';
import {
  Search,
  Filter,
  RefreshCw,
  User,
  Bot,
  Phone,
  Clock,
  ChevronRight,
  Loader2,
  AlertCircle,
  MapPin,
  UserPlus,
  CalendarPlus,
  X,
} from 'lucide-react';
import { formatDistanceToNow, format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';
import type { InboxItem } from '@/types';

// Estágios disponíveis (4 estágios)
const STAGES = [
  { value: '', label: 'Todos os estágios' },
  { value: 'novo', label: 'Lead Novo' },
  { value: 'qualificado', label: 'Cadastro Realizado' },
  { value: 'finalizado', label: 'Lead Ativado' },
  { value: 'lead_morto', label: 'Lead Morto' },
];

// Função para formatar nome com código como prefixo
function formatNomeComCodigo(nomewpp: string | null, cod_profissional: string | null): string {
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
  lead, 
  onClose, 
  onSuccess 
}: { 
  lead: InboxItem; 
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
        lead_id: lead.lead_id,
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
            <p className="text-gray-900">{formatNomeComCodigo(lead.nomewpp, lead.cod_profissional)}</p>
            <p className="text-sm text-gray-500">{formatPhone(lead.telefone)}</p>
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

function InboxContent() {
  const [leads, setLeads] = useState<InboxItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [regiaoFilter, setRegiaoFilter] = useState('');
  const [iniciadoPorFilter, setIniciadoPorFilter] = useState('');
  const [regioes, setRegioes] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [followupModalLead, setFollowupModalLead] = useState<InboxItem | null>(null);

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

  // Carregar leads
  const loadLeads = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    const params = new URLSearchParams();
    if (stageFilter) params.set('stage', stageFilter);
    if (regiaoFilter) params.set('regiao', regiaoFilter);
    if (iniciadoPorFilter) params.set('iniciado_por', iniciadoPorFilter);
    if (search) params.set('search', search);

    const { data, error } = await fetchApi<{ success: boolean; data: InboxItem[] }>(
      `/api/inbox?${params.toString()}`
    );

    if (error) {
      setError(error);
    } else if (data?.success) {
      setLeads(data.data);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [fetchApi, stageFilter, regiaoFilter, iniciadoPorFilter, search]);

  // Carregar ao montar e quando filtros mudam
  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // Polling para atualização (15 segundos)
  useEffect(() => {
    const interval = setInterval(loadLeads, 15000);
    return () => clearInterval(interval);
  }, [loadLeads]);

  // Debounce na busca
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch !== search) return;
    loadLeads();
  }, [debouncedSearch]);

  // Abrir chat
  const openChat = (leadId: number) => {
    router.push(`/chat/${leadId}`);
  };

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
        <p className="text-gray-600">Gerencie suas conversas do WhatsApp</p>
      </div>

      {/* Filtros */}
      <div className="card mb-6">
        <div className="p-4 flex flex-col sm:flex-row gap-4">
          {/* Busca */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por código, nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>

          {/* Filtro de Stage */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="input pl-10 pr-8 appearance-none cursor-pointer min-w-[180px]"
            >
              {STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </select>
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

          {/* Refresh */}
          <button
            onClick={loadLeads}
            disabled={isRefreshing}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={clsx('w-4 h-4', isRefreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="card mb-6 p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Carregando conversas...</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-600">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {leads.map((lead) => (
              <div
                key={lead.lead_id}
                onClick={() => openChat(lead.lead_id)}
                className="flex items-center gap-4 p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                {/* Avatar */}
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-6 h-6 text-blue-600" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium text-gray-900 truncate">
                      {formatNomeComCodigo(lead.nomewpp, lead.cod_profissional)}
                    </span>
                    {/* Badge Stage - CORES FORTES */}
                    <span className={clsx(
                      'inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm',
                      lead.stage === 'novo' && 'bg-blue-500',
                      lead.stage === 'qualificado' && 'bg-yellow-500',
                      lead.stage === 'finalizado' && 'bg-green-500',
                      lead.stage === 'lead_morto' && 'bg-gray-500',
                      !['novo', 'qualificado', 'finalizado', 'lead_morto'].includes(lead.stage) && 'bg-gray-400'
                    )}>
                      {lead.stage === 'qualificado' ? 'Cadastro Realizado' :
                       lead.stage === 'novo' ? 'Lead Novo' :
                       lead.stage === 'finalizado' ? 'Lead Ativado' : 
                       lead.stage === 'lead_morto' ? 'Lead Morto' : lead.stage}
                    </span>
                    {/* Badge Região */}
                    {lead.regiao && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                        <MapPin className="w-3 h-3" />
                        {lead.regiao}
                      </span>
                    )}
                    {/* Badge Iniciado por Humano */}
                    {lead.iniciado_por === 'humano' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        <UserPlus className="w-3 h-3" />
                        Iniciado por Humano
                      </span>
                    )}
                    {/* Badge Follow-up Agendado */}
                    {lead.followup_data && (
                      <span className={clsx(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                        new Date(lead.followup_data + 'T12:00:00') < new Date() 
                          ? 'bg-red-100 text-red-700' 
                          : new Date(lead.followup_data + 'T12:00:00').toDateString() === new Date().toDateString()
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-blue-100 text-blue-700'
                      )}>
                        <CalendarPlus className="w-3 h-3" />
                        {format(new Date(lead.followup_data + 'T12:00:00'), "dd/MM")}
                      </span>
                    )}
                    {/* Tags (TP e outras) */}
                    {lead.tags && lead.tags.length > 0 && lead.tags.map((tag, idx) => (
                      <span 
                        key={idx}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span>{formatPhone(lead.telefone)}</span>
                    {lead.atendimento_ia && (
                      <span className={clsx('flex items-center gap-1', `ia-${lead.atendimento_ia}`)}>
                        <Bot className="w-3 h-3" />
                        {lead.atendimento_ia === 'pause' ? 'IA pausada' : 'IA ativa'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <div className="text-right flex-shrink-0">
                  {lead.last_message_at && (
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <Clock className="w-3 h-3" />
                      <span>
                        {formatDistanceToNow(new Date(lead.last_message_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Botão Follow-up */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFollowupModalLead(lead);
                  }}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
                  title="Agendar Follow-up"
                >
                  <CalendarPlus className="w-5 h-5" />
                </button>

                {/* Arrow */}
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Follow-up */}
      {followupModalLead && (
        <FollowupModal
          lead={followupModalLead}
          onClose={() => setFollowupModalLead(null)}
          onSuccess={loadLeads}
        />
      )}

      {/* Counter */}
      {leads.length > 0 && (
        <p className="text-sm text-gray-500 mt-4 text-center">
          {leads.length} conversa{leads.length !== 1 ? 's' : ''} encontrada{leads.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <AuthLayout>
      <InboxContent />
    </AuthLayout>
  );
}
