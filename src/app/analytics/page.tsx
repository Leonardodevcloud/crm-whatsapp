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
  funil: Array<{ stage: string; quantidade: number; cor: string; base: number }>;
  funilTP: Array<{ stage: string; quantidade: number; cor: string; base: number }>;
  funilTP90d?: Array<{ stage: string; quantidade: number; cor: string; base: number }>;
  funilTP90dMeta?: { dataInicio: string; dataFim: string; janela: string };
  conversaoOperacao: { leadsAtivados: number; emOperacao: number; naoOperando: number; taxaReal: number };
  porRegiao: Array<{ regiao: string; quantidade: number }>;
  naoAtivadosPorRegiao: Array<{ regiao: string; quantidade: number }>;
  tpPorRegiao: Array<{ regiao: string; quantidade: number }>;
  porOperador: Array<{ operador: string; quantidade: number }>;
  porOperadorAlocacao: Array<{ operador: string; quantidade: number }>;
  porDia: Array<{ data: string; cadastros: number; leadsCrm: number }>;
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
function ChartDia({ porDia }: { porDia: Array<{ data: string; cadastros: number; leadsCrm: number }> }) {
  const [tip, setTip] = useState<{ x: number; y: number; d: typeof porDia[0] } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const CHART_H = 300;
  const maxDia = Math.max(...porDia.map(d => d.cadastros + d.leadsCrm), 1);

  return (
    <div className="card p-6" ref={chartRef}>
      <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-1"><Calendar className="w-5 h-5 text-teal-600" /> Cadastros por Dia</h3>
      <div className="flex items-center gap-5 mb-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-teal-500 inline-block" /> Cadastros (Mapp)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-purple-500 inline-block" /> Leads CRM</span>
      </div>

      {/* Tooltip portal */}
      {tip && (
        <div style={{ position: 'fixed', left: tip.x, top: tip.y, transform: 'translate(-50%, -100%)', zIndex: 9999, pointerEvents: 'none' }}>
          <div style={{ background: '#111827', color: '#fff', fontSize: '12px', borderRadius: '8px', padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 700 }}>{tip.d.data.split('-')[2]}/{tip.d.data.split('-')[1]}</div>
            <div>Cadastros: <span style={{ color: '#2DD4BF', fontWeight: 700 }}>{tip.d.cadastros}</span></div>
            <div>CRM: <span style={{ color: '#C084FC', fontWeight: 700 }}>{tip.d.leadsCrm}</span></div>
            <div style={{ borderTop: '1px solid #374151', marginTop: 4, paddingTop: 4, fontWeight: 700 }}>Total: {tip.d.cadastros + tip.d.leadsCrm}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}><span style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #111827' }} /></div>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="flex items-end gap-1 pb-8" style={{ height: `${CHART_H + 60}px`, minWidth: `${porDia.length * 36}px` }}>
          {porDia.map((item, idx) => {
            const total = item.cadastros + item.leadsCrm;
            const barH = maxDia > 0 ? Math.round((total / maxDia) * CHART_H) : 0;
            const cadastroH = total > 0 ? Math.round((item.cadastros / total) * barH) : 0;
            const crmH = barH - cadastroH;
            const dia = item.data.split('-')[2];
            const mes = item.data.split('-')[1];

            return (
              <div key={item.data} className="flex flex-col items-center flex-1 min-w-[30px] cursor-pointer"
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTip({ x: rect.left + rect.width / 2, y: rect.top - 8, d: item });
                }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTip({ x: rect.left + rect.width / 2, y: rect.top - 8, d: item });
                }}
                onMouseLeave={() => setTip(null)}>
                {total > 0 && <span className="text-[11px] font-semibold text-gray-600 mb-1">{total}</span>}
                <div className="w-full flex flex-col justify-end rounded-t-md overflow-hidden" style={{ height: `${Math.max(barH, 2)}px` }}>
                  {cadastroH > 0 && <div className="w-full bg-teal-500 hover:bg-teal-400 transition-colors" style={{ height: `${cadastroH}px` }} />}
                  {crmH > 0 && <div className="w-full bg-purple-500 hover:bg-purple-400 transition-colors" style={{ height: `${crmH}px` }} />}
                  {total === 0 && <div className="w-full bg-gray-200" style={{ height: '2px' }} />}
                </div>
                <span className="text-[10px] text-gray-400 mt-2">{dia}/{mes}</span>
              </div>
            );
          })}
        </div>
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

  const { kpis, funil, funilTP, funilTP90d, funilTP90dMeta, conversaoOperacao, porRegiao, naoAtivadosPorRegiao, tpPorRegiao, porOperador, porOperadorAlocacao, porDia } = data;

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
        <div className="card p-5"><div className="flex items-center gap-3"><div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center"><Users className="w-6 h-6 text-purple-600" /></div><div><p className="text-3xl font-bold text-purple-600">{kpis.totalCadastros.toLocaleString()}</p><p className="text-xs text-gray-500">Total Cadastros</p><p className="text-xs text-gray-400 mt-0.5">Não ativados: {kpis.naoAtivados}</p></div></div></div>
        <div className="card p-5"><div className="flex items-center gap-3"><div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center"><UserCheck className="w-6 h-6 text-green-600" /></div><div><p className="text-3xl font-bold text-green-600">{kpis.totalAtivos.toLocaleString()}</p><p className="text-xs text-gray-500">Ativados</p><p className="text-xs text-green-500 mt-0.5">{kpis.taxaConversao}% conversão</p></div></div></div>
        <div className="card p-5"><div className="flex items-center gap-3"><div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center"><UserPlus className="w-6 h-6 text-violet-600" /></div><div><p className="text-3xl font-bold text-violet-600">{kpis.totalAlocados?.toLocaleString() || 0}</p><p className="text-xs text-gray-500">Alocados</p></div></div></div>
        <div className="card p-5"><div className="flex items-center gap-3"><div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center"><Truck className="w-6 h-6 text-blue-600" /></div><div><p className="text-3xl font-bold text-blue-600">{kpis.emOperacao}</p><p className="text-xs text-gray-500">Em Operação</p><p className="text-xs text-blue-500 mt-0.5">{kpis.taxaOperacao}% taxa real</p></div></div></div>
      </div>

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
        <div className="card p-5"><h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4"><TrendingUp className="w-5 h-5 text-indigo-600" /> Funil de Conversão</h3><FunnelBar items={funil} maxVal={funil[0]?.quantidade || 1} funil="conversao" filtros={{ dataInicio, dataFim, regiao }} /></div>
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
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {porOperador.map((item, i) => { const maxO = porOperador[0]?.quantidade || 1; return (
              <div key={item.operador}><div className="flex justify-between items-center mb-1"><span className="text-sm font-medium text-gray-700">{i + 1}. {item.operador}</span><span className="text-sm font-bold">{item.quantidade}</span></div>
                <div className="w-full bg-gray-100 rounded-full h-6 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(item.quantidade / maxO) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} /></div></div>
            ); })}
            {porOperador.length === 0 && <p className="text-gray-400 text-center py-8">Sem dados</p>}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4"><UserPlus className="w-5 h-5 text-violet-600" /> Alocações por Operador</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {(porOperadorAlocacao || []).map((item, i) => { const maxO = (porOperadorAlocacao || [])[0]?.quantidade || 1; return (
              <div key={item.operador}><div className="flex justify-between items-center mb-1"><span className="text-sm font-medium text-gray-700">{i + 1}. {item.operador}</span><span className="text-sm font-bold">{item.quantidade}</span></div>
                <div className="w-full bg-gray-100 rounded-full h-6 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(item.quantidade / maxO) * 100}%`, backgroundColor: ['#8B5CF6','#7C3AED','#6D28D9','#5B21B6','#4C1D95'][i % 5] }} /></div></div>
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
