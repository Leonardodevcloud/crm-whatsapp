'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { useApi } from '@/lib/hooks';
import {
  Users, UserCheck, UserPlus, TrendingUp, RefreshCw, Loader2, AlertCircle,
  MapPin, Calendar, Truck, XCircle, Tag, Info, BarChart3, Zap, Plus, X, Download, Search,
} from 'lucide-react';

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex ml-1">
      <span onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        className="cursor-help text-gray-400 hover:text-gray-600"><Info className="w-3.5 h-3.5" /></span>
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 rounded-lg bg-gray-900 text-white text-xs leading-relaxed shadow-xl pointer-events-none">
          {text}<span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
}

interface AnalyticsData {
  kpis: { totalCadastros: number; totalAtivos: number; totalAlocados: number; totalInativos: number; naoAtivados: number; emOperacao: number; naoOperando: number; taxaConversao: number; taxaOperacao: number };
  periodoAnterior?: {
    dataInicio: string;
    dataFim: string;
    duracaoDias: number;
    totalCadastros: number;
    totalAtivos: number;
    totalAlocados: number;
    emOperacao: number;
  };
  velocidade?: {
    cadastroAtivacao: { media: number | null; mediana: number | null; p75: number | null; amostra: number };
    tpLeadAtivacao:   { media: number | null; mediana: number | null; p75: number | null; amostra: number };
  };
  funil: Array<{ stage: string; quantidade: number; cor: string; base: number }>;
  funil90d?: Array<{ stage: string; quantidade: number; cor: string; base: number }>;
  funilTP: Array<{ stage: string; quantidade: number; cor: string; base: number }>;
  funilTP90d?: Array<{ stage: string; quantidade: number; cor: string; base: number }>;
  funilTP90dMeta?: { dataInicio: string; dataFim: string; janela: string };
  conversaoOperacao: { leadsAtivados: number; emOperacao: number; naoOperando: number; taxaReal: number };
  porRegiao: Array<{ regiao: string; quantidade: number }>;
  naoAtivadosPorRegiao: Array<{ regiao: string; quantidade: number }>;
  tpPorRegiao: Array<{ regiao: string; quantidade: number }>;
  porOperador: Array<{ operador: string; quantidade: number }>;
  porOperadorAlocacao: Array<{ operador: string; quantidade: number }>;
  porDia: Array<{ data: string; cadastros: number; ativados: number; alocacoes: number }>;
  filtros: { dataInicio: string; dataFim: string; regiao: string };
}

// ═══ Drilldown Modal ═══
type LeadRow = {
  cod: string | null;
  nome: string | null;
  telefone: string | null;
  regiao: string | null;
  data_cadastro: string | null;
  data_ativacao: string | null;
  data_lead: string | null;
  status_api: string | null;
  em_operacao: boolean;
  total_entregas: number | null;
  ultima_entrega: string | null;
  quem_ativou: string | null;
  quem_alocou: string | null;
  tags: string[];
  origem: string | null;
};

function formatDate(d: string | null): string {
  if (!d) return '';
  const s = String(d).split('T')[0];
  const [y, m, dia] = s.split('-');
  if (!y || !m || !dia) return s;
  return `${dia}/${m}/${y}`;
}

