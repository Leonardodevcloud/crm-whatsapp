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
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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

function FollowupsContent() {
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [contagem, setContagem] = useState<Contagem>({ atrasados: 0, hoje: 0, futuro: 0, total: 0 });
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

  // Carregar ao montar
  useEffect(() => {
    loadFollowups();
  }, [loadFollowups]);

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

      {/* Cards de contagem */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
              <p className="text-sm text-gray-500">Total</p>
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

export default function FollowupsPage() {
  return (
    <AuthLayout>
      <FollowupsContent />
    </AuthLayout>
  );
}
