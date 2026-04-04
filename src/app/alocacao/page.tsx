'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { useApi } from '@/lib/hooks';
import {
  Users, Loader2, AlertCircle, Search, Plus, RefreshCw, Download, BarChart3,
  CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, Calendar,
  TrendingDown, ArrowUpCircle, Trash2, UserPlus,
} from 'lucide-react';
import clsx from 'clsx';

// ── Types ──
interface Alocacao {
  id: number;
  cod_cliente: string;
  nome_cliente: string;
  cod_prof: string;
  nome_prof: string;
  quem_alocou: string;
  data_prevista: string | null;
  status: string;
  dias_operacao: number;
  ultima_entrega: string | null;
  obs: string | null;
  created_at: string;
}

interface KPIs {
  total: number;
  nao_rodou: number;
  em_operacao: number;
  possivel_churn: number;
  churn: number;
  voltou_operacao: number;
  total_clientes: number;
  total_alocadores: number;
}

interface ClienteOption { cod: string; nome: string; }

// ── Status helpers ──
const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  nao_rodou:        { label: 'Não Rodou',        color: 'text-red-700',    bg: 'bg-red-100',    icon: XCircle },
  em_operacao:      { label: 'Em Operação',      color: 'text-green-700',  bg: 'bg-green-100',  icon: CheckCircle },
  possivel_churn:   { label: 'Possível Churn',   color: 'text-orange-700', bg: 'bg-orange-100', icon: TrendingDown },
  churn:            { label: 'Churn',             color: 'text-red-800',    bg: 'bg-red-200',    icon: AlertCircle },
  voltou_operacao:  { label: 'Voltou Operação',  color: 'text-blue-700',   bg: 'bg-blue-100',   icon: ArrowUpCircle },
};

function StatusBadge({ status, dias }: { status: string; dias?: number }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.nao_rodou;
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.bg, cfg.color)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
      {dias && dias > 0 ? ` (${dias}d)` : ''}
    </span>
  );
}

function fmtData(d: string | null) {
  if (!d) return '—';
  try {
    const iso = d.substring(0, 10);
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  } catch { return d; }
}

// ── Dropdown com "novo" ──
function ComboSelect({ value, options, onSelect, onAddNew, placeholder }: {
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  onAddNew: (v: string) => void;
  placeholder: string;
}) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (adding && inputRef.current) inputRef.current.focus(); }, [adding]);

  const handleSelect = (v: string) => {
    if (v === '__novo__') { setAdding(true); return; }
    onSelect(v);
  };

  if (adding) {
    return (
      <input ref={inputRef} type="text" value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && custom.trim()) { onAddNew(custom.trim().toUpperCase()); setAdding(false); setCustom(''); }
          if (e.key === 'Escape') { setAdding(false); setCustom(''); }
        }}
        onBlur={() => { if (custom.trim()) { onAddNew(custom.trim().toUpperCase()); } setAdding(false); setCustom(''); }}
        placeholder="Digite + Enter"
        className="w-full px-2 py-1.5 text-xs border-2 border-purple-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
      />
    );
  }

  return (
    <select value={value} onChange={(e) => handleSelect(e.target.value)}
      className={clsx('w-full px-2 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500',
        value ? 'border-gray-300 text-gray-800' : 'border-gray-200 text-gray-400')}>
      <option value="">{placeholder}</option>
      {value && !options.includes(value) && <option value={value}>{value}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
      <option value="__novo__">+ Novo...</option>
    </select>
  );
}

