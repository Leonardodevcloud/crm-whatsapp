'use client';

// ===========================================
// Página Profissionais Ativos
// Lista profissionais da planilha com filtros + observações salvas no Supabase
// ===========================================

import { useState, useEffect, useCallback, useRef } from 'react';
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
  MessageSquare,
  Check,
  Clock,
  Save,
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

interface Observacao {
  observacao: string;
  updated_at: string;
  updated_by: string;
}

interface Estatisticas {
  total: number;
  porRegiao: Record<string, number>;
  porAtivador: Record<string, number>;
}

// ===========================================
// Componente de Observação Inline
// ===========================================
function ObservacaoCell({
  codigo,
  telefone,
  observacao,
  onSave,
}: {
  codigo: string;
  telefone: string;
  observacao: Observacao | null;
  onSave: (codigo: string, telefone: string, texto: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState(observacao?.observacao || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!isEditing) {
      setTexto(observacao?.observacao || '');
    }
  }, [observacao?.observacao, isEditing]);

  const handleSave = async () => {
    if (texto === (observacao?.observacao || '')) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onSave(codigo, telefone, texto);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Erro ao salvar:', e);
    } finally {
      setIsSaving(false);
      setIsEditing(false);
    }
  };

  const handleChange = (value: string) => {
    setTexto(value);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (value !== (observacao?.observacao || '')) {
        setIsSaving(true);
        try {
          await onSave(codigo, telefone, value);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        } catch (e) {
          console.error('Erro auto-save:', e);
        } finally {
          setIsSaving(false);
        }
      }
    }, 1500);
  };

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  const handleStartEdit = () => {
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return format(d, "dd/MM/yy 'às' HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  if (isEditing) {
    return (
      <div className="min-w-[280px]">
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setTexto(observacao?.observacao || ''); setIsEditing(false); }
          }}
          rows={4}
          className="w-full px-3 py-2 text-sm border-2 border-blue-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y bg-white"
          placeholder="Digite observações sobre este profissional..."
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-gray-400">
            {isSaving ? (
              <span className="flex items-center gap-1 text-blue-500"><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</span>
            ) : saved ? (
              <span className="flex items-center gap-1 text-green-500"><Check className="w-3 h-3" /> Salvo!</span>
            ) : 'Esc para cancelar'}
          </span>
          <button onClick={handleSave} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1">
            <Save className="w-3 h-3" /> Salvar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div onClick={handleStartEdit} className="min-w-[280px] cursor-pointer group">
      {texto ? (
        <div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed line-clamp-3 group-hover:text-blue-600 transition-colors">{texto}</p>
          {observacao?.updated_at && (
            <div className="flex items-center gap-1 mt-1.5">
              <Clock className="w-3 h-3 text-gray-400" />
              <span className="text-[11px] text-gray-400">
                {formatDate(observacao.updated_at)}
                {observacao.updated_by && ` · ${observacao.updated_by}`}
              </span>
            </div>
          )}
        </div>
      ) : (
        <span className="text-sm text-gray-300 italic group-hover:text-blue-400 transition-colors flex items-center gap-1">
          <MessageSquare className="w-3.5 h-3.5" /> Clique para adicionar...
        </span>
      )}
    </div>
  );
}