function DrilldownModal({
  open, onClose, funil, stage, filtros, modo,
}: {
  open: boolean;
  onClose: () => void;
  funil: 'conversao' | 'tp';
  stage: string;
  filtros: { dataInicio: string; dataFim: string; regiao: string };
  modo?: 'atual' | '90d';
}) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setLoading(true); setErro(null); setLeads([]); setBusca('');
    fetch('/api/analytics/drilldown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funil, stage,
        dataInicio: filtros.dataInicio,
        dataFim: filtros.dataFim,
        regiao: filtros.regiao || undefined,
        modo: modo || 'atual',
      }),
    })
      .then(r => r.ok ? r.json() : r.json().then(j => { throw new Error(j.error || 'Erro ao carregar'); }))
      .then(data => { if (!cancelado) setLeads(data.leads || []); })
      .catch(e => { if (!cancelado) setErro(e.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [open, funil, stage, filtros.dataInicio, filtros.dataFim, filtros.regiao, modo]);

  // Fecha com ESC
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const buscaLower = busca.trim().toLowerCase();
  const filtrados = buscaLower
    ? leads.filter(l =>
        (l.nome || '').toLowerCase().includes(buscaLower) ||
        (l.telefone || '').toLowerCase().includes(buscaLower) ||
        (l.regiao || '').toLowerCase().includes(buscaLower) ||
        (l.cod || '').toLowerCase().includes(buscaLower) ||
        (l.quem_ativou || '').toLowerCase().includes(buscaLower) ||
        (l.tags || []).some(t => t.toLowerCase().includes(buscaLower))
      )
    : leads;

  const exportarCSV = () => {
    const cols = [
      'Código', 'Nome', 'Telefone', 'Região', 'Data Cadastro', 'Data Ativação',
      'Data Lead (TP)', 'Status API', 'Em Operação', 'Total Entregas', 'Última Entrega',
      'Quem Ativou', 'Quem Alocou', 'Tags', 'Origem',
    ];
    const escapeCsv = (v: any): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const linhas = [
      cols.join(';'),
      ...filtrados.map(l => [
        l.cod, l.nome, l.telefone, l.regiao,
        formatDate(l.data_cadastro), formatDate(l.data_ativacao), formatDate(l.data_lead),
        l.status_api, l.em_operacao ? 'Sim' : 'Não', l.total_entregas ?? '',
        formatDate(l.ultima_entrega), l.quem_ativou, l.quem_alocou,
        (l.tags || []).join(', '), l.origem,
      ].map(escapeCsv).join(';')),
    ].join('\n');
    // BOM pra Excel reconhecer UTF-8
    const blob = new Blob(['\uFEFF' + linhas], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = stage.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.download = `drilldown-${slug}-${filtros.dataInicio}-a-${filtros.dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{stage}</h2>
            <p className="text-xs text-gray-500">
              {filtros.dataInicio} a {filtros.dataFim}
              {filtros.regiao ? ` • ${filtros.regiao}` : ''}
              {!loading && ` • ${filtrados.length} de ${leads.length}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportarCSV} disabled={loading || leads.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" /> CSV
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Busca */}
        {!loading && leads.length > 0 && (
          <div className="px-5 py-3 border-b border-gray-200">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Buscar por nome, telefone, região, código..."
                value={busca} onChange={e => setBusca(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            </div>
          )}
          {erro && (
            <div className="p-6 flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" /> {erro}
            </div>
          )}
          {!loading && !erro && filtrados.length === 0 && (
            <div className="p-16 text-center text-gray-400">
              {leads.length === 0 ? 'Nenhum lead encontrado nesta etapa.' : 'Nenhum resultado para a busca.'}
            </div>
          )}
          {!loading && !erro && filtrados.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Código</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Nome</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Telefone</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Região</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Cadastro</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Ativação</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Data Lead TP</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Operação</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Entregas</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Última Entrega</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Ativou</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Alocou</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 text-xs">Tags</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-gray-700 tabular-nums">{l.cod || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{l.nome || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 tabular-nums">{l.telefone || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{l.regiao || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 tabular-nums">{formatDate(l.data_cadastro) || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 tabular-nums">{formatDate(l.data_ativacao) || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 tabular-nums">{formatDate(l.data_lead) || '—'}</td>
                    <td className="px-3 py-2">
                      {l.status_api === 'ativo' ? (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-700">ativo</span>
                      ) : l.status_api ? (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600">{l.status_api}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {l.em_operacao ? (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700">operando</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 tabular-nums">{l.total_entregas ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-700 tabular-nums">{formatDate(l.ultima_entrega) || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{l.quem_ativou || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{l.quem_alocou || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {(l.tags || []).map((t, j) => (
                        <span key={j} className="inline-block px-1.5 py-0.5 mr-1 mb-0.5 text-xs rounded bg-purple-100 text-purple-700">{t}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function FunnelBar({
  items, maxVal, funil, filtros, modo,
}: {
  items: Array<{ stage: string; quantidade: number; cor: string; base: number }>;
  maxVal: number;
  funil: 'conversao' | 'tp';
  filtros: { dataInicio: string; dataFim: string; regiao: string };
  modo?: 'atual' | '90d';
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [stageAberto, setStageAberto] = useState('');

  return (
    <>
      <div className="space-y-4">
        {items.map((item, i) => {
          const widthPct = maxVal > 0 ? Math.round((item.quantidade / maxVal) * 100) : 0;
          const labelPct = item.base > 0 ? Math.round((item.quantidade / item.base) * 100) : 0;
          return (
            <div key={i}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-700 flex items-center">
                  {item.stage}
                  <InfoTooltip text={`${item.quantidade.toLocaleString()} de ${item.base.toLocaleString()} (${labelPct}%)`} />
                  <button
                    onClick={() => { setStageAberto(item.stage); setModalOpen(true); }}
                    className="ml-2 p-0.5 rounded hover:bg-purple-100 text-purple-600 hover:text-purple-700 transition-colors"
                    title={`Ver ${item.quantidade.toLocaleString()} leads de "${item.stage}"`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </span>
                <span className="text-sm font-bold text-gray-800">{item.quantidade.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-7 overflow-hidden">
                <div className="h-full rounded-full flex items-center justify-center text-white text-xs font-bold transition-all duration-700"
                  style={{ width: `${Math.max(widthPct, 3)}%`, backgroundColor: item.cor }}>{labelPct}%</div>
              </div>
            </div>
          );
        })}
      </div>

      <DrilldownModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        funil={funil}
        stage={stageAberto}
        filtros={filtros}
        modo={modo}
      />
    </>
  );
}

// ═══ Funil TP Card — com toggle entre 2 versões ═══
// ═══ Funil de Conversão Card — com toggle entre 2 versões ═══
function FunilConversaoCard({
  funil,
  funil90d,
  funil90dMeta,
  filtros,
}: {
  funil: Array<{ stage: string; quantidade: number; cor: string; base: number }>;
  funil90d?: Array<{ stage: string; quantidade: number; cor: string; base: number }>;
  funil90dMeta?: { dataInicio: string; dataFim: string };
  filtros: { dataInicio: string; dataFim: string; regiao: string };
}) {
  const [versao, setVersao] = useState<'atual' | '90d'>('atual');

  const funilAtivo = versao === 'atual' ? funil : (funil90d || funil);
  const maxVal = funilAtivo[0]?.quantidade || 1;

  const formatarDataBr = (d: string) => {
    const [y, m, dia] = d.split('-');
    return `${dia}/${m}/${y}`;
  };

  const descricoes = {
    atual: `Usa o período e região selecionados no filtro acima. Mostra cadastros → ativados → alocados → em operação dentro desse intervalo.`,
    '90d': `Janela fixa dos últimos 90 dias corridos${funil90dMeta ? ` (${formatarDataBr(funil90dMeta.dataInicio)} a ${formatarDataBr(funil90dMeta.dataFim)})` : ''}. Ignora o filtro de data e região selecionados — mostra o panorama geral do trimestre.`,
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-600" /> Funil de Conversão
        </h3>
        {/* Toggle */}
        <div className="inline-flex bg-gray-100 rounded-lg p-1 text-xs font-medium">
          <button
            onClick={() => setVersao('atual')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              versao === 'atual' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Filtro atual
          </button>
          <button
            onClick={() => setVersao('90d')}
            disabled={!funil90d}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              versao === '90d' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            } ${!funil90d ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={!funil90d ? 'Não disponível' : undefined}
          >
            Últimos 3 meses
          </button>
        </div>
      </div>
      <div className="mb-4 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-gray-600 leading-relaxed flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0 mt-0.5" />
        <span>{descricoes[versao]}</span>
      </div>
      <FunnelBar items={funilAtivo} maxVal={maxVal} funil="conversao" filtros={filtros} modo={versao} />
    </div>
  );
}

function FunilTPCard({
  funilTP,
  funilTP90d,
  funilTP90dMeta,
  filtros,
}: {
  funilTP: Array<{ stage: string; quantidade: number; cor: string; base: number }>;
  funilTP90d?: Array<{ stage: string; quantidade: number; cor: string; base: number }>;
  funilTP90dMeta?: { dataInicio: string; dataFim: string; janela: string };
  filtros: { dataInicio: string; dataFim: string; regiao: string };
}) {
  const [versao, setVersao] = useState<'atual' | '90d'>('atual');

  const funilAtivo = versao === 'atual' ? funilTP : (funilTP90d || funilTP);
  const maxVal = funilAtivo[0]?.quantidade || 1;

  const formatarDataBr = (d: string) => {
    const [y, m, dia] = d.split('-');
    return `${dia}/${m}/${y}`;
  };

  // Descrições das 2 versões (mostradas abaixo do toggle conforme o selecionado)
  const descricoes = {
    atual: `Usa o período e região selecionados no filtro acima. Conta apenas leads TP que cadastraram e ativaram dentro desse intervalo.`,
    '90d': `Janela fixa dos últimos 90 dias corridos${funilTP90dMeta ? ` (${formatarDataBr(funilTP90dMeta.dataInicio)} a ${formatarDataBr(funilTP90dMeta.dataFim)})` : ''}. Ignora o filtro de data e região selecionados — mostra o panorama geral do trimestre.`,
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Tag className="w-5 h-5 text-purple-600" /> Funil Tráfego Pago
        </h3>
        {/* Toggle */}
        <div className="inline-flex bg-gray-100 rounded-lg p-1 text-xs font-medium">
          <button
            onClick={() => setVersao('atual')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              versao === 'atual' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Filtro atual
          </button>
          <button
            onClick={() => setVersao('90d')}
            disabled={!funilTP90d}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              versao === '90d' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            } ${!funilTP90d ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={!funilTP90d ? 'Não disponível' : undefined}
          >
            Últimos 3 meses
          </button>
        </div>
      </div>
      {/* Descrição da versão atual */}
      <div className="mb-4 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg text-xs text-gray-600 leading-relaxed flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-purple-600 flex-shrink-0 mt-0.5" />
        <span>{descricoes[versao]}</span>
      </div>
      <FunnelBar items={funilAtivo} maxVal={maxVal} funil="tp" filtros={filtros} modo={versao} />
    </div>
  );
}

const COLORS = ['#6366F1', '#22C55E', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#3B82F6', '#14B8A6', '#F97316', '#06B6D4', '#84CC16', '#A855F7', '#D946EF', '#0EA5E9', '#10B981'];

function RegionBars({ items, colors }: { items: Array<{ regiao: string; quantidade: number }>; colors: string[] }) {
  const maxR = items[0]?.quantidade || 1;
  return (
    <div
      className="space-y-3 max-h-[450px] overflow-y-auto pr-6"
      style={{ scrollbarGutter: 'stable' }}
    >
      {items.map((item, i) => {
        const widthPct = Math.max((item.quantidade / maxR) * 100, 3);
        return (
          <div key={item.regiao}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                <span className="text-sm text-gray-700 truncate font-medium" title={item.regiao}>{item.regiao}</span>
              </div>
              <span className="text-sm font-bold text-gray-800 tabular-nums flex-shrink-0 whitespace-nowrap">
                {item.quantidade.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${widthPct}%`, backgroundColor: colors[i % colors.length] }} />
            </div>
          </div>
        );
      })}
      {items.length === 0 && <p className="text-gray-400 text-center py-8">Sem dados no período</p>}
    </div>
  );
}

// ═══ Chart with state-based tooltip ═══
// ═══ ChartDia — AreaChart suave em SVG nativo com 3 séries ═══
type DiaPoint = { data: string; cadastros: number; ativados: number; alocacoes: number };
function ChartDia({ porDia }: { porDia: DiaPoint[] }) {
  const [tipIdx, setTipIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgW, setSvgW] = useState(1000);

  // Redimensionar SVG dinamicamente
  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setSvgW(Math.max(400, e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!porDia || porDia.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-2"><Calendar className="w-5 h-5 text-teal-600" /> Evolução diária</h3>
        <p className="text-sm text-gray-400 text-center py-8">Sem dados no período</p>
      </div>
    );
  }

  const PADDING = { top: 20, right: 30, bottom: 40, left: 48 };
  const H = 320;
  const plotW = svgW - PADDING.left - PADDING.right;
  const plotH = H - PADDING.top - PADDING.bottom;
  const N = porDia.length;

  // Domínio Y: máximo das 3 séries + folga de 10%
  const maxY = Math.max(
    1,
    ...porDia.map(d => Math.max(d.cadastros, d.ativados, d.alocacoes))
  );
  const yMax = Math.ceil(maxY * 1.1);

  // Escalas
  const xAt = (i: number) => PADDING.left + (N === 1 ? plotW / 2 : (i / (N - 1)) * plotW);
  const yAt = (v: number) => PADDING.top + plotH - (v / yMax) * plotH;

  // Gridlines horizontais (4 linhas, incluindo 0 e yMax)
  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const v = Math.round((yMax / 4) * i);
    return { v, y: yAt(v) };
  });

  // Path helper: spline Catmull-Rom convertida em Bézier cúbica
  const smoothPath = (points: Array<{ x: number; y: number }>, closeToBase = false) => {
    if (points.length === 0) return '';
    if (points.length === 1) {
      const p = points[0];
      return `M ${p.x} ${p.y}`;
    }
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const tension = 0.2;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    if (closeToBase) {
      const last = points[points.length - 1];
      const first = points[0];
      d += ` L ${last.x} ${yAt(0)} L ${first.x} ${yAt(0)} Z`;
    }
    return d;
  };

  // Converter cada série em pontos {x, y}
  const seriePts = (campo: 'cadastros' | 'ativados' | 'alocacoes') =>
    porDia.map((d, i) => ({ x: xAt(i), y: yAt(d[campo]) }));

  const series = [
    { nome: 'Cadastros', campo: 'cadastros' as const, cor: '#14B8A6', corClara: 'rgba(20, 184, 166, 0.2)' },
    { nome: 'Ativados',  campo: 'ativados'  as const, cor: '#22C55E', corClara: 'rgba(34, 197, 94, 0.2)' },
    { nome: 'Alocações', campo: 'alocacoes' as const, cor: '#8B5CF6', corClara: 'rgba(139, 92, 246, 0.22)' },
  ];

  // Decidir quais rótulos de X mostrar (não mais que ~12 pra não embolar)
  const passo = Math.max(1, Math.ceil(N / 12));
  const formatarDiaMes = (s: string) => { const p = s.split('-'); return `${p[2]}/${p[1]}`; };

  // Tooltip posicionado sobre o ponto
  const pontoAtivo = tipIdx !== null ? porDia[tipIdx] : null;
  const pontoX = tipIdx !== null ? xAt(tipIdx) : 0;

  return (
    <div className="card p-6">
      <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-1">
        <Calendar className="w-5 h-5 text-teal-600" /> Evolução diária
      </h3>
      <div className="flex items-center gap-5 mb-4 text-xs text-gray-600 flex-wrap">
        {series.map(s => (
          <span key={s.nome} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: s.cor }} />
            {s.nome}
          </span>
        ))}
      </div>

      <div className="relative w-full">
        <svg ref={svgRef} width={svgW} height={H} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            {series.map(s => (
              <linearGradient key={s.campo} id={`grad-${s.campo}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.cor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.cor} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          {/* Gridlines horizontais */}
          {gridLines.map(g => (
            <g key={g.v}>
              <line
                x1={PADDING.left} x2={svgW - PADDING.right}
                y1={g.y} y2={g.y}
                stroke="#E5E7EB" strokeDasharray="3 3"
              />
              <text
                x={PADDING.left - 8} y={g.y}
                textAnchor="end" dominantBaseline="middle"
                fontSize="11" fill="#9CA3AF"
              >{g.v}</text>
            </g>
          ))}

          {/* Áreas + linhas de cada série */}
          {series.map(s => {
            const pts = seriePts(s.campo);
            return (
              <g key={s.campo}>
                <path d={smoothPath(pts, true)} fill={`url(#grad-${s.campo})`} />
                <path d={smoothPath(pts, false)} fill="none" stroke={s.cor} strokeWidth={2.5} />
              </g>
            );
          })}

          {/* Rótulos X */}
          {porDia.map((d, i) => {
            if (i % passo !== 0 && i !== N - 1) return null;
            return (
              <text
                key={d.data}
                x={xAt(i)} y={H - PADDING.bottom + 18}
                textAnchor="middle" fontSize="11" fill="#6B7280"
              >{formatarDiaMes(d.data)}</text>
            );
          })}

          {/* Pontos + hitbox invisíveis pra tooltip */}
          {porDia.map((d, i) => {
            const x = xAt(i);
            const ativo = tipIdx === i;
            return (
              <g key={d.data}>
                {series.map(s => (
                  <circle
                    key={s.campo}
                    cx={x} cy={yAt(d[s.campo])}
                    r={ativo ? 5 : 3}
                    fill="#fff" stroke={s.cor} strokeWidth={2}
                    style={{ transition: 'r 0.15s' }}
                  />
                ))}
                {/* Hitbox largo invisível pra facilitar hover */}
                <rect
                  x={x - (plotW / N) / 2} y={PADDING.top}
                  width={plotW / N} height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setTipIdx(i)}
                  onMouseLeave={() => setTipIdx(null)}
                  style={{ cursor: 'pointer' }}
                />
              </g>
            );
          })}

          {/* Linha vertical no ponto ativo */}
          {tipIdx !== null && (
            <line
              x1={pontoX} x2={pontoX}
              y1={PADDING.top} y2={PADDING.top + plotH}
              stroke="#9CA3AF" strokeDasharray="3 3"
            />
          )}
        </svg>

        {/* Tooltip */}
        {pontoAtivo && (
          <div
            style={{
              position: 'absolute',
              left: pontoX,
              top: 0,
              transform: 'translate(-50%, -8px)',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                background: '#111827',
                color: '#fff',
                fontSize: 12,
                borderRadius: 8,
                padding: '8px 12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {formatarDiaMes(pontoAtivo.data)}
              </div>
              {series.map(s => (
                <div key={s.campo} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: s.cor, display: 'inline-block' }} />
                  {s.nome}:{' '}
                  <span style={{ fontWeight: 700, marginLeft: 4 }}>
                    {pontoAtivo[s.campo]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ Helpers de comparativo ═══
function calcularDelta(atual: number, anterior: number | undefined): { pct: number | null; label: string; cor: string; seta: string } {
  if (anterior === undefined || anterior === null) return { pct: null, label: '—', cor: 'text-gray-400', seta: '' };
  if (atual === 0 && anterior === 0) return { pct: 0, label: '0%', cor: 'text-gray-400', seta: '→' };
  if (anterior === 0) return { pct: null, label: 'novo', cor: 'text-emerald-600', seta: '↑' };
  const pct = ((atual - anterior) / anterior) * 100;
  const abs = Math.abs(pct);
  const arredondado = abs < 10 ? abs.toFixed(1) : Math.round(abs).toString();
  const positivo = pct > 0;
  const neutro = pct === 0;
  return {
    pct,
    label: `${arredondado}%`,
    cor: neutro ? 'text-gray-400' : positivo ? 'text-emerald-600' : 'text-red-500',
    seta: neutro ? '→' : positivo ? '↑' : '↓',
  };
}

// Projeção: ritmo atual × dias do período
// Se o filtro é o mês atual e estamos no dia 17, projetamos o total do mês.
// Fórmula: atual × (totalDiasPeriodo / diasJaDecorridos)
function calcularProjecao(atual: number, dataInicioStr: string, dataFimStr: string): { valor: number; diasTotal: number; diasDecorridos: number } | null {
  const msDia = 86_400_000;
  const inicio = new Date(dataInicioStr + 'T00:00:00');
  const fim = new Date(dataFimStr + 'T23:59:59');
  const hoje = new Date();
  // Só projetar se o período inclui "hoje" (não faz sentido projetar passado)
  if (hoje < inicio || hoje > fim) return null;
  const diasTotal = Math.round((fim.getTime() - inicio.getTime()) / msDia) + 1;
  const diasDecorridos = Math.max(1, Math.round((hoje.getTime() - inicio.getTime()) / msDia) + 1);
  if (diasDecorridos >= diasTotal) return null; // período acabou, projeção = atual
  const valor = Math.round(atual * (diasTotal / diasDecorridos));
  return { valor, diasTotal, diasDecorridos };
}

// ═══ DeltaBotao — badge de variação + botão '+' que abre modal ═══
function DeltaBotao({
  atual,
  anterior,
  labelKpi,
  corBase,
  filtros,
}: {
  atual: number;
  anterior: number | undefined;
  labelKpi: string;
  corBase: string; // ex: 'text-purple-600'
  filtros: { dataInicio: string; dataFim: string; periodoAntInicio: string; periodoAntFim: string };
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const d = calcularDelta(atual, anterior);
  const projecao = calcularProjecao(atual, filtros.dataInicio, filtros.dataFim);

  if (anterior === undefined) return null; // sem dado anterior, nada exibir

  const formatBR = (s: string) => s.split('-').reverse().join('/');

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${d.cor}`}>
          {d.seta} {d.label}
        </span>
        <button
          onClick={() => setModalOpen(true)}
          className="w-4 h-4 inline-flex items-center justify-center rounded-full bg-gray-100 hover:bg-purple-100 text-gray-500 hover:text-purple-600 transition-colors"
          title={`Comparar ${labelKpi} com período anterior`}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Comparativo — {labelKpi}</h3>
                <p className="text-xs text-gray-500">Atual vs período anterior + projeção</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Período atual */}
              <div className="flex items-center justify-between p-4 bg-purple-50 border border-purple-100 rounded-xl">
                <div>
                  <p className="text-xs text-purple-700 uppercase tracking-wide font-semibold">Período atual</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatBR(filtros.dataInicio)} → {formatBR(filtros.dataFim)}</p>
                </div>
                <p className={`text-3xl font-bold ${corBase}`}>{atual.toLocaleString()}</p>
              </div>

              {/* Período anterior */}
              <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <div>
                  <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold">Período anterior</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatBR(filtros.periodoAntInicio)} → {formatBR(filtros.periodoAntFim)}</p>
                </div>
                <p className="text-3xl font-bold text-gray-700">{(anterior ?? 0).toLocaleString()}</p>
              </div>

              {/* Variação */}
              <div className={`flex items-center justify-between p-4 border rounded-xl ${d.cor.replace('text-', 'border-').replace('-600', '-200').replace('-500', '-200').replace('-400', '-200')}`}>
                <div>
                  <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold">Variação</p>
                  <p className="text-xs text-gray-500 mt-0.5">Diferença absoluta: {(atual - (anterior ?? 0)).toLocaleString()}</p>
                </div>
                <p className={`text-3xl font-bold ${d.cor}`}>
                  {d.seta} {d.label}
                </p>
              </div>

              {/* Projeção */}
              {projecao ? (
                <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div>
                    <p className="text-xs text-amber-700 uppercase tracking-wide font-semibold">Projeção fim do período</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Ritmo de {Math.round(atual / projecao.diasDecorridos * 10) / 10}/dia × {projecao.diasTotal} dias
                    </p>
                  </div>
                  <p className="text-3xl font-bold text-amber-600">{projecao.valor.toLocaleString()}</p>
                </div>
              ) : (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-center text-xs text-gray-500">
                  Projeção disponível apenas quando o período inclui o dia atual
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ═══ CardVelocidade — 2 seções: Cadastro→Ativação e Lead TP→Ativação ═══
function CardVelocidade({
  velocidade,
}: {
  velocidade: NonNullable<AnalyticsData['velocidade']>;
}) {
  const renderSecao = (
    v: { media: number | null; mediana: number | null; p75: number | null; amostra: number },
    titulo: string,
    explicacao: string,
    corDestaque: 'amber' | 'blue',
  ) => {
    const semDados = !v || v.amostra === 0;
    const bgDestaque = corDestaque === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200';
    const txtDestaque = corDestaque === 'amber' ? 'text-amber-600' : 'text-blue-600';

    return (
      <div>
        <div className="mb-3">
          <h4 className="text-base font-bold text-gray-800">{titulo}</h4>
          <p className="text-xs text-gray-600 mt-0.5">{explicacao}</p>
        </div>

        {semDados ? (
          <p className="text-sm text-gray-400 text-center py-6 border rounded-xl bg-gray-50">Sem dados no período</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* MEDIANA — destaque */}
            <div className={`${bgDestaque} border rounded-xl p-4`}>
              <div className="flex items-baseline gap-2 mb-1">
                <p className={`text-4xl font-bold ${txtDestaque}`}>{v.mediana}</p>
                <p className="text-sm text-gray-500">dias</p>
              </div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Tempo típico</p>
              <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                Metade dos leads ativa em até <strong>{v.mediana} {v.mediana === 1 ? 'dia' : 'dias'}</strong>. É o número mais confiável — não é afetado por casos extremos.
              </p>
            </div>

            {/* MÉDIA */}
            <div className="bg-white border rounded-xl p-4">
              <div className="flex items-baseline gap-2 mb-1">
                <p className="text-4xl font-bold text-gray-700">{v.media?.toFixed(1)}</p>
                <p className="text-sm text-gray-500">dias</p>
              </div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Média</p>
              <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                Soma todos os dias ÷ total de leads. Útil pra comparar, mas <strong>um lead que demorou 60 dias puxa o número pra cima</strong>.
              </p>
            </div>

            {/* P75 */}
            <div className="bg-white border rounded-xl p-4">
              <div className="flex items-baseline gap-2 mb-1">
                <p className="text-4xl font-bold text-gray-700">{v.p75}</p>
                <p className="text-sm text-gray-500">dias</p>
              </div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Caso mais lento</p>
              <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                <strong>3 de cada 4 leads</strong> ativam em até {v.p75} {v.p75 === 1 ? 'dia' : 'dias'}. Se você quer garantir que <em>quase todo mundo</em> ativa rápido, olha esse número.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card p-5">
      <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-2">
        <Zap className="w-5 h-5 text-amber-500" /> Velocidade de conversão
      </h3>
      <div className="mb-5 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-xs text-gray-700 leading-relaxed">
          <strong className="text-gray-900">O que isso mostra:</strong> quanto tempo, em dias, um lead leva pra se tornar ativo.
          Medimos dois momentos diferentes — quando o lead chega no CRM (cadastro) e quando ele apareceu na planilha de tráfego pago.
          Quanto menor, mais rápido o time está convertendo.
        </p>
      </div>

      <div className="space-y-6">
        {renderSecao(
          velocidade.cadastroAtivacao,
          '📋 Cadastro → Ativação',
          'Conta a partir do dia que o motoboy aparece no CRM (via Playwright). Representa a velocidade geral do time de ativação, independente de onde o lead veio.',
          'amber',
        )}
        {renderSecao(
          velocidade.tpLeadAtivacao,
          '🎯 Lead TP → Ativação',
          'Conta a partir do dia que o lead chegou pela campanha de tráfego pago. Mostra quanto tempo a campanha leva pra converter em ativo.',
          'blue',
        )}
      </div>
    </div>
  );
}

function AnalyticsContent() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataInicio, setDataInicio] = useState(() => { const h = new Date(); return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`; });
  const [dataFim, setDataFim] = useState(() => { const h = new Date(); const u = new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate(); return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(u).padStart(2, '0')}`; });
  const [regiao, setRegiao] = useState('');
  const [regioes, setRegioes] = useState<string[]>([]);
  const { fetchApi } = useApi();

  const carregar = useCallback(async () => {
    setIsLoading(true); setError(null);
    const p = new URLSearchParams(); p.set('dataInicio', dataInicio); p.set('dataFim', dataFim);
    if (regiao) p.set('regiao', regiao);
    const { data: resp, error: err } = await fetchApi(`/api/analytics?${p}`);
    if (err) { setError(err); } else if (resp?.success) {
      setData(resp.data);
      const regs = new Set<string>();
      resp.data.porRegiao?.forEach((r: any) => regs.add(r.regiao));
      resp.data.naoAtivadosPorRegiao?.forEach((r: any) => regs.add(r.regiao));
      resp.data.tpPorRegiao?.forEach((r: any) => regs.add(r.regiao));
      setRegioes(Array.from(regs).sort());
    }
    setIsLoading(false);
  }, [fetchApi, dataInicio, dataFim, regiao]);

  useEffect(() => { carregar(); }, [dataInicio, dataFim, regiao]);

  if (isLoading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-10 h-10 animate-spin text-purple-500" /></div>;
  if (error) return <div className="p-6 bg-red-50 rounded-lg text-red-700 flex items-center gap-2"><AlertCircle className="w-5 h-5" /> {error}</div>;
  if (!data) return null;

  const { kpis, periodoAnterior, velocidade, funil, funil90d, funilTP, funilTP90d, funilTP90dMeta, conversaoOperacao, porRegiao, naoAtivadosPorRegiao, tpPorRegiao, porOperador, porOperadorAlocacao, porDia } = data;

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div><h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><BarChart3 className="w-7 h-7 text-purple-600" /> Analytics</h1><p className="text-sm text-gray-500">Métricas e indicadores do CRM</p></div>
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <span className="text-gray-400">até</span>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <select value={regiao} onChange={e => setRegiao(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">Todas as regiões</option>
            {regioes.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={carregar} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"><RefreshCw className="w-4 h-4" /> Atualizar</button>
        </div>
      </div>

      {/* KPIs — Mortos/Ressuscitados removidos a pedido */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-3xl font-bold text-purple-600">{kpis.totalCadastros.toLocaleString()}</p>
                {periodoAnterior && (
                  <DeltaBotao
                    atual={kpis.totalCadastros}
                    anterior={periodoAnterior.totalCadastros}
                    labelKpi="Total Cadastros"
                    corBase="text-purple-600"
                    filtros={{ dataInicio, dataFim, periodoAntInicio: periodoAnterior.dataInicio, periodoAntFim: periodoAnterior.dataFim }}
                  />
                )}
              </div>
              <p className="text-xs text-gray-500">Total Cadastros</p>
              <p className="text-xs text-gray-400 mt-0.5">Não ativados: {kpis.naoAtivados}</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-6 h-6 text-green-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-3xl font-bold text-green-600">{kpis.totalAtivos.toLocaleString()}</p>
                {periodoAnterior && (
                  <DeltaBotao
                    atual={kpis.totalAtivos}
                    anterior={periodoAnterior.totalAtivos}
                    labelKpi="Ativados"
                    corBase="text-green-600"
                    filtros={{ dataInicio, dataFim, periodoAntInicio: periodoAnterior.dataInicio, periodoAntFim: periodoAnterior.dataFim }}
                  />
                )}
              </div>
              <p className="text-xs text-gray-500">Ativados</p>
              <p className="text-xs text-green-500 mt-0.5">{kpis.taxaConversao}% conversão</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-6 h-6 text-violet-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-3xl font-bold text-violet-600">{kpis.totalAlocados?.toLocaleString() || 0}</p>
                {periodoAnterior && (
                  <DeltaBotao
                    atual={kpis.totalAlocados || 0}
                    anterior={periodoAnterior.totalAlocados}
                    labelKpi="Alocados"
                    corBase="text-violet-600"
                    filtros={{ dataInicio, dataFim, periodoAntInicio: periodoAnterior.dataInicio, periodoAntFim: periodoAnterior.dataFim }}
                  />
                )}
              </div>
              <p className="text-xs text-gray-500">Alocados</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Truck className="w-6 h-6 text-blue-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-3xl font-bold text-blue-600">{kpis.emOperacao}</p>
                {periodoAnterior && (
                  <DeltaBotao
                    atual={kpis.emOperacao}
                    anterior={periodoAnterior.emOperacao}
                    labelKpi="Em Operação"
                    corBase="text-blue-600"
                    filtros={{ dataInicio, dataFim, periodoAntInicio: periodoAnterior.dataInicio, periodoAntFim: periodoAnterior.dataFim }}
                  />
                )}
              </div>
              <p className="text-xs text-gray-500">Em Operação</p>
              <p className="text-xs text-blue-500 mt-0.5">{kpis.taxaOperacao}% taxa real</p>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de contexto: período anterior usado no delta */}
      {periodoAnterior && (
        <div className="text-xs text-gray-500 flex items-center gap-2 px-1">
          <Info className="w-3.5 h-3.5 text-gray-400" />
          Variação comparada ao período anterior de mesma duração:{' '}
          <span className="font-medium text-gray-600">
            {periodoAnterior.dataInicio.split('-').reverse().join('/')}
            {' → '}
            {periodoAnterior.dataFim.split('-').reverse().join('/')}
          </span>
        </div>
      )}

      {/* Velocidade de conversão (Cadastro → Ativação) */}
      {velocidade && <CardVelocidade velocidade={velocidade} />}

      {/* Conversão em Operação */}
      <div className="card p-5 bg-green-50 border border-green-200">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4"><TrendingUp className="w-5 h-5 text-green-600" /> Conversão em Operação <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">BI Tutts</span></h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 border"><p className="text-2xl font-bold">{conversaoOperacao.leadsAtivados}</p><p className="text-xs text-gray-500">Leads Ativados</p></div>
          <div className="bg-white rounded-xl p-4 border"><p className="text-2xl font-bold text-green-600">{conversaoOperacao.emOperacao}</p><p className="text-xs text-green-600">Fazendo entregas</p></div>
          <div className="bg-white rounded-xl p-4 border"><p className="text-2xl font-bold text-red-500">{conversaoOperacao.naoOperando}</p><p className="text-xs text-red-500">Sem entregas</p></div>
          <div className="bg-white rounded-xl p-4 border"><p className="text-2xl font-bold text-blue-600">{conversaoOperacao.taxaReal}%</p><p className="text-xs text-gray-500">Conversão efetiva</p></div>
        </div>
        <div className="mt-4 flex items-center gap-2"><span className="text-xs text-gray-500">Taxa</span><div className="flex-1 h-4 bg-red-200 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: `${conversaoOperacao.taxaReal}%` }} /></div><span className="text-xs font-bold text-green-600">{conversaoOperacao.taxaReal}%</span></div>
      </div>

      {/* Funis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FunilConversaoCard
          funil={funil}
          funil90d={funil90d}
          funil90dMeta={funilTP90dMeta}
          filtros={{ dataInicio, dataFim, regiao }}
        />
        <FunilTPCard funilTP={funilTP} funilTP90d={funilTP90d} funilTP90dMeta={funilTP90dMeta} filtros={{ dataInicio, dataFim, regiao }} />
      </div>

      {/* Regiões */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5"><h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4"><MapPin className="w-5 h-5 text-green-600" /> Ativados por Região <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{porRegiao.reduce((s, r) => s + r.quantidade, 0)} total</span></h3><RegionBars items={porRegiao} colors={COLORS} /></div>
        <div className="card p-5"><h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4"><Tag className="w-5 h-5 text-purple-600" /> TP por Região <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{tpPorRegiao.reduce((s, r) => s + r.quantidade, 0)} total</span></h3><RegionBars items={tpPorRegiao} colors={COLORS} /></div>
      </div>

      {/* Operadores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4"><Zap className="w-5 h-5 text-green-600" /> Ativações por Operador</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-6" style={{ scrollbarGutter: 'stable' }}>
            {porOperador.map((item, i) => { const maxO = porOperador[0]?.quantidade || 1; return (
              <div key={item.operador}>
                <div className="flex justify-between items-center mb-1 gap-3">
                  <span className="text-sm font-medium text-gray-700 truncate" title={item.operador}>{i + 1}. {item.operador}</span>
                  <span className="text-sm font-bold tabular-nums flex-shrink-0 whitespace-nowrap">{item.quantidade.toLocaleString()}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-6 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(item.quantidade / maxO) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} /></div>
              </div>
            ); })}
            {porOperador.length === 0 && <p className="text-gray-400 text-center py-8">Sem dados</p>}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4"><UserPlus className="w-5 h-5 text-violet-600" /> Alocações por Operador</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-6" style={{ scrollbarGutter: 'stable' }}>
            {(porOperadorAlocacao || []).map((item, i) => { const maxO = (porOperadorAlocacao || [])[0]?.quantidade || 1; return (
              <div key={item.operador}>
                <div className="flex justify-between items-center mb-1 gap-3">
                  <span className="text-sm font-medium text-gray-700 truncate" title={item.operador}>{i + 1}. {item.operador}</span>
                  <span className="text-sm font-bold tabular-nums flex-shrink-0 whitespace-nowrap">{item.quantidade.toLocaleString()}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-6 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(item.quantidade / maxO) * 100}%`, backgroundColor: ['#8B5CF6','#7C3AED','#6D28D9','#5B21B6','#4C1D95'][i % 5] }} /></div>
              </div>
            ); })}
            {(!porOperadorAlocacao || porOperadorAlocacao.length === 0) && <p className="text-gray-400 text-center py-8">Sem dados</p>}
          </div>
        </div>
      </div>

      {/* Não Ativados por Região */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4"><XCircle className="w-5 h-5 text-orange-500" /> Não Ativados por Região <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{naoAtivadosPorRegiao.reduce((s, r) => s + r.quantidade, 0)} total</span></h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
            {naoAtivadosPorRegiao.map(item => (<div key={item.regiao} className="bg-orange-50 rounded-lg p-3 text-center border border-orange-100"><p className="text-lg font-bold text-orange-600">{item.quantidade}</p><p className="text-xs text-gray-500 truncate">{item.regiao}</p></div>))}
            {naoAtivadosPorRegiao.length === 0 && <p className="col-span-full text-gray-400 text-center py-8">Sem dados</p>}
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <ChartDia porDia={porDia} />
    </div>
  );
}

export default function AnalyticsPage() { return (<AuthLayout><AnalyticsContent /></AuthLayout>); }