// ── Main Component ──
function AlocacaoContent() {
  const [alocacoes, setAlocacoes] = useState<Alocacao[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [alocadores, setAlocadores] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroAlocador, setFiltroAlocador] = useState('');
  const [busca, setBusca] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Form
  const [form, setForm] = useState({ cod_cliente: '', nome_cliente: '', cod_prof: '', nome_prof: '', quem_alocou: '', data_prevista: '', obs: '' });
  const [buscandoProf, setBuscandoProf] = useState(false);

  const { fetchApi } = useApi();
  const hasLoaded = useRef(false);

  // ── Loaders ──
  const carregarAlocacoes = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    const params = new URLSearchParams();
    if (filtroCliente) params.set('cliente', filtroCliente);
    if (filtroStatus)  params.set('status', filtroStatus);
    if (filtroAlocador) params.set('quem_alocou', filtroAlocador);
    if (busca) params.set('search', busca);
    params.set('page', String(page));
    params.set('limit', '50');

    const { data } = await fetchApi(`/api/alocacao?${params}`);
    if (data?.success) {
      setAlocacoes(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      if (data.kpis) setKpis(data.kpis);
      if (data.clientes) setClientes(data.clientes);
      if (data.alocadores) setAlocadores(data.alocadores);
    }
    setIsLoading(false);
  }, [fetchApi, filtroCliente, filtroStatus, filtroAlocador, busca, page]);

  // ── Actions ──
  const importarSheet = async () => {
    setIsImporting(true); setError(null);
    const { data, error: e } = await fetchApi('/api/alocacao/importar', { method: 'POST' });
    if (e) setError(e);
    else if (data?.success) {
      setSuccessMsg(data.message); setTimeout(() => setSuccessMsg(null), 8000);
      carregarAlocacoes(false);
    }
    setIsImporting(false);
  };

  const atualizarStatus = async () => {
    setIsUpdatingStatus(true); setError(null);
    const { data, error: e } = await fetchApi('/api/alocacao/atualizar-status', { method: 'POST' });
    if (e) setError(e);
    else if (data?.success) {
      setSuccessMsg(data.message); setTimeout(() => setSuccessMsg(null), 8000);
      carregarAlocacoes(false);
    }
    setIsUpdatingStatus(false);
  };

  const buscarProfissional = async (cod: string) => {
    if (!cod || cod.length < 2) return;
    setBuscandoProf(true);
    const { data } = await fetchApi(`/api/alocacao?lookup_prof=${cod}`);
    if (data?.success && data.nome) {
      setForm(prev => ({ ...prev, nome_prof: data.nome }));
    }
    setBuscandoProf(false);
  };

  const criarAlocacao = async () => {
    if (!form.cod_prof) { setError('Código do profissional é obrigatório'); return; }
    setError(null);
    const { data, error: e } = await fetchApi('/api/alocacao', {
      method: 'POST', body: JSON.stringify(form),
    });
    if (e) setError(e);
    else if (data?.success) {
      setSuccessMsg('Alocação criada!'); setTimeout(() => setSuccessMsg(null), 5000);
      setShowModal(false);
      setForm({ cod_cliente: '', nome_cliente: '', cod_prof: '', nome_prof: '', quem_alocou: '', data_prevista: '', obs: '' });
      carregarAlocacoes(false);
    }
  };

  const atualizarCampo = async (id: number, campo: string, valor: any) => {
    await fetchApi(`/api/alocacao/${id}`, { method: 'PATCH', body: JSON.stringify({ [campo]: valor }) });
    setAlocacoes(prev => prev.map(a => a.id === id ? { ...a, [campo]: valor } : a));
    
  };

  const removerAlocacao = async (id: number) => {
    if (!confirm('Remover esta alocação?')) return;
    await fetchApi(`/api/alocacao/${id}`, { method: 'DELETE' });
    setAlocacoes(prev => prev.filter(a => a.id !== id));
    setSuccessMsg('Removida'); setTimeout(() => setSuccessMsg(null), 3000);
  };

  // ── Init ──
  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    carregarAlocacoes();
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    carregarAlocacoes();
  }, [filtroCliente, filtroStatus, filtroAlocador, busca, page]);

  // ── Render ──
  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <UserPlus className="w-7 h-7 text-purple-600" /> Alocação
          </h1>
          <p className="text-sm text-gray-500 mt-1">{total} profissionais alocados</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { carregarAlocacoes(); }} disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} /> Atualizar
          </button>
          <button onClick={atualizarStatus} disabled={isUpdatingStatus}
            className={clsx('flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
              isUpdatingStatus ? 'border-blue-300 text-blue-400' : 'border-blue-300 text-blue-600 hover:bg-blue-50')}>
            {isUpdatingStatus ? <><Loader2 className="w-4 h-4 animate-spin" /> Atualizando...</> : <><BarChart3 className="w-4 h-4" /> Atualizar Status</>}
          </button>
          <button onClick={importarSheet} disabled={isImporting}
            className={clsx('flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
              isImporting ? 'border-green-300 text-green-400' : 'border-green-300 text-green-600 hover:bg-green-50')}>
            {isImporting ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</> : <><Download className="w-4 h-4" /> Importar Sheet</>}
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700">
            <Plus className="w-4 h-4" /> Nova Alocação
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}
      {successMsg && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {successMsg}</div>}

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            { key: '',                label: 'Total',          valor: kpis.total,            bgIcon: 'bg-purple-100', txtIcon: 'text-purple-600', txtVal: 'text-purple-600', icon: Users },
            { key: 'nao_rodou',       label: 'Não Rodou',      valor: kpis.nao_rodou,        bgIcon: 'bg-red-100',    txtIcon: 'text-red-600',    txtVal: 'text-red-600',    icon: XCircle },
            { key: 'em_operacao',     label: 'Em Operação',    valor: kpis.em_operacao,      bgIcon: 'bg-green-100',  txtIcon: 'text-green-600',  txtVal: 'text-green-600',  icon: CheckCircle },
            { key: 'possivel_churn',  label: 'Possível Churn', valor: kpis.possivel_churn,   bgIcon: 'bg-orange-100', txtIcon: 'text-orange-600', txtVal: 'text-orange-600', icon: TrendingDown },
            { key: 'churn',           label: 'Churn',          valor: kpis.churn,            bgIcon: 'bg-red-200',    txtIcon: 'text-red-800',    txtVal: 'text-red-800',    icon: AlertCircle },
            { key: 'voltou_operacao', label: 'Voltou Op.',     valor: kpis.voltou_operacao,  bgIcon: 'bg-blue-100',   txtIcon: 'text-blue-600',   txtVal: 'text-blue-600',   icon: ArrowUpCircle },
          ].map(card => {
            const Icon = card.icon;
            const isActive = filtroStatus === card.key;
            return (
              <div key={card.key || 'total'}
                onClick={() => { setFiltroStatus(isActive ? '' : card.key); setPage(1); }}
                className={clsx('card p-4 cursor-pointer transition-all hover:shadow-md', isActive && 'ring-2 ring-purple-500 shadow-md')}>
                <div className="flex items-center gap-3">
                  <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', card.bgIcon)}>
                    <Icon className={clsx('w-5 h-5', card.txtIcon)} />
                  </div>
                  <div>
                    <p className={clsx('text-2xl font-bold', card.txtVal)}>{card.valor}</p>
                    <p className="text-xs text-gray-500">{card.label}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar profissional, código ou cliente..."
            value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <select value={filtroCliente} onChange={(e) => { setFiltroCliente(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">Todos os clientes</option>
          {clientes.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
        </select>
        <select value={filtroStatus} onChange={(e) => { setFiltroStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">Todos os status</option>
          <option value="nao_rodou">Não Rodou</option>
          <option value="em_operacao">Em Operação</option>
          <option value="possivel_churn">Possível Churn</option>
          <option value="churn">Churn</option>
          <option value="voltou_operacao">Voltou Operação</option>
        </select>
        <select value={filtroAlocador} onChange={(e) => { setFiltroAlocador(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">Todos os alocadores</option>
          {alocadores.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-purple-500" /></div>
      ) : alocacoes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <UserPlus className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">Nenhuma alocação encontrada</p>
          <p className="text-sm mt-1">Importe da planilha ou crie manualmente</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cód Prof</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entregador</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quem Alocou</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data Prevista</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dias Op.</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Obs</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {alocacoes.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5">
                        <ComboSelect
                          value={a.nome_cliente || ''}
                          options={clientes.map(c => c.nome)}
                          onSelect={(v) => { const cli = clientes.find(c => c.nome === v); atualizarCampo(a.id, 'nome_cliente', v); if (cli?.cod) atualizarCampo(a.id, 'cod_cliente', cli.cod); }}
                          onAddNew={(v) => { atualizarCampo(a.id, 'nome_cliente', v); }}
                          placeholder="— cliente —"
                        />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-purple-600 font-medium text-xs">{a.cod_prof}</td>
                      <td className="px-3 py-2.5 text-xs font-medium text-gray-800">{a.nome_prof || '—'}</td>
                      <td className="px-3 py-2.5">
                        <ComboSelect
                          value={a.quem_alocou || ''}
                          options={alocadores}
                          onSelect={(v) => atualizarCampo(a.id, 'quem_alocou', v)}
                          onAddNew={(v) => atualizarCampo(a.id, 'quem_alocou', v)}
                          placeholder="— selecionar —"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input type="date" value={a.data_prevista?.substring(0, 10) || ''}
                          onChange={(e) => atualizarCampo(a.id, 'data_prevista', e.target.value || null)}
                          className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500" />
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={a.status} dias={a.dias_operacao} /></td>
                      <td className="px-3 py-2.5 text-center text-xs font-bold">
                        {a.dias_operacao > 0 ? <span className="text-green-600">{a.dias_operacao}</span> : <span className="text-gray-400">0</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <input type="text" value={a.obs || ''} placeholder="..."
                          onChange={(e) => setAlocacoes(prev => prev.map(x => x.id === a.id ? { ...x, obs: e.target.value } : x))}
                          onBlur={(e) => atualizarCampo(a.id, 'obs', e.target.value)}
                          className="w-full min-w-[120px] px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-500" />
                      </td>
                      <td className="px-3 py-2.5">
                        <button onClick={() => removerAlocacao(a.id)} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Remover">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
              <p className="text-sm text-gray-500">{(page - 1) * 50 + 1}–{Math.min(page * 50, total)} de {total}</p>
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

      {/* Modal Nova Alocação */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Plus className="w-5 h-5 text-purple-600" /> Nova Alocação</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
                <ComboSelect
                  value={form.nome_cliente}
                  options={clientes.map(c => c.nome)}
                  onSelect={(v) => { const cli = clientes.find(c => c.nome === v); setForm(prev => ({ ...prev, nome_cliente: v, cod_cliente: cli?.cod || '' })); }}
                  onAddNew={(v) => setForm(prev => ({ ...prev, nome_cliente: v }))}
                  placeholder="Selecione ou adicione..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Código do Profissional *</label>
                <div className="flex gap-2">
                  <input type="text" value={form.cod_prof}
                    onChange={(e) => setForm(prev => ({ ...prev, cod_prof: e.target.value }))}
                    onBlur={() => buscarProfissional(form.cod_prof)}
                    placeholder="Ex: 14789"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  {buscandoProf && <Loader2 className="w-5 h-5 animate-spin text-purple-500 self-center" />}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Entregador</label>
                <input type="text" value={form.nome_prof}
                  onChange={(e) => setForm(prev => ({ ...prev, nome_prof: e.target.value }))}
                  placeholder="Preenchido automaticamente pelo código"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quem Alocou</label>
                <ComboSelect
                  value={form.quem_alocou}
                  options={alocadores}
                  onSelect={(v) => setForm(prev => ({ ...prev, quem_alocou: v }))}
                  onAddNew={(v) => setForm(prev => ({ ...prev, quem_alocou: v }))}
                  placeholder="Selecione ou adicione..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Data Prevista</label>
                <input type="date" value={form.data_prevista}
                  onChange={(e) => setForm(prev => ({ ...prev, data_prevista: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Observação</label>
                <textarea value={form.obs}
                  onChange={(e) => setForm(prev => ({ ...prev, obs: e.target.value }))}
                  rows={2} placeholder="Opcional..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button onClick={criarAlocacao} className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">Criar Alocação</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AlocacaoPage() {
  return (
    <AuthLayout>
      <AlocacaoContent />
    </AuthLayout>
  );
}
