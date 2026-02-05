'use client';

// ===========================================
// Página Profissionais Ativos
// Lista profissionais da planilha com filtros de período
// ===========================================

import { useState, useEffect, useCallback } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { useApi } from '@/lib/hooks';
import { formatPhone } from '@/lib/auth-client';
import {
  Users,
  RefreshCw,
  Loader2,
  AlertCircle,
  MapPin,
  Calendar,
  Phone,
  Hash,
  User,
  UserCheck,
  Download,
  Filter,
  Search,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';

interface Profissional {
  codigo: string;
  nome: string;
  telefone: string;
  regiao: string;
  dataAtivacao: string;
  quemAtivou: string;
}

interface Estatisticas {
  total: number;
  porRegiao: Record<string, number>;
  porAtivador: Record<string, number>;
}

function ProfissionaisContent() {
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [profissionaisFiltrados, setProfissionaisFiltrados] = useState<Profissional[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [periodoInicio, setPeriodoInicio] = useState(() => 
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [periodoFim, setPeriodoFim] = useState(() => 
    format(endOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [regiaoFiltro, setRegiaoFiltro] = useState('');
  const [ativadorFiltro, setAtivadorFiltro] = useState('');
  const [busca, setBusca] = useState('');
  
  // Listas para filtros
  const [regioes, setRegioes] = useState<string[]>([]);
  const [ativadores, setAtivadores] = useState<string[]>([]);

  const { fetchApi } = useApi();

  // Carregar dados da planilha
  const loadProfissionais = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    const { data: response, error } = await fetchApi<{
      success: boolean;
      data: Profissional[];
      estatisticas: Estatisticas;
      regioes: string[];
      ativadores: string[];
    }>('/api/profissionais');

    if (error) {
      setError(error);
    } else if (response?.success) {
      setProfissionais(response.data);
      setRegioes(response.regioes);
      setAtivadores(response.ativadores);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [fetchApi]);

  useEffect(() => {
    loadProfissionais();
  }, [loadProfissionais]);

  // Parser de data no formato brasileiro (DD/MM/YYYY)
  const parseDataBR = (dataStr: string): Date | null => {
    if (!dataStr) return null;
    const partes = dataStr.split('/');
    if (partes.length === 3) {
      return new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
    }
    return null;
  };

  // Aplicar filtros localmente
  useEffect(() => {
    let filtrados = [...profissionais];

    // Filtro de período
    if (periodoInicio || periodoFim) {
      filtrados = filtrados.filter(p => {
        const data = parseDataBR(p.dataAtivacao);
        if (!data) return false;
        
        if (periodoInicio) {
          const inicio = new Date(periodoInicio + 'T00:00:00');
          if (data < inicio) return false;
        }
        
        if (periodoFim) {
          const fim = new Date(periodoFim + 'T23:59:59');
          if (data > fim) return false;
        }
        
        return true;
      });
    }

    // Filtro de região
    if (regiaoFiltro) {
      filtrados = filtrados.filter(p => 
        p.regiao?.toUpperCase() === regiaoFiltro.toUpperCase()
      );
    }

    // Filtro de ativador
    if (ativadorFiltro) {
      filtrados = filtrados.filter(p => 
        p.quemAtivou?.toLowerCase() === ativadorFiltro.toLowerCase()
      );
    }

    // Busca por nome, código ou telefone
    if (busca) {
      const termoBusca = busca.toLowerCase();
      filtrados = filtrados.filter(p => 
        p.nome?.toLowerCase().includes(termoBusca) ||
        p.codigo?.toLowerCase().includes(termoBusca) ||
        p.telefone?.includes(termoBusca)
      );
    }

    // Ordenar por data de ativação (mais recente primeiro)
    filtrados.sort((a, b) => {
      const dataA = parseDataBR(a.dataAtivacao);
      const dataB = parseDataBR(b.dataAtivacao);
      if (!dataA) return 1;
      if (!dataB) return -1;
      return dataB.getTime() - dataA.getTime();
    });

    setProfissionaisFiltrados(filtrados);
  }, [profissionais, periodoInicio, periodoFim, regiaoFiltro, ativadorFiltro, busca]);

  // Atalhos de período
  const setPeriodoMesAtual = () => {
    setPeriodoInicio(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setPeriodoFim(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  };

  const setPeriodoMesAnterior = () => {
    const mesAnterior = subMonths(new Date(), 1);
    setPeriodoInicio(format(startOfMonth(mesAnterior), 'yyyy-MM-dd'));
    setPeriodoFim(format(endOfMonth(mesAnterior), 'yyyy-MM-dd'));
  };

  const setPeriodoTodos = () => {
    setPeriodoInicio('');
    setPeriodoFim('');
  };

  // Exportar para CSV
  const exportarCSV = () => {
    const headers = ['Código', 'Nome', 'Telefone', 'Região', 'Data Ativação', 'Quem Ativou'];
    const rows = profissionaisFiltrados.map(p => [
      p.codigo,
      p.nome,
      p.telefone,
      p.regiao,
      p.dataAtivacao,
      p.quemAtivou,
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `profissionais-ativos-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  // Estatísticas filtradas
  const estatisticasFiltradas = {
    total: profissionaisFiltrados.length,
    porRegiao: profissionaisFiltrados.reduce((acc, p) => {
      const regiao = p.regiao || 'Sem região';
      acc[regiao] = (acc[regiao] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    porAtivador: profissionaisFiltrados.reduce((acc, p) => {
      const ativador = p.quemAtivou || 'Sem info';
      acc[ativador] = (acc[ativador] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
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
            <Users className="w-7 h-7 text-green-600" />
            Profissionais Ativos
          </h1>
          <p className="text-gray-600">Profissionais ativados no período selecionado</p>
        </div>

        <button
          onClick={exportarCSV}
          disabled={profissionaisFiltrados.length === 0}
          className="btn-secondary flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>

        <button
          onClick={loadProfissionais}
          disabled={isRefreshing}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw className={clsx('w-4 h-4', isRefreshing && 'animate-spin')} />
          Atualizar
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

      {/* Filtros */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-700">Filtros</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Período */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Início
            </label>
            <input
              type="date"
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Fim
            </label>
            <input
              type="date"
              value={periodoFim}
              onChange={(e) => setPeriodoFim(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Região */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Região
            </label>
            <select
              value={regiaoFiltro}
              onChange={(e) => setRegiaoFiltro(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todas</option>
              {regioes.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Quem Ativou */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quem Ativou
            </label>
            <select
              value={ativadorFiltro}
              onChange={(e) => setAtivadorFiltro(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos</option>
              {ativadores.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Atalhos de período + Busca */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className="text-sm text-gray-500">Atalhos:</span>
          <button
            onClick={setPeriodoMesAtual}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
          >
            Mês Atual
          </button>
          <button
            onClick={setPeriodoMesAnterior}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
          >
            Mês Anterior
          </button>
          <button
            onClick={setPeriodoTodos}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
          >
            Todos
          </button>

          <div className="flex-1" />

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar nome, código ou telefone..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
            />
          </div>
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{estatisticasFiltradas.total}</p>
              <p className="text-sm text-gray-500">Total no Período</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {Object.keys(estatisticasFiltradas.porRegiao).length}
              </p>
              <p className="text-sm text-gray-500">Regiões</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">
                {Object.keys(estatisticasFiltradas.porAtivador).length}
              </p>
              <p className="text-sm text-gray-500">Ativadores</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-600">
                {periodoInicio ? format(new Date(periodoInicio + 'T12:00:00'), 'dd/MM', { locale: ptBR }) : '---'}
                {' - '}
                {periodoFim ? format(new Date(periodoFim + 'T12:00:00'), 'dd/MM', { locale: ptBR }) : '---'}
              </p>
              <p className="text-sm text-gray-500">Período</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mini cards por região e ativador */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Por Região */}
        <div className="card p-4">
          <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Por Região
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(estatisticasFiltradas.porRegiao)
              .sort((a, b) => b[1] - a[1])
              .map(([regiao, qtd]) => (
                <span
                  key={regiao}
                  onClick={() => setRegiaoFiltro(regiaoFiltro === regiao ? '' : regiao)}
                  className={clsx(
                    'px-3 py-1 rounded-full text-sm cursor-pointer transition-colors',
                    regiaoFiltro === regiao 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  )}
                >
                  {regiao}: <strong>{qtd}</strong>
                </span>
              ))}
          </div>
        </div>

        {/* Por Ativador */}
        <div className="card p-4">
          <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
            <UserCheck className="w-4 h-4" />
            Por Quem Ativou
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(estatisticasFiltradas.porAtivador)
              .sort((a, b) => b[1] - a[1])
              .map(([ativador, qtd]) => (
                <span
                  key={ativador}
                  onClick={() => setAtivadorFiltro(ativadorFiltro === ativador ? '' : ativador)}
                  className={clsx(
                    'px-3 py-1 rounded-full text-sm cursor-pointer transition-colors',
                    ativadorFiltro === ativador 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                  )}
                >
                  {ativador}: <strong>{qtd}</strong>
                </span>
              ))}
          </div>
        </div>
      </div>

      {/* Tabela de Profissionais */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <Hash className="w-3 h-3" />
                    Código
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    Nome
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    Telefone
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    Região
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Data Ativação
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    Quem Ativou
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {profissionaisFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>Nenhum profissional encontrado no período</p>
                  </td>
                </tr>
              ) : (
                profissionaisFiltrados.map((prof, index) => (
                  <tr key={`${prof.codigo}-${index}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                        {prof.codigo || '---'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">
                        {prof.nome || 'Sem nome'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatPhone(prof.telefone)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                        {prof.regiao || 'Sem região'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {prof.dataAtivacao || '---'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                        {prof.quemAtivou || 'Sem info'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ProfissionaisPage() {
  return (
    <AuthLayout>
      <ProfissionaisContent />
    </AuthLayout>
  );
}