// ===========================================
// Componente Principal
// ===========================================
function ProfissionaisContent() {
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [profissionaisFiltrados, setProfissionaisFiltrados] = useState<Profissional[]>([]);
  const [observacoes, setObservacoes] = useState<Record<string, Observacao>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [periodoInicio, setPeriodoInicio] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [periodoFim, setPeriodoFim] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [regiaoFiltro, setRegiaoFiltro] = useState('');
  const [ativadorFiltro, setAtivadorFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [regioes, setRegioes] = useState<string[]>([]);
  const [ativadores, setAtivadores] = useState<string[]>([]);

  const { fetchApi } = useApi();

  const loadProfissionais = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    const { data: response, error } = await fetchApi<{ success: boolean; data: Profissional[]; estatisticas: Estatisticas; regioes: string[]; ativadores: string[] }>('/api/profissionais');
    if (error) { setError(error); }
    else if (response?.success) { setProfissionais(response.data); setRegioes(response.regioes); setAtivadores(response.ativadores); }
    setIsLoading(false);
    setIsRefreshing(false);
  }, [fetchApi]);

  const loadObservacoes = useCallback(async () => {
    const { data: response, error } = await fetchApi<{ success: boolean; data: Record<string, Observacao> }>('/api/profissionais/observacoes');
    if (!error && response?.success) { setObservacoes(response.data); }
  }, [fetchApi]);

  const salvarObservacao = async (codigo: string, telefone: string, texto: string) => {
    const { data: response, error } = await fetchApi<{ success: boolean; data: { codigo: string; observacao: string; updated_at: string; updated_by: string } }>('/api/profissionais/observacoes', { method: 'PUT', body: JSON.stringify({ codigo, telefone, observacao: texto }) });
    if (!error && response?.success) {
      setObservacoes(prev => ({ ...prev, [codigo]: { observacao: response.data.observacao, updated_at: response.data.updated_at, updated_by: response.data.updated_by } }));
    } else { throw new Error(error || 'Erro ao salvar'); }
  };

  useEffect(() => { loadProfissionais(); loadObservacoes(); }, [loadProfissionais, loadObservacoes]);

  const parseDataBR = (dataStr: string): Date | null => {
    if (!dataStr) return null;
    const partes = dataStr.split('/');
    if (partes.length === 3) return new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
    return null;
  };

  useEffect(() => {
    let filtrados = [...profissionais];
    if (periodoInicio || periodoFim) {
      filtrados = filtrados.filter(p => {
        const data = parseDataBR(p.dataAtivacao);
        if (!data) return false;
        if (periodoInicio) { const inicio = new Date(periodoInicio + 'T00:00:00'); if (data < inicio) return false; }
        if (periodoFim) { const fim = new Date(periodoFim + 'T23:59:59'); if (data > fim) return false; }
        return true;
      });
    }
    if (regiaoFiltro) filtrados = filtrados.filter(p => p.regiao?.toUpperCase() === regiaoFiltro.toUpperCase());
    if (ativadorFiltro) filtrados = filtrados.filter(p => p.quemAtivou?.toLowerCase() === ativadorFiltro.toLowerCase());
    if (busca) {
      const t = busca.toLowerCase();
      filtrados = filtrados.filter(p => p.nome?.toLowerCase().includes(t) || p.codigo?.toLowerCase().includes(t) || p.telefone?.includes(t) || observacoes[p.codigo]?.observacao?.toLowerCase().includes(t));
    }
    filtrados.sort((a, b) => { const dA = parseDataBR(a.dataAtivacao); const dB = parseDataBR(b.dataAtivacao); if (!dA) return 1; if (!dB) return -1; return dB.getTime() - dA.getTime(); });
    setProfissionaisFiltrados(filtrados);
  }, [profissionais, periodoInicio, periodoFim, regiaoFiltro, ativadorFiltro, busca, observacoes]);

  const setPeriodoMesAtual = () => { setPeriodoInicio(format(startOfMonth(new Date()), 'yyyy-MM-dd')); setPeriodoFim(format(endOfMonth(new Date()), 'yyyy-MM-dd')); };
  const setPeriodoMesAnterior = () => { const m = subMonths(new Date(), 1); setPeriodoInicio(format(startOfMonth(m), 'yyyy-MM-dd')); setPeriodoFim(format(endOfMonth(m), 'yyyy-MM-dd')); };
  const setPeriodoTodos = () => { setPeriodoInicio(''); setPeriodoFim(''); };

  const exportarCSV = () => {
    const headers = ['Código', 'Nome', 'Telefone', 'Região', 'Data Ativação', 'Quem Ativou', 'Observações', 'Última Edição Obs.'];
    const rows = profissionaisFiltrados.map(p => {
      const obs = observacoes[p.codigo];
      return [p.codigo, p.nome, p.telefone, p.regiao, p.dataAtivacao, p.quemAtivou, `"${(obs?.observacao || '').replace(/"/g, '""')}"`, obs?.updated_at ? new Date(obs.updated_at).toLocaleString('pt-BR') : ''];
    });
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `profissionais-ativos-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const stats = {
    total: profissionaisFiltrados.length,
    comObs: profissionaisFiltrados.filter(p => observacoes[p.codigo]?.observacao).length,
    porRegiao: profissionaisFiltrados.reduce((a, p) => { const r = p.regiao || 'Sem região'; a[r] = (a[r] || 0) + 1; return a; }, {} as Record<string, number>),
    porAtivador: profissionaisFiltrados.reduce((a, p) => { const at = p.quemAtivou || 'Sem info'; a[at] = (a[at] || 0) + 1; return a; }, {} as Record<string, number>),
  };

  if (isLoading) return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users className="w-7 h-7 text-green-600" /> Profissionais Ativos</h1>
          <p className="text-gray-600">Profissionais ativados no período selecionado</p>
        </div>
        <button onClick={exportarCSV} disabled={profissionaisFiltrados.length === 0} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" /> Exportar CSV</button>
        <button onClick={() => { loadProfissionais(); loadObservacoes(); }} disabled={isRefreshing} className="btn-primary flex items-center gap-2"><RefreshCw className={clsx('w-4 h-4', isRefreshing && 'animate-spin')} /> Atualizar</button>
      </div>

      {error && <div className="card mb-4 p-4 bg-red-50 border-red-200"><div className="flex items-center gap-2 text-red-600"><AlertCircle className="w-5 h-5" /><span>{error}</span></div></div>}

      {/* Filtros */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-2 mb-4"><Filter className="w-5 h-5 text-gray-500" /><span className="font-medium text-gray-700">Filtros</span></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label><input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label><input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Região</label><select value={regiaoFiltro} onChange={(e) => setRegiaoFiltro(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"><option value="">Todas</option>{regioes.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Quem Ativou</label><select value={ativadorFiltro} onChange={(e) => setAtivadorFiltro(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"><option value="">Todos</option>{ativadores.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className="text-sm text-gray-500">Atalhos:</span>
          <button onClick={setPeriodoMesAtual} className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors">Mês Atual</button>
          <button onClick={setPeriodoMesAnterior} className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors">Mês Anterior</button>
          <button onClick={setPeriodoTodos} className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors">Todos</button>
          <div className="flex-1" />
          <div className="relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" /><input type="text" placeholder="Buscar nome, código, telefone ou observação..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-80" /></div>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><Users className="w-5 h-5 text-green-600" /></div><div><p className="text-2xl font-bold text-green-600">{stats.total}</p><p className="text-sm text-gray-500">Total no Período</p></div></div></div>
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><MapPin className="w-5 h-5 text-blue-600" /></div><div><p className="text-2xl font-bold text-blue-600">{Object.keys(stats.porRegiao).length}</p><p className="text-sm text-gray-500">Regiões</p></div></div></div>
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center"><UserCheck className="w-5 h-5 text-purple-600" /></div><div><p className="text-2xl font-bold text-purple-600">{Object.keys(stats.porAtivador).length}</p><p className="text-sm text-gray-500">Ativadores</p></div></div></div>
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><MessageSquare className="w-5 h-5 text-amber-600" /></div><div><p className="text-2xl font-bold text-amber-600">{stats.comObs}</p><p className="text-sm text-gray-500">Com Observação</p></div></div></div>
        <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center"><Calendar className="w-5 h-5 text-gray-600" /></div><div><p className="text-sm font-bold text-gray-600">{periodoInicio ? format(new Date(periodoInicio + 'T12:00:00'), 'dd/MM', { locale: ptBR }) : '---'}{' - '}{periodoFim ? format(new Date(periodoFim + 'T12:00:00'), 'dd/MM', { locale: ptBR }) : '---'}</p><p className="text-sm text-gray-500">Período</p></div></div></div>
      </div>

      {/* Mini cards região/ativador */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="card p-4"><h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2"><MapPin className="w-4 h-4" /> Por Região</h3><div className="flex flex-wrap gap-2">{Object.entries(stats.porRegiao).sort((a, b) => b[1] - a[1]).map(([r, q]) => <span key={r} onClick={() => setRegiaoFiltro(regiaoFiltro === r ? '' : r)} className={clsx('px-3 py-1 rounded-full text-sm cursor-pointer transition-colors', regiaoFiltro === r ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100')}>{r}: <strong>{q}</strong></span>)}</div></div>
        <div className="card p-4"><h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2"><UserCheck className="w-4 h-4" /> Por Quem Ativou</h3><div className="flex flex-wrap gap-2">{Object.entries(stats.porAtivador).sort((a, b) => b[1] - a[1]).map(([a, q]) => <span key={a} onClick={() => setAtivadorFiltro(ativadorFiltro === a ? '' : a)} className={clsx('px-3 py-1 rounded-full text-sm cursor-pointer transition-colors', ativadorFiltro === a ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100')}>{a}: <strong>{q}</strong></span>)}</div></div>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"><div className="flex items-center gap-1"><Hash className="w-3 h-3" /> Código</div></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"><div className="flex items-center gap-1"><User className="w-3 h-3" /> Nome</div></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"><div className="flex items-center gap-1"><Phone className="w-3 h-3" /> Telefone</div></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"><div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Região</div></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"><div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Data Ativação</div></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"><div className="flex items-center gap-1"><UserCheck className="w-3 h-3" /> Quem Ativou</div></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[300px]"><div className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Observações</div></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {profissionaisFiltrados.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500"><Users className="w-12 h-12 mx-auto mb-2 text-gray-300" /><p>Nenhum profissional encontrado no período</p></td></tr>
              ) : (
                profissionaisFiltrados.map((prof, index) => (
                  <tr key={`${prof.codigo}-${index}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap"><span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{prof.codigo || '---'}</span></td>
                    <td className="px-4 py-3"><span className="font-medium text-gray-900">{prof.nome || 'Sem nome'}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatPhone(prof.telefone)}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">{prof.regiao || 'Sem região'}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{prof.dataAtivacao || '---'}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">{prof.quemAtivou || 'Sem info'}</span></td>
                    <td className="px-4 py-3">
                      <ObservacaoCell codigo={prof.codigo} telefone={prof.telefone} observacao={observacoes[prof.codigo] || null} onSave={salvarObservacao} />
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
