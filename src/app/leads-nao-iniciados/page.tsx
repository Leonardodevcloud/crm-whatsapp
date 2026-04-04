'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { useApi } from '@/lib/hooks';
import {
  Bot, Users, Loader2, AlertCircle, MapPin, Phone, Hash, User, Search,
  MessageCircle, CheckCircle, XCircle, Clock, Play, RefreshCw,
  ChevronLeft, ChevronRight, Calendar, Zap, FileText,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';

// ── Types ──────────────────────────────────────────────────
interface LeadCapturado {
  id: number;
  cod: string;
  nome: string;
  celular: string;
  telefone_fixo: string;
  telefone_normalizado: string;
  email: string;
  categoria: string;
  data_cadastro: string | null;
  regiao: string;
  estado: string;
  status_api: string | null;
  quem_ativou: string | null;
  observacao: string | null;
  data_ativacao: string | null;
  capturado_em: string;
}

interface Stats {
  total: number;
  ativos: number;
  inativos: number;
  nao_encontrados: number;
  sem_verificacao: number;
  total_regioes: number;
  porRegiao: { regiao: string; quantidade: number }[];
  ultimoJob: any | null;
  captura_em_andamento: boolean;
}

// ── Inline editable cell: Quem Ativou ──────────────────────
function QuemAtivouCell({ lead, ativadores, onSave }: {
  lead: LeadCapturado;
  ativadores: string[];
  onSave: (id: number, valor: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [customNome, setCustomNome] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const salvandoRef = useRef(false);

  useEffect(() => {
    if (editando && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editando]);

  const handleSelect = (valor: string) => {
    if (valor === '__outro__') {
      setEditando(true);
      return;
    }
    if (valor) {
      onSave(lead.id, valor);
    }
  };

  const handleCustomSave = () => {
    if (salvandoRef.current) return;
    salvandoRef.current = true;
    const nome = customNome.trim().toUpperCase();
    if (nome) {
      onSave(lead.id, nome);
    }
    setEditando(false);
    setCustomNome('');
    setTimeout(() => { salvandoRef.current = false; }, 200);
  };

  if (editando) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={customNome}
        onChange={(e) => setCustomNome(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleCustomSave(); }
          if (e.key === 'Escape') { setEditando(false); setCustomNome(''); }
        }}
        onBlur={handleCustomSave}
        placeholder="Digite o nome + Enter"
        className="w-32 px-2 py-1 text-xs border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
      />
    );
  }

  return (
    <select
      value={lead.quem_ativou || ''}
      onChange={(e) => handleSelect(e.target.value)}
      className={clsx(
        'w-32 px-2 py-1 text-xs border rounded cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-500',
        lead.quem_ativou ? 'border-green-300 bg-green-50 text-green-800' : 'border-gray-300 text-gray-400'
      )}
    >
      <option value="">— selecionar —</option>
      {ativadores.map(nome => (
        <option key={nome} value={nome}>{nome}</option>
      ))}
      <option value="__outro__">+ Outro...</option>
    </select>
  );
}

// ── Inline editable cell: Observação ───────────────────────
function ObservacaoCell({ lead, onSave }: {
  lead: LeadCapturado;
  onSave: (id: number, valor: string) => void;
}) {
  const [texto, setTexto] = useState(lead.observacao || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { if (!isEditing) setTexto(lead.observacao || ''); }, [lead.observacao, isEditing]);
  useEffect(() => { return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); }; }, []);

  const handleSave = () => {
    if (texto === (lead.observacao || '')) { setIsEditing(false); return; }
    setIsSaving(true);
    onSave(lead.id, texto);
    setSaved(true);
    setTimeout(() => { setSaved(false); setIsSaving(false); setIsEditing(false); }, 1000);
  };

  const handleChange = (value: string) => {
    setTexto(value);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (value !== (lead.observacao || '')) {
        setIsSaving(true);
        onSave(lead.id, value);
        setSaved(true);
        setTimeout(() => { setSaved(false); setIsSaving(false); }, 1000);
      }
    }, 1500);
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  if (isEditing) {
    return (
      <div className="min-w-[240px]">
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === 'Escape') { setTexto(lead.observacao || ''); setIsEditing(false); } }}
          rows={3}
          className="w-full px-2 py-1.5 text-xs border-2 border-purple-400 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-y bg-white"
          placeholder="Digite observações..."
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-400">
            {isSaving ? (
              <span className="flex items-center gap-1 text-blue-500"><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</span>
            ) : saved ? (
              <span className="flex items-center gap-1 text-green-500"><CheckCircle className="w-3 h-3" /> Salvo!</span>
            ) : 'Esc cancelar'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div onClick={handleStartEdit} className="min-w-[180px] cursor-pointer group">
      {texto ? (
        <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed line-clamp-2 group-hover:text-purple-600 transition-colors">{texto}</p>
      ) : (
        <span className="text-xs text-gray-300 group-hover:text-purple-400 transition-colors italic">Clique para adicionar...</span>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────
function LeadsNaoIniciadosContent() {
  const [leads, setLeads] = useState<LeadCapturado[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [ativadores, setAtivadores] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [regiaoFiltro, setRegiaoFiltro] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [ativacaoInicio, setAtivacaoInicio] = useState('');
  const [ativacaoFim, setAtivacaoFim] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [regioes, setRegioes] = useState<string[]>([]);

  const { fetchApi } = useApi();
  const hasLoaded = useRef(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const verifyPollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Loaders ─────────────────────────────────────────────
  const carregarLeads = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    const params = new URLSearchParams();
    if (regiaoFiltro) params.set('regiao', regiaoFiltro);
    if (statusFiltro) params.set('status_api', statusFiltro);
    if (busca) params.set('search', busca);
    if (dataInicio) params.set('data_inicio', dataInicio);
    if (dataFim) params.set('data_fim', dataFim);
    if (ativacaoInicio) params.set('ativacao_inicio', ativacaoInicio);
    if (ativacaoFim) params.set('ativacao_fim', ativacaoFim);
    params.set('page', String(page));
    params.set('limit', '50');

    const { data, error: apiError } = await fetchApi(`/api/leads-captura?${params}`);
    if (apiError) { setError(apiError); }
    else if (data?.success) {
      setLeads(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setRegioes(data.regioes || []);
      // Só atualizar isCapturing se não tem polling ativo (evita conflito)
      if (!pollRef.current) {
        setIsCapturing(data.captura_em_andamento || false);
      }
      // KPIs vêm embutidos na mesma resposta
      if (data.stats) setStats(data.stats);
    }
    setIsLoading(false);
  }, [fetchApi, regiaoFiltro, statusFiltro, busca, dataInicio, dataFim, ativacaoInicio, ativacaoFim, page]);

  // Stats vêm embutidos em carregarLeads — este é fallback
  const carregarStats = useCallback(async () => {
    // Stats já vêm no GET / — só chama se precisar forçar
    const params = new URLSearchParams();
    if (dataInicio) params.set('data_inicio', dataInicio);
    if (dataFim) params.set('data_fim', dataFim);
    params.set('page', '1');
    params.set('limit', '1');
    const qs = params.toString();
    const { data } = await fetchApi(`/api/leads-captura?${qs}`);
    if (data?.success && data.stats) setStats(data.stats);
  }, [fetchApi, dataInicio, dataFim]);

  const carregarAtivadores = useCallback(async () => {
    const { data } = await fetchApi('/api/leads-captura/ativadores');
    if (data?.success) setAtivadores(data.data);
  }, [fetchApi]);

  // Ref para recarregar (evita stale closure no polling)
  const recarregarRef = useRef(() => {});
  recarregarRef.current = () => { carregarLeads(false); carregarStats(); };

  // ── Actions ─────────────────────────────────────────────
  const dispararCaptura = async () => {
    setIsCapturing(true);
    setError(null);
    const { data, error: apiError } = await fetchApi('/api/leads-captura', {
      method: 'POST', body: JSON.stringify({}),
    });
    if (apiError) { setError(apiError); setIsCapturing(false); return; }
    if (data?.success) {
      setSuccessMsg(`Captura iniciada (Job #${data.job_id}). Aguarde...`);
      setTimeout(() => setSuccessMsg(null), 15000);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const { data: jd } = await fetchApi('/api/leads-captura/jobs');
          if (jd?.success && !jd.em_andamento) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setIsCapturing(false);
            setSuccessMsg('✅ Captura concluída! Dados atualizados.');
            setTimeout(() => setSuccessMsg(null), 5000);
            // Usar ref para garantir versão atual da função
            recarregarRef.current();
          }
        } catch (e) {
          console.error('[Polling] erro:', e);
        }
      }, 4000);
    }
  };

  const reVerificar = async () => {
    setIsVerifying(true);
    setError(null);
    const { data, error: apiError } = await fetchApi('/api/leads-captura/re-verificar', {
      method: 'POST', body: JSON.stringify({}),
    });
    if (apiError) { setError(apiError); setIsVerifying(false); return; }
    if (data?.success) {
      setSuccessMsg(data.message);
      // Polling para acompanhar progresso
      if (verifyPollRef.current) clearInterval(verifyPollRef.current);
      verifyPollRef.current = setInterval(async () => {
        try {
          const res = await fetchApi('/api/leads-captura/re-verificar');
          if (res.data?.success && !res.data.em_andamento) {
            if (verifyPollRef.current) clearInterval(verifyPollRef.current);
            verifyPollRef.current = null;
            setIsVerifying(false);
            setSuccessMsg(`✅ ${res.data.message || 'Verificação concluída!'}`);
            setTimeout(() => setSuccessMsg(null), 8000);
            recarregarRef.current();
          } else if (res.data?.verificados) {
            setSuccessMsg(`Verificando... ${res.data.verificados} processados`);
          }
        } catch {}
      }, 3000);
    }
  };

  const enriquecer = async () => {
    setIsEnriching(true);
    setError(null);
    const { data, error: apiError } = await fetchApi('/api/leads-captura/enriquecer', {
      method: 'POST', body: JSON.stringify({}),
    });
    if (apiError) { setError(apiError); }
    else if (data?.success) {
      setSuccessMsg(data.message || `${data.atualizados} leads enriquecidos`);
      setTimeout(() => setSuccessMsg(null), 5000);
      await carregarLeads(false);
    }
    setIsEnriching(false);
  };

  const salvarQuemAtivou = async (id: number, valor: string) => {
    await fetchApi(`/api/leads-captura/${id}`, {
      method: 'PATCH', body: JSON.stringify({ quem_ativou: valor }),
    });
    const hoje = new Date().toISOString().split('T')[0];
    setLeads(prev => prev.map(l => l.id === id ? { ...l, quem_ativou: valor.toUpperCase(), data_ativacao: l.data_ativacao || hoje } : l));
    carregarAtivadores(); // refresh dropdown
  };

  const salvarObservacao = async (id: number, valor: string) => {
    await fetchApi(`/api/leads-captura/${id}`, {
      method: 'PATCH', body: JSON.stringify({ observacao: valor }),
    });
    setLeads(prev => prev.map(l => l.id === id ? { ...l, observacao: valor } : l));
  };

  const recarregarTudo = () => { carregarLeads(); carregarStats(); carregarAtivadores(); };

  // ── Init ────────────────────────────────────────────────
  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    recarregarTudo();

    // Detectar se já tem captura em andamento e iniciar polling
    (async () => {
      try {
        const { data: jd } = await fetchApi('/api/leads-captura/jobs');
        if (jd?.success && jd.em_andamento) {
          setIsCapturing(true);
          setSuccessMsg('Captura em andamento... aguarde.');
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = setInterval(async () => {
            try {
              const { data: jd2 } = await fetchApi('/api/leads-captura/jobs');
              if (jd2?.success && !jd2.em_andamento) {
                if (pollRef.current) clearInterval(pollRef.current);
                pollRef.current = null;
                setIsCapturing(false);
                setSuccessMsg('✅ Captura concluída! Dados atualizados.');
                setTimeout(() => setSuccessMsg(null), 5000);
                recarregarRef.current();
              }
            } catch {}
          }, 4000);
        }
      } catch {}
    })();

    return () => { if (pollRef.current) clearInterval(pollRef.current); if (verifyPollRef.current) clearInterval(verifyPollRef.current); };
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    carregarLeads();
    carregarStats();
  }, [regiaoFiltro, statusFiltro, busca, dataInicio, dataFim, ativacaoInicio, ativacaoFim, page]);

  // ── Helpers ─────────────────────────────────────────────
  const statusBadge = (s: string | null) => {
    if (s === 'ativo')          return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircle className="w-3 h-3" /> Ativo</span>;
    if (s === 'inativo')        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><XCircle className="w-3 h-3" /> Inativo</span>;
    if (s === 'nao_encontrado') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700"><AlertCircle className="w-3 h-3" /> N/E</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500"><Clock className="w-3 h-3" /> Pendente</span>;
  };

  const fmtData = (d: string | null) => {
    if (!d) return '—';
    try {
      // Extrair apenas YYYY-MM-DD para evitar shift de timezone
      const iso = d.substring(0, 10); // "2026-04-02"
      const [ano, mes, dia] = iso.split('-');
      return `${dia}/${mes}/${ano}`;
    } catch { return d; }
  };

  const tempoAtras = (d: string | null) => {
    if (!d) return '';
    try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ptBR }); } catch { return ''; }
  };

  const wppLink = (tel: string) => {
    if (!tel) return '#';
    const numeros = tel.replace(/\D/g, '');
    const comDDI = numeros.startsWith('55') ? numeros : `55${numeros}`;
    return `https://wa.me/${comDDI}`;
  };

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Bot className="w-7 h-7 text-purple-600" />
            Cadastros
          </h1>
          <p className="text-sm text-gray-500 mt-1">Captura automática 7h e 20h — {total} cadastros no banco</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={recarregarTudo} disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} /> Atualizar
          </button>
          <button onClick={reVerificar} disabled={isVerifying}
            className={clsx('flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
              isVerifying ? 'border-orange-300 text-orange-400 cursor-not-allowed' : 'border-orange-300 text-orange-600 hover:bg-orange-50')}>
            {isVerifying ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</> : <><CheckCircle className="w-4 h-4" /> Verificar Status</>}
          </button>
          <button onClick={enriquecer} disabled={isEnriching}
            className={clsx('flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
              isEnriching ? 'border-blue-300 text-blue-400 cursor-not-allowed' : 'border-blue-300 text-blue-600 hover:bg-blue-50')}>
            {isEnriching ? <><Loader2 className="w-4 h-4 animate-spin" /> Enriquecendo...</> : <><Zap className="w-4 h-4" /> Enriquecer</>}
          </button>
          <button onClick={dispararCaptura} disabled={isCapturing}
            className={clsx('flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors',
              isCapturing ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700')}>
            {isCapturing ? <><Loader2 className="w-4 h-4 animate-spin" /> Capturando...</> : <><Play className="w-4 h-4" /> Capturar Agora</>}
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}</div>}
      {successMsg && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4 flex-shrink-0" /> {successMsg}</div>}

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center"><Users className="w-5 h-5 text-purple-600" /></div><div><p className="text-2xl font-bold text-purple-600">{stats.total}</p><p className="text-xs text-gray-500">Total</p></div></div></div>
          <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div><div><p className="text-2xl font-bold text-green-600">{stats.ativos}</p><p className="text-xs text-gray-500">Ativos</p></div></div></div>
          <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><XCircle className="w-5 h-5 text-red-600" /></div><div><p className="text-2xl font-bold text-red-600">{stats.inativos}</p><p className="text-xs text-gray-500">Inativos</p></div></div></div>
          <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center"><AlertCircle className="w-5 h-5 text-yellow-600" /></div><div><p className="text-2xl font-bold text-yellow-600">{stats.nao_encontrados}</p><p className="text-xs text-gray-500">N/Encontrado</p></div></div></div>
          <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center"><Clock className="w-5 h-5 text-gray-500" /></div><div><p className="text-2xl font-bold text-gray-500">{stats.sem_verificacao}</p><p className="text-xs text-gray-500">Pendentes</p></div></div></div>
          <div className="card p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><MapPin className="w-5 h-5 text-blue-600" /></div><div><p className="text-2xl font-bold text-blue-600">{stats.total_regioes}</p><p className="text-xs text-gray-500">Regiões</p></div></div></div>
        </div>
      )}

      {/* Último Job */}
      {stats?.ultimoJob && (
        <div className="mb-6 p-4 card bg-gray-50 border border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-gray-700">Última captura:</span>
              <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium',
                stats.ultimoJob.status === 'concluido' ? 'bg-green-100 text-green-700' :
                stats.ultimoJob.status === 'executando' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                'bg-red-100 text-red-700'
              )}>{stats.ultimoJob.status}</span>
              <span className="text-sm text-gray-500">{tempoAtras(stats.ultimoJob.concluido_em || stats.ultimoJob.iniciado_em)}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>{stats.ultimoJob.total_capturados} capturados</span>
              <span className="text-green-600 font-medium">{stats.ultimoJob.total_novos} novos</span>
              <span>{stats.ultimoJob.total_ativos} ativos</span>
              <span>{stats.ultimoJob.total_inativos} inativos</span>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar nome, código ou celular..."
            value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <select value={regiaoFiltro} onChange={(e) => { setRegiaoFiltro(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">Todas as regiões</option>
          {regioes.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={statusFiltro} onChange={(e) => { setStatusFiltro(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
          <option value="nao_encontrado">Não encontrado</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <Calendar className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-500">Cadastro:</span>
        <input type="date" value={dataInicio} onChange={(e) => { setDataInicio(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        <span className="text-gray-400">até</span>
        <input type="date" value={dataFim} onChange={(e) => { setDataFim(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        {(dataInicio || dataFim) && (
          <button onClick={() => { setDataInicio(''); setDataFim(''); setPage(1); }}
            className="text-xs text-purple-600 hover:text-purple-800 underline">Limpar</button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <CheckCircle className="w-4 h-4 text-green-500" />
        <span className="text-sm text-gray-500">Ativação:</span>
        <input type="date" value={ativacaoInicio} onChange={(e) => { setAtivacaoInicio(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        <span className="text-gray-400">até</span>
        <input type="date" value={ativacaoFim} onChange={(e) => { setAtivacaoFim(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        {(ativacaoInicio || ativacaoFim) && (
          <button onClick={() => { setAtivacaoInicio(''); setAtivacaoFim(''); setPage(1); }}
            className="text-xs text-green-600 hover:text-green-800 underline">Limpar</button>
        )}
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-purple-500" /></div>
      ) : leads.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">Nenhum cadastro encontrado</p>
          <p className="text-sm mt-1">Clique em &quot;Capturar Agora&quot; para buscar cadastros</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase"><div className="flex items-center gap-1"><Hash className="w-3 h-3" /> Cód</div></th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase"><div className="flex items-center gap-1"><User className="w-3 h-3" /> Nome</div></th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase"><div className="flex items-center gap-1"><Phone className="w-3 h-3" /> Celular</div></th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase"><div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Região</div></th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase"><div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Cadastro</div></th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase"><div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Ativação</div></th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase"><div className="flex items-center gap-1"><User className="w-3 h-3" /> Quem Ativou</div></th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase"><div className="flex items-center gap-1"><FileText className="w-3 h-3" /> Observação</div></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leads.map(lead => (
                    <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-purple-600 font-medium text-xs">{lead.cod}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-gray-800 text-xs">{lead.nome || '—'}</div>
                        {lead.email && <div className="text-[10px] text-gray-400">{lead.email}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        {lead.celular ? (
                          <a href={wppLink(lead.celular)} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-green-700 hover:text-green-900 hover:underline text-xs font-medium">
                            <MessageCircle className="w-3 h-3" /> {lead.celular}
                          </a>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                        {lead.telefone_fixo && <div className="text-[10px] text-gray-400">{lead.telefone_fixo}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-gray-700">{lead.regiao || '—'}</span>
                        {lead.estado && <span className="text-[10px] text-gray-400 ml-1">{lead.estado}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{fmtData(lead.data_cadastro)}</td>
                      <td className="px-3 py-2.5">{statusBadge(lead.status_api)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{fmtData(lead.data_ativacao)}</td>
                      <td className="px-3 py-2.5">
                        <QuemAtivouCell lead={lead} ativadores={ativadores} onSave={salvarQuemAtivou} />
                      </td>
                      <td className="px-3 py-2.5">
                        <ObservacaoCell lead={lead} onSave={salvarObservacao} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} de {total}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-sm text-gray-600 px-3">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Regiões clicáveis */}
      {stats && stats.porRegiao.length > 0 && (
        <div className="mt-6 card p-4">
          <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2"><MapPin className="w-4 h-4" /> Por Região</h3>
          <div className="flex flex-wrap gap-2">
            {stats.porRegiao.map(({ regiao, quantidade }) => (
              <span key={regiao}
                onClick={() => { setRegiaoFiltro(regiaoFiltro === regiao ? '' : regiao); setPage(1); }}
                className={clsx('px-3 py-1 rounded-full text-sm cursor-pointer transition-colors',
                  regiaoFiltro === regiao ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100')}>
                {regiao}: <strong>{quantidade}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeadsNaoIniciadosPage() {
  return (
    <AuthLayout>
      <LeadsNaoIniciadosContent />
    </AuthLayout>
  );
}
