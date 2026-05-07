'use client';

// ===========================================
// Página Follow-ups - Central de Acompanhamento
// ===========================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { useApi } from '@/lib/hooks';
import { formatPhone } from '@/lib/auth-client';
import {
  Clock,
  AlertCircle,
  RefreshCw,
  Loader2,
  User,
  Phone,
  MapPin,
  Calendar,
  CheckCircle,
  XCircle,
  MessageCircle,
  ChevronRight,
  Zap,
  Sparkles,
  Eye,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Helpers seguros para datas — protegem contra Invalid Date no SSR
function parseDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  let s = String(value);
  // PostgreSQL às vezes retorna "2026-04-22 19:43:01.377" (sem T/Z)
  if (s.includes(' ') && !s.includes('T')) {
    s = s.replace(' ', 'T');
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function safeFormat(value: any, pattern: string, options?: any): string {
  const d = parseDateSafe(value);
  if (!d) return '';
  try {
    return format(d, pattern, options);
  } catch {
    return '';
  }
}

function safeFormatDistanceToNow(value: any, options?: any): string {
  const d = parseDateSafe(value);
  if (!d) return '';
  try {
    return formatDistanceToNow(d, options);
  } catch {
    return '';
  }
}
import clsx from 'clsx';

interface Followup {
  id: number;
  lead_id: number;
  data_agendada: string;
  motivo: string;
  notas: string | null;
  status: string;
  tipo: string;
  sequencia: number;
  created_at: string;
  situacao: 'atrasado' | 'hoje' | 'futuro';
  dados_cliente: {
    id: number;
    nomewpp: string | null;
    telefone: string;
    stage: string;
    regiao: string | null;
  };
}

interface Contagem {
  atrasados: number;
  hoje: number;
  futuro: number;
  total: number;
}

interface Metrics {
  enviados: { ultimas_24h: number; ultimos_7d: number; ultimos_30d: number };
  pendentes: { atrasados: number; total: number };
  taxa_resposta: { ultimos_7d: number; ultimos_30d: number; respondidos_7d: number; respondidos_30d: number };
  ultimo_envio: string | null;
}

interface MensagemDetalhe {
  followup_id: number;
  lead_id: number;
  nome_lead: string | null;
  telefone: string | null;
  stage_atual: string | null;
  tipo: string;
  sequencia: number;
  motivo: string;
  enviado_em: string;
  mensagem_enviada: string | null;
  mensagem_planejada: string | null;
  respondeu: boolean;
  respondeu_em: string | null;
  tempo_resposta_horas: number | null;
}

function FollowupsContent() {
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [contagem, setContagem] = useState<Contagem>({ atrasados: 0, hoje: 0, futuro: 0, total: 0 });
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [mensagemModal, setMensagemModal] = useState<MensagemDetalhe | null>(null);
  const [loadingMensagem, setLoadingMensagem] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'atrasado' | 'hoje' | 'futuro' | 'concluido'>('todos');

  const { fetchApi } = useApi();
  const router = useRouter();

  // Carregar follow-ups
  const loadFollowups = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    const params = new URLSearchParams();
    if (filtro === 'concluido') {
      params.set('status', 'concluido');
    } else if (filtro !== 'todos') {
      params.set('situacao', filtro);
    }

    const { data: response, error } = await fetchApi<{
      success: boolean;
      data: Followup[];
      contagem: Contagem;
    }>(`/api/followups?${params.toString()}`);

    if (error) {
      setError(error);
    } else if (response?.success) {
      setFollowups(response.data);
      setContagem(response.contagem);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [fetchApi, filtro]);

  // Carregar métricas (em paralelo, não bloqueante)
  const loadMetrics = useCallback(async () => {
    const { data: response } = await fetchApi<{
      success: boolean;
      data: Metrics;
    }>('/api/followups/metrics');
    if (response?.success) {
      setMetrics(response.data);
    }
  }, [fetchApi]);

  // Abrir modal com mensagem do follow-up
  const verMensagem = async (followupId: number) => {
    setLoadingMensagem(followupId);
    const { data: response, error } = await fetchApi<{
      success: boolean;
      data: MensagemDetalhe;
    }>(`/api/followups/${followupId}/mensagem`);
    setLoadingMensagem(null);
    if (error) {
      setError(error);
    } else if (response?.success) {
      setMensagemModal(response.data);
    }
  };

  // Carregar ao montar
  useEffect(() => {
    loadFollowups();
    loadMetrics();
  }, [loadFollowups, loadMetrics]);

  // Concluir follow-up
  const concluirFollowup = async (id: number) => {
    const { error } = await fetchApi(`/api/followups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ acao: 'concluir' }),
    });

    if (error) {
      setError(error);
    } else {
      loadFollowups();
      loadMetrics();
    }
  };

  // Cancelar follow-up
  const cancelarFollowup = async (id: number) => {
    if (!confirm('Cancelar este follow-up?')) return;

    const { error } = await fetchApi(`/api/followups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ acao: 'cancelar' }),
    });

    if (error) {
      setError(error);
    } else {
      loadFollowups();
      loadMetrics();
    }
  };

  // Abrir chat
  const abrirChat = (leadId: number) => {
    router.push(`/chat/${leadId}`);
  };

  // Formatar data
  const formatarData = (data: string) => {
    return format(new Date(data + 'T12:00:00'), "dd 'de' MMM", { locale: ptBR });
  };

  // Badge de situação
  const getSituacaoBadge = (situacao: string) => {
    switch (situacao) {
      case 'atrasado':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <AlertCircle className="w-3 h-3" />
            Atrasado
          </span>
        );
      case 'hoje':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            <Clock className="w-3 h-3" />
            Hoje
          </span>
        );
      case 'futuro':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <Calendar className="w-3 h-3" />
            {formatarData(followups.find(f => f.situacao === situacao)?.data_agendada || '')}
          </span>
        );
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

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="w-7 h-7 text-blue-600" />
            Follow-ups
          </h1>
          <p className="text-gray-600">Acompanhamento de leads pendentes</p>
        </div>

        <button
          onClick={loadFollowups}
          disabled={isRefreshing}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={clsx('w-4 h-4', isRefreshing && 'animate-spin')} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="card mb-4 p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Métricas Tatiane (inteligência artificial enviando follow-ups) */}
      {metrics && (
        <div className="card mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900">Tatiane IA — Follow-ups automáticos</h3>
            </div>
            {metrics.ultimo_envio && (
              <span className="text-xs text-gray-600">
                Último envio: {safeFormatDistanceToNow(metrics.ultimo_envio, { locale: ptBR, addSuffix: true })}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide">Enviados 24h</p>
              <p className="text-2xl font-bold text-purple-700">{metrics.enviados.ultimas_24h}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide">Enviados 7 dias</p>
              <p className="text-2xl font-bold text-purple-700">{metrics.enviados.ultimos_7d}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide">Taxa resposta 7d</p>
              <p className="text-2xl font-bold text-blue-700">
                {metrics.taxa_resposta.ultimos_7d}%
                <span className="text-xs font-normal text-gray-500 ml-1">
                  ({metrics.taxa_resposta.respondidos_7d} respostas)
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 uppercase tracking-wide">Taxa resposta 30d</p>
              <p className="text-2xl font-bold text-blue-700">
                {metrics.taxa_resposta.ultimos_30d}%
                <span className="text-xs font-normal text-gray-500 ml-1">
                  ({metrics.taxa_resposta.respondidos_30d} de {metrics.enviados.ultimos_30d})
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cards de contagem */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <button
          onClick={() => setFiltro('atrasado')}
          className={clsx(
            'card p-4 text-left transition-all',
            filtro === 'atrasado' ? 'ring-2 ring-red-500' : 'hover:shadow-md'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{contagem.atrasados}</p>
              <p className="text-sm text-gray-500">Atrasados</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setFiltro('hoje')}
          className={clsx(
            'card p-4 text-left transition-all',
            filtro === 'hoje' ? 'ring-2 ring-yellow-500' : 'hover:shadow-md'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-600">{contagem.hoje}</p>
              <p className="text-sm text-gray-500">Hoje</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setFiltro('futuro')}
          className={clsx(
            'card p-4 text-left transition-all',
            filtro === 'futuro' ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{contagem.futuro}</p>
              <p className="text-sm text-gray-500">Próximos</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setFiltro('todos')}
          className={clsx(
            'card p-4 text-left transition-all',
            filtro === 'todos' ? 'ring-2 ring-gray-500' : 'hover:shadow-md'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-600">{contagem.total}</p>
              <p className="text-sm text-gray-500">Pendentes</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setFiltro('concluido')}
          className={clsx(
            'card p-4 text-left transition-all',
            filtro === 'concluido' ? 'ring-2 ring-green-500' : 'hover:shadow-md'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{metrics?.enviados.ultimos_7d ?? '—'}</p>
              <p className="text-sm text-gray-500">Concluídos 7d</p>
            </div>
          </div>
        </button>
      </div>

      {/* Lista de follow-ups */}
      <div className="space-y-3">
        {followups.length === 0 ? (
          <div className="card p-8 text-center">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Nenhum follow-up pendente</p>
            <p className="text-sm text-gray-400 mt-1">
              Os follow-ups são criados automaticamente quando você acessa esta página
            </p>
          </div>
        ) : (
          followups.map((followup) => (
            <div
              key={followup.id}
              className={clsx(
                'card p-4 border-l-4',
                followup.situacao === 'atrasado' && 'border-l-red-500 bg-red-50/50',
                followup.situacao === 'hoje' && 'border-l-yellow-500 bg-yellow-50/50',
                followup.situacao === 'futuro' && 'border-l-blue-500'
              )}
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-gray-600" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">
                      {followup.dados_cliente?.nomewpp || 'Sem nome'}
                    </span>
                    {getSituacaoBadge(followup.situacao)}
                    {followup.tipo === 'automatico' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                        <Zap className="w-3 h-3" />
                        Auto
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {formatPhone(followup.dados_cliente?.telefone || '')}
                    </span>
                    {followup.dados_cliente?.regiao && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {followup.dados_cliente.regiao}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatarData(followup.data_agendada)}
                    </span>
                  </div>

                  {/* Motivo */}
                  <p className="text-sm text-gray-700 font-medium">
                    📋 {followup.motivo}
                  </p>

                  {/* Notas */}
                  {followup.notas && (
                    <p className="text-sm text-gray-500 mt-1">
                      💬 {followup.notas}
                    </p>
                  )}

                  {/* Sequência */}
                  {followup.sequencia > 1 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {followup.sequencia}º follow-up
                    </p>
                  )}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => abrirChat(followup.lead_id)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Abrir chat"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </button>

                  {followup.status === 'concluido' ? (
                    <button
                      onClick={() => verMensagem(followup.id)}
                      disabled={loadingMensagem === followup.id}
                      className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Ver mensagem enviada"
                    >
                      {loadingMensagem === followup.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => concluirFollowup(followup.id)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Concluir"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => cancelarFollowup(followup.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Cancelar"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => abrirChat(followup.lead_id)}
                    className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de visualização da mensagem */}
      {mensagemModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setMensagemModal(null)}
        >
          <div
            className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                Mensagem enviada pela Tatiane
              </h3>
              <button
                onClick={() => setMensagemModal(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <XCircle className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Lead */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Lead</p>
                <p className="font-medium text-gray-900">{mensagemModal.nome_lead || 'Sem nome'}</p>
                <p className="text-sm text-gray-600">{mensagemModal.telefone}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Stage atual: <span className="font-medium">{mensagemModal.stage_atual}</span>
                </p>
              </div>

              {/* Motivo */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Motivo</p>
                <p className="text-sm text-gray-700">{mensagemModal.motivo}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Tipo: {mensagemModal.tipo}
                  {mensagemModal.sequencia > 1 && ` • ${mensagemModal.sequencia}ª tentativa`}
                </p>
              </div>

              {/* Mensagem */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Enviada {safeFormatDistanceToNow(mensagemModal.enviado_em, { locale: ptBR, addSuffix: true })}
                </p>
                <div className="bg-purple-50 border-l-4 border-purple-400 rounded p-3">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {mensagemModal.mensagem_enviada || mensagemModal.mensagem_planejada || (
                      <em className="text-gray-400">Mensagem não disponível no histórico</em>
                    )}
                  </p>
                </div>
              </div>

              {/* Resposta */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Resposta do lead</p>
                {mensagemModal.respondeu ? (
                  <div className="bg-green-50 border-l-4 border-green-400 rounded p-3 text-sm">
                    <p className="text-green-800 font-medium">
                      ✓ Lead respondeu em {mensagemModal.tempo_resposta_horas}h
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      {mensagemModal.respondeu_em && safeFormat(mensagemModal.respondeu_em, "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-50 border-l-4 border-gray-300 rounded p-3 text-sm">
                    <p className="text-gray-600">Sem resposta nas primeiras 48h</p>
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => {
                    abrirChat(mensagemModal.lead_id);
                    setMensagemModal(null);
                  }}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Abrir conversa
                </button>
                <button
                  onClick={() => setMensagemModal(null)}
                  className="btn-secondary"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FollowupsPage() {
  return (
    <AuthLayout>
      <FollowupsContent />
    </AuthLayout>
  );
}
