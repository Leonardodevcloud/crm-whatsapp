'use client';

// ===========================================
// Página Analytics - Dashboard de Métricas
// Inclui: Lead Morto, Taxa de Perda, Ressuscitados
// ===========================================

import { useState, useEffect, useCallback } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { useApi } from '@/lib/hooks';
import {
  Users,
  UserCheck,
  Star,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  AlertCircle,
  MapPin,
  Calendar,
  Clock,
  UserPlus,
  Bot,
  BarChart3,
  PieChart,
  Skull,
  Sparkles,
  Truck,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';

interface AnalyticsData {
  kpis: {
    total: number;
    novos: number;
    qualificados: number;
    finalizados: number;
    mortos: number;
    ressuscitados: number;
    taxaConversao: number;
    taxaPerda: number;
  };
  funil: Array<{ stage: string; quantidade: number; cor: string }>;
  porRegiao: Array<{ regiao: string; quantidade: number }>;
  topRegioes: Array<{ regiao: string; total: number; finalizados: number; mortos: number; taxaConversao: number; taxaPerda: number }>;
  porIniciador: {
    lead: { total: number; finalizados: number; mortos: number; taxaConversao: number; taxaPerda: number };
    humano: { total: number; finalizados: number; mortos: number; taxaConversao: number; taxaPerda: number };
  };
  porDia: Array<{ data: string; quantidade: number }>;
  tempoMedio: { finalizacaoHoras: number; finalizacaoDias: number };
  ressuscitados: { total: number; leads: any[] };
  filtros: { periodo: number; regiao: string };
}

// Interface para dados de operação do BI
interface OperacaoData {
  total: number;
  em_operacao: number;
  nao_operando: number;
  taxa_conversao: string;
  bi_conectado: boolean;
  leads: Array<{
    id: number;
    nomewpp: string;
    telefone: string;
    cod_profissional: string;
    regiao: string;
    em_operacao: boolean;
    bi_dados?: {
      total_entregas: number;
      ultima_entrega: string;
    };
  }>;
}

function AnalyticsContent() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [periodo, setPeriodo] = useState('30');
  const [regiao, setRegiao] = useState('');
  const [regioes, setRegioes] = useState<string[]>([]);
  
  // Estado para dados de operação do BI
  const [operacaoData, setOperacaoData] = useState<OperacaoData | null>(null);
  const [isLoadingOperacao, setIsLoadingOperacao] = useState(false);

  const { fetchApi } = useApi();

  useEffect(() => {
    const loadRegioes = async () => {
      const { data } = await fetchApi<{ success: boolean; data: string[] }>('/api/regioes');
      if (data?.success) setRegioes(data.data);
    };
    loadRegioes();
  }, [fetchApi]);

  // Função para carregar dados de operação do BI
  const loadOperacao = async () => {
    setIsLoadingOperacao(true);
    try {
      const params = new URLSearchParams();
      params.set('dias', periodo);
      if (regiao) params.set('regiao', regiao);
      
      const { data: response } = await fetchApi<OperacaoData & { success: boolean }>(
        `/api/verificar-operacao?${params.toString()}`
      );
      if (response?.success) {
        setOperacaoData(response);
      }
    } catch (err) {
      console.error('Erro ao carregar operação:', err);
    }
    setIsLoadingOperacao(false);
  };

  // Limpar dados de operação quando filtros mudarem
  useEffect(() => {
    setOperacaoData(null);
  }, [periodo, regiao]);

  useEffect(() => {
    const loadRegioes = async () => {
      const { data } = await fetchApi<{ success: boolean; data: string[] }>('/api/regioes');
      if (data?.success) setRegioes(data.data);
    };
    loadRegioes();
  }, [fetchApi]);

  const loadAnalytics = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('periodo', periodo);
    if (regiao) params.set('regiao', regiao);

    const { data: response, error } = await fetchApi<{ success: boolean; data: AnalyticsData }>(
      `/api/analytics?${params.toString()}`
    );

    if (error) setError(error);
    else if (response?.success) setData(response.data);

    setIsLoading(false);
    setIsRefreshing(false);
  }, [fetchApi, periodo, regiao]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const getBarWidth = (value: number, max: number) => {
    if (max === 0) return 0;
    return Math.max(5, (value / max) * 100);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const maxFunil = data ? Math.max(...data.funil.map(f => f.quantidade)) : 0;
  const maxRegiao = data?.topRegioes?.[0]?.finalizados || 0;

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-blue-600" />
            Analytics
          </h1>
          <p className="text-gray-600">Métricas e indicadores do CRM</p>
        </div>

        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="input pl-10 pr-8 appearance-none cursor-pointer min-w-[140px]"
          >
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="365">Último ano</option>
          </select>
        </div>

        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <select
            value={regiao}
            onChange={(e) => setRegiao(e.target.value)}
            className="input pl-10 pr-8 appearance-none cursor-pointer min-w-[160px]"
          >
            <option value="">Todas as regiões</option>
            {regioes.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <button
          onClick={loadAnalytics}
          disabled={isRefreshing}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={clsx('w-4 h-4', isRefreshing && 'animate-spin')} />
          <span>Atualizar</span>
        </button>
      </div>

      {error && (
        <div className="card mb-4 p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {data && (
        <>
          {/* KPIs Cards - 6 cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
            {/* Total */}
            <div className="card p-4 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total</p>
                  <p className="text-xl font-bold text-gray-900">{data.kpis.total}</p>
                </div>
              </div>
            </div>

            {/* Novos */}
            <div className="card p-4 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Novos</p>
                  <p className="text-xl font-bold text-gray-900">{data.kpis.novos}</p>
                </div>
              </div>
            </div>

            {/* Qualificados */}
            <div className="card p-4 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                  <Star className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Qualificados</p>
                  <p className="text-xl font-bold text-gray-900">{data.kpis.qualificados}</p>
                </div>
              </div>
            </div>

            {/* Finalizados */}
            <div className="card p-4 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Finalizados</p>
                  <p className="text-xl font-bold text-green-600">{data.kpis.finalizados}</p>
                  <p className="text-xs text-green-600">{data.kpis.taxaConversao}% conversão</p>
                </div>
              </div>
            </div>

            {/* Mortos */}
            <div className="card p-4 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                  <Skull className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Mortos</p>
                  <p className="text-xl font-bold text-gray-600">{data.kpis.mortos}</p>
                  <p className="text-xs text-red-600">{data.kpis.taxaPerda}% perda</p>
                </div>
              </div>
            </div>

            {/* Ressuscitados */}
            <div className="card p-4 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Ressuscitados</p>
                  <p className="text-xl font-bold text-purple-600">{data.kpis.ressuscitados}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card de Conversão em Operação - Integração BI */}
          <div className="card p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-600" />
                Conversão em Operação
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">BI Tutts</span>
              </h3>
              <button
                onClick={loadOperacao}
                disabled={isLoadingOperacao}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                {isLoadingOperacao ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Verificar no BI
              </button>
            </div>

            {!operacaoData ? (
              <div className="text-center py-6 text-gray-500">
                <Truck className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Clique em "Verificar no BI" para ver quantos leads finalizados estão em operação</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* KPIs de Operação */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white rounded-xl p-3 border border-gray-200">
                    <p className="text-sm text-gray-500">Leads Finalizados</p>
                    <p className="text-2xl font-bold text-gray-900">{operacaoData.total}</p>
                    <p className="text-xs text-gray-400">com código profissional</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-emerald-200">
                    <p className="text-sm text-gray-500">Em Operação</p>
                    <p className="text-2xl font-bold text-emerald-600">{operacaoData.em_operacao}</p>
                    <p className="text-xs text-emerald-500 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Fazendo entregas
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-red-200">
                    <p className="text-sm text-gray-500">Não Operando</p>
                    <p className="text-2xl font-bold text-red-500">{operacaoData.nao_operando}</p>
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <XCircle className="w-3 h-3" />
                      Sem entregas
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-blue-200">
                    <p className="text-sm text-gray-500">Taxa Real</p>
                    <p className="text-2xl font-bold text-blue-600">{operacaoData.taxa_conversao}</p>
                    <p className="text-xs text-blue-400">de conversão efetiva</p>
                  </div>
                </div>

                {/* Barra de progresso */}
                <div className="bg-white rounded-xl p-3 border border-gray-200">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Taxa de Operação</span>
                    <span className="font-medium text-emerald-600">{operacaoData.taxa_conversao}</span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${(operacaoData.em_operacao / Math.max(operacaoData.total, 1)) * 100}%` }}
                    />
                    <div 
                      className="h-full bg-red-400 transition-all duration-500"
                      style={{ width: `${(operacaoData.nao_operando / Math.max(operacaoData.total, 1)) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-1 text-gray-400">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                      Em operação
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                      Não operando
                    </span>
                  </div>
                </div>

                {/* Status da conexão */}
                <div className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
                  <span className={clsx(
                    'w-2 h-2 rounded-full',
                    operacaoData.bi_conectado ? 'bg-green-500' : 'bg-red-500'
                  )}></span>
                  {operacaoData.bi_conectado ? 'Conectado ao BI Tutts' : 'BI não conectado'}
                  <span className="mx-2">•</span>
                  Últimos {periodo} dias
                  {regiao && (
                    <>
                      <span className="mx-2">•</span>
                      <span className="text-blue-500 font-medium">{regiao}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Funil + Região */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Funil de Conversão */}
            <div className="card p-4 bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Funil de Conversão
              </h3>
              <div className="space-y-3">
                {data.funil.map((item) => (
                  <div key={item.stage}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{item.stage}</span>
                      <span className="font-medium">{item.quantidade}</span>
                    </div>
                    <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
                      <div
                        className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
                        style={{
                          width: `${getBarWidth(item.quantidade, maxFunil)}%`,
                          backgroundColor: item.cor,
                        }}
                      >
                        {item.quantidade > 0 && (
                          <span className="text-white text-xs font-medium">
                            {data.kpis.total > 0 ? Math.round((item.quantidade / data.kpis.total) * 100) : 0}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Leads por Região */}
            <div className="card p-4 bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-purple-600" />
                Leads por Região
              </h3>
              {data.porRegiao.length > 0 ? (
                <div className="space-y-2">
                  {data.porRegiao.slice(0, 6).map((item, index) => {
                    const cores = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];
                    const maxQtd = data.porRegiao[0]?.quantidade || 1;
                    return (
                      <div key={item.regiao} className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${cores[index % cores.length]}`} />
                        <span className="flex-1 text-sm text-gray-700 truncate">{item.regiao}</span>
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${cores[index % cores.length]}`}
                            style={{ width: `${(item.quantidade / maxQtd) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900 w-8 text-right">{item.quantidade}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">Nenhum dado disponível</p>
              )}
            </div>
          </div>

          {/* Top Regiões + Iniciador */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Top Regiões por Conversão */}
            <div className="card p-4 bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-green-600" />
                Top Regiões (Conversão vs Perda)
              </h3>
              {data.topRegioes.length > 0 ? (
                <div className="space-y-3">
                  {data.topRegioes.map((item, index) => (
                    <div key={item.regiao} className="flex items-center gap-3">
                      <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">
                        {index + 1}
                      </span>
                      <span className="flex-1 text-sm text-gray-700 truncate">{item.regiao}</span>
                      <div className="flex gap-2 text-xs">
                        <span className="text-green-600 font-medium">{item.taxaConversao}% ✓</span>
                        <span className="text-gray-400">|</span>
                        <span className="text-red-600 font-medium">{item.taxaPerda}% ✗</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">Nenhum dado disponível</p>
              )}
            </div>

            {/* Humano vs Lead */}
            <div className="card p-4 bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-orange-600" />
                Lead vs Humano
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-blue-600" />
                      <span className="text-sm text-gray-700">Por Lead</span>
                    </div>
                    <span className="text-sm font-medium">{data.porIniciador.lead.total} leads</span>
                  </div>
                  <div className="flex gap-2 text-xs mb-1">
                    <span className="text-green-600">✓ {data.porIniciador.lead.taxaConversao}% conv.</span>
                    <span className="text-red-600">✗ {data.porIniciador.lead.taxaPerda}% perda</span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-green-500"
                      style={{ width: `${data.porIniciador.lead.taxaConversao}%` }}
                    />
                    <div
                      className="h-full bg-red-400"
                      style={{ width: `${data.porIniciador.lead.taxaPerda}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-orange-600" />
                      <span className="text-sm text-gray-700">Por Humano</span>
                    </div>
                    <span className="text-sm font-medium">{data.porIniciador.humano.total} leads</span>
                  </div>
                  <div className="flex gap-2 text-xs mb-1">
                    <span className="text-green-600">✓ {data.porIniciador.humano.taxaConversao}% conv.</span>
                    <span className="text-red-600">✗ {data.porIniciador.humano.taxaPerda}% perda</span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-green-500"
                      style={{ width: `${data.porIniciador.humano.taxaConversao}%` }}
                    />
                    <div
                      className="h-full bg-red-400"
                      style={{ width: `${data.porIniciador.humano.taxaPerda}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tempo Médio + Leads por Dia */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tempo Médio */}
            <div className="card p-4 bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                Tempo Médio até Finalização
              </h3>
              <div className="flex items-center justify-center gap-8 py-4">
                <div className="text-center">
                  <p className="text-4xl font-bold text-indigo-600">{data.tempoMedio.finalizacaoHoras}</p>
                  <p className="text-sm text-gray-500">horas</p>
                </div>
                <div className="text-gray-300 text-2xl">=</div>
                <div className="text-center">
                  <p className="text-4xl font-bold text-indigo-600">{data.tempoMedio.finalizacaoDias}</p>
                  <p className="text-sm text-gray-500">dias</p>
                </div>
              </div>
            </div>

            {/* Leads por Dia */}
            <div className="card p-4 bg-white">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal-600" />
                Leads nos Últimos 7 Dias
              </h3>
              <div className="flex items-end justify-between gap-2 h-32">
                {data.porDia.map((item) => {
                  const maxDia = Math.max(...data.porDia.map(d => d.quantidade), 1);
                  const height = (item.quantidade / maxDia) * 100;
                  return (
                    <div key={item.data} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-medium text-gray-700">{item.quantidade}</span>
                      <div
                        className="w-full bg-teal-500 rounded-t-md transition-all duration-300"
                        style={{ height: `${Math.max(height, 5)}%` }}
                      />
                      <span className="text-xs text-gray-500">{formatDate(item.data)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <AuthLayout>
      <AnalyticsContent />
    </AuthLayout>
  );
}
