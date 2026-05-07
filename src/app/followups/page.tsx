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
  Send,
  Activity,
  Sparkles,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';

// Helpers de data seguros
function parseDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  let s = String(value);
  if (s.includes(' ') && !s.includes('T')) {
    s = s.replace(' ', 'T');
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function safeFormatDistanceToNow(value: any, opts?: any): string {
  const d = parseDateSafe(value);
  if (!d) return '—';
  try {
    return formatDistanceToNow(d, { locale: ptBR, addSuffix: true, ...opts });
  } catch {
    return '—';
  }
}
function safeFormatTime(value: any): string {
  const d = parseDateSafe(value);
  if (!d) return '—';
  try {
    return format(d, 'HH:mm', { locale: ptBR });
  } catch {
    return '—';
  }
}

interface WorkerStatus {
  total_pendentes: number;
  atrasados: number;
  enviados_hoje: number;
  prox_7_dias: number;
  ultima_rodada: { inicio: string; enviados: number; pulou_janela?: boolean } | null;
  proxima_rodada: string;
  ultimo_envio: string | null;
  enviados_24h: number;
  enviados_7d: number;
  taxa_resposta_7d: { total: number; respondidos: number; taxa_pct: number };
  taxa_resposta_30d: { total: number; respondidos: number; taxa_pct: number };
  historico_rodadas: Array<{ inicio: string; enviados: number; pulou_janela?: boolean; falhas?: number }>;
  schedule: string;
}

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

function FollowupsContent() {
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [contagem, setContagem] = useState<Contagem>({ atrasados: 0, hoje: 0, futuro: 0, total: 0 });
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'atrasado' | 'hoje' | 'futuro'>('todos');

  const { fetchApi } = useApi();
  const router = useRouter();

  // Carregar follow-ups
  const loadFollowups = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    const params = new URLSearchParams();
    if (filtro !== 'todos') {
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

  // Carregar status do worker
  const loadWorkerStatus = useCallback(async () => {
    const { data: response } = await fetchApi<{
      success: boolean;
      data: WorkerStatus;
    }>('/api/followups/worker-status');

    if (response?.success) {
      setWorkerStatus(response.data);
    }
  }, [fetchApi]);

  // Carregar ao montar
  useEffect(() => {
    loadFollowups();
    loadWorkerStatus();
  }, [loadFollowups, loadWorkerStatus]);

  // Auto-refresh do worker status a cada 30s (mais rápido pra ver mudanças)
  useEffect(() => {
    const interval = setInterval(() => {
      loadWorkerStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadWorkerStatus]);

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
    }
  };

  // Abrir chat
  const abrirChat = (leadId: number) => {
    router.push(`/chat/${leadId}`);
  };

  // Formatar data (safe: retorna '—' se inválida)
  const formatarData = (data: string) => {
    if (!data) return '—';
    try {
      const d = parseDateSafe(data);
      if (!d) {
        // Tenta o formato YYYY-MM-DD adicionando hora
        const d2 = new Date(data + 'T12:00:00');
        if (isNaN(d2.getTime())) return '—';
        return format(d2, "dd 'de' MMM", { locale: ptBR });
      }
      return format(d, "dd 'de' MMM", { locale: ptBR });
    } catch {
      return '—';
    }
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
          onClick={() => { loadFollowups(); loadWorkerStatus(); }}
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

      {/* ═══════════════════════════════════════════════
          CARD TATIANE IA — Status do Worker (5 KPIs)
      ═══════════════════════════════════════════════ */}
      <div className="card mb-4 p-5 bg-gradient-to-br from-purple-50 via-white to-blue-50 border-purple-100">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h2 className="text-base font-semibold text-gray-900">Tatiane IA — Worker de Follow-ups</h2>
          </div>
          {workerStatus?.schedule && (
            <span className="text-xs text-gray-500 font-mono">{workerStatus.schedule}</span>
          )}
        </div>

        {workerStatus ? (
          <>
            {/* 5 KPIs em uma linha */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <KpiTatiane
                cor="purple"
                icone={<MessageCircle className="w-4 h-4" />}
                titulo="Total Pendentes"
                valor={workerStatus.total_pendentes.toLocaleString('pt-BR')}
                subtitulo={workerStatus.atrasados > 0 ? `⚠ ${workerStatus.atrasados} atrasados` : 'em dia'}
                subtituloCor={workerStatus.atrasados > 0 ? 'red' : 'green'}
              />
              <KpiTatiane
                cor="blue"
                icone={<Activity className="w-4 h-4" />}
                titulo="Última Rodada"
                valor={
                  workerStatus.ultima_rodada
                    ? `${workerStatus.ultima_rodada.enviados} env`
                    : '—'
                }
                subtitulo={
                  workerStatus.ultima_rodada
                    ? safeFormatDistanceToNow(workerStatus.ultima_rodada.inicio)
                    : 'sem rodada recente'
                }
              />
              <KpiTatiane
                cor="amber"
                icone={<Timer className="w-4 h-4" />}
                titulo="Próxima Rodada"
                valor={safeFormatTime(workerStatus.proxima_rodada)}
                subtitulo={safeFormatDistanceToNow(workerStatus.proxima_rodada)}
              />
              <KpiTatiane
                cor="green"
                icone={<Send className="w-4 h-4" />}
                titulo="Enviados 24h"
                valor={workerStatus.enviados_24h.toLocaleString('pt-BR')}
                subtitulo={`${workerStatus.enviados_7d} em 7 dias`}
              />
              <KpiTatiane
                cor="indigo"
                icone={<TrendingUp className="w-4 h-4" />}
                titulo="Taxa Resposta 7d"
                valor={`${workerStatus.taxa_resposta_7d.taxa_pct}%`}
                subtitulo={`${workerStatus.taxa_resposta_7d.respondidos}/${workerStatus.taxa_resposta_7d.total} responderam`}
              />
            </div>

            {/* Histórico das últimas rodadas */}
            {workerStatus.historico_rodadas.length > 0 && (
              <div className="mt-4 pt-4 border-t border-purple-100">
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                  Últimas {workerStatus.historico_rodadas.length} rodadas
                </p>
                <div className="flex flex-wrap gap-2">
                  {workerStatus.historico_rodadas.map((r, i) => {
                    const isFirst = i === 0;
                    const isJanela = r.pulou_janela;
                    const isVazia = !isJanela && r.enviados === 0;
                    const isErro = !isJanela && (r.falhas || 0) > 0;

                    let estilo = 'bg-gray-100 text-gray-700';
                    let label = `${r.enviados} env`;

                    if (isJanela) {
                      estilo = 'bg-amber-50 text-amber-700 border border-amber-200';
                      label = 'fora janela';
                    } else if (isErro) {
                      estilo = 'bg-red-50 text-red-700 border border-red-200';
                      label = `${r.enviados} env · ${r.falhas} falha${(r.falhas || 0) > 1 ? 's' : ''}`;
                    } else if (isVazia) {
                      estilo = 'bg-gray-50 text-gray-400 border border-gray-200';
                      label = '0 env';
                    } else if (isFirst) {
                      estilo = 'bg-purple-100 text-purple-900 font-semibold border border-purple-200';
                    }

                    return (
                      <div
                        key={i}
                        className={clsx(
                          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs',
                          estilo
                        )}
                      >
                        <span className="font-mono">{safeFormatTime(r.inicio)}</span>
                        <span className="opacity-50">·</span>
                        <span>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Carregando status do worker...
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════
          FILTROS DA LISTA (chips compactos)
      ═══════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">Filtrar:</span>
        <button
          onClick={() => setFiltro('todos')}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
            filtro === 'todos'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Todos
          <span className="ml-0.5 opacity-75">{contagem.total}</span>
        </button>
        <button
          onClick={() => setFiltro('atrasado')}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
            filtro === 'atrasado'
              ? 'bg-red-600 text-white'
              : 'bg-red-50 text-red-700 hover:bg-red-100'
          )}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          Atrasados
          <span className="ml-0.5 opacity-75">{contagem.atrasados}</span>
        </button>
        <button
          onClick={() => setFiltro('hoje')}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
            filtro === 'hoje'
              ? 'bg-yellow-600 text-white'
              : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          Hoje
          <span className="ml-0.5 opacity-75">{contagem.hoje}</span>
        </button>
        <button
          onClick={() => setFiltro('futuro')}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
            filtro === 'futuro'
              ? 'bg-blue-600 text-white'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          )}
        >
          <Calendar className="w-3.5 h-3.5" />
          Próximos
          <span className="ml-0.5 opacity-75">{contagem.futuro}</span>
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
    </div>
  );
}

// ═══════════════════════════════════════════════
// COMPONENTE: KpiTatiane (mini-card do worker)
// ═══════════════════════════════════════════════
function KpiTatiane({
  cor,
  icone,
  titulo,
  valor,
  subtitulo,
  subtituloCor,
}: {
  cor: 'purple' | 'blue' | 'green' | 'amber' | 'red' | 'indigo';
  icone: React.ReactNode;
  titulo: string;
  valor: string | number;
  subtitulo?: string;
  subtituloCor?: 'red' | 'green' | 'gray';
}) {
  const coresMap = {
    purple: { bg: 'bg-purple-100', text: 'text-purple-700', icon: 'text-purple-600' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-700', icon: 'text-blue-600' },
    green: { bg: 'bg-green-100', text: 'text-green-700', icon: 'text-green-600' },
    amber: { bg: 'bg-amber-100', text: 'text-amber-700', icon: 'text-amber-600' },
    red: { bg: 'bg-red-100', text: 'text-red-700', icon: 'text-red-600' },
    indigo: { bg: 'bg-indigo-100', text: 'text-indigo-700', icon: 'text-indigo-600' },
  };
  const c = coresMap[cor];
  const subColor = subtituloCor === 'red' ? 'text-red-600' : subtituloCor === 'green' ? 'text-green-600' : 'text-gray-500';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-600 uppercase tracking-wide font-medium leading-tight">
          {titulo}
        </span>
        <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', c.bg, c.icon)}>
          {icone}
        </div>
      </div>
      <p className={clsx('text-xl font-bold leading-tight', c.text)}>{valor}</p>
      {subtitulo && <p className={clsx('text-xs mt-0.5', subColor)}>{subtitulo}</p>}
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
