'use client';

// ===========================================
// Página: /saude-tatiane/supervisao
// Supervisão IA — auditoria de mensagens da Tatiane
// ===========================================

import { useState, useEffect, useCallback } from 'react';
import AuthLayout from '@/components/AuthLayout';
import SaudeTatianeTabs from '@/components/SaudeTatianeTabs';
import { useApi } from '@/lib/hooks';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  MessageSquare,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  Filter,
  GraduationCap,
  BookOpen,
  History,
  RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';

interface Regra {
  id: number;
  nome: string;
  descricao: string | null;
  tipo: 'regex' | 'keywords' | 'mensagem_longa';
  padrao: string;
  severidade: 'info' | 'atencao' | 'critico';
  ativa: boolean;
}

interface ContextoMsg { tipo: string; conteudo: string; quando: string; }
interface FlagEnriquecida {
  flag_key: string;
  session_id: string;
  mensagem_created_at: string;
  conteudo: string;
  trecho_problema?: string;
  regra: { id: number; nome: string; descricao: string | null; severidade: string };
  contexto: ContextoMsg[];
  analise_ia?: { e_problema: boolean; motivo: string; sugestao?: string } | null;
  lead?: { id: number; nome: string | null; telefone: string | null; stage: string | null };
}

function SupervisaoContent() {
  const { fetchApi } = useApi();
  const [horas, setHoras] = useState(24);
  const [usarIA, setUsarIA] = useState(true);
  const [auditando, setAuditando] = useState(false);
  const [flags, setFlags] = useState<FlagEnriquecida[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [filtroSev, setFiltroSev] = useState<'todos' | 'info' | 'atencao' | 'critico'>('todos');
  const [showRegras, setShowRegras] = useState(false);
  const [modalDescon, setModalDescon] = useState<FlagEnriquecida | null>(null);
  const [modalCorrig, setModalCorrig] = useState<FlagEnriquecida | null>(null);

  const auditar = useCallback(async () => {
    setAuditando(true);
    setErro(null);
    const { data, error } = await fetchApi<{ success: boolean; data: any }>(
      '/api/supervisao/auditar',
      { method: 'POST', body: JSON.stringify({ horas, usar_ia: usarIA }) }
    );
    if (error) setErro(error);
    else if (data?.success) {
      setFlags(data.data.flags || []);
      setMeta({
        total_mensagens: data.data.total_mensagens,
        total_regras: data.data.total_regras,
        total_flags_brutas: data.data.total_flags_brutas,
        total_flags_analisadas: data.data.total_flags_analisadas,
        truncado: data.data.truncado,
        ia_disponivel: data.data.ia_disponivel,
      });
    }
    setAuditando(false);
  }, [fetchApi, horas, usarIA]);

  const toggleExpand = (key: string) => {
    setExpandidos(prev => {
      const ns = new Set(prev);
      if (ns.has(key)) ns.delete(key); else ns.add(key);
      return ns;
    });
  };

  const flagsFiltradas = flags.filter(f => filtroSev === 'todos' || f.regra.severidade === filtroSev);
  const counts = {
    todos: flags.length,
    critico: flags.filter(f => f.regra.severidade === 'critico').length,
    atencao: flags.filter(f => f.regra.severidade === 'atencao').length,
    info: flags.filter(f => f.regra.severidade === 'info').length,
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-7 h-7 text-purple-600" />
            Saúde Tatiane
          </h1>
          <p className="text-sm text-gray-600 mt-1">Visão executiva da operação Tutts</p>
        </div>
      </div>

      <SaudeTatianeTabs />

      {/* PAINEL DE CONTROLE */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-purple-600" />
              Auditoria de conversas da Tatiane
            </h2>
            <p className="text-xs text-gray-600">
              Aplica regras de detecção e usa Gemini pra analisar contexto. Tatiane <strong>continua rodando normalmente</strong> durante a auditoria.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Período:</span>
              <select
                value={horas}
                onChange={(e) => setHoras(parseInt(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                disabled={auditando}
              >
                <option value={6}>Últimas 6h</option>
                <option value={12}>Últimas 12h</option>
                <option value={24}>Últimas 24h</option>
                <option value={48}>Últimas 48h</option>
                <option value={168}>Últimos 7 dias</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={usarIA}
                onChange={(e) => setUsarIA(e.target.checked)}
                disabled={auditando}
                className="rounded"
              />
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              Usar Gemini
            </label>
            <button
              onClick={() => setShowRegras(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={auditando}
            >
              <Settings className="w-4 h-4" />
              Regras
            </button>
            <button
              onClick={auditar}
              disabled={auditando}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-gray-300"
            >
              {auditando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {auditando ? 'Auditando...' : 'Auditar agora'}
            </button>
          </div>
        </div>

        {meta && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <MetaItem label="Mensagens analisadas" valor={meta.total_mensagens} />
            <MetaItem label="Regras ativas" valor={meta.total_regras} />
            <MetaItem label="Flags brutas" valor={meta.total_flags_brutas} />
            <MetaItem label="Analisadas pela IA" valor={meta.total_flags_analisadas} />
            <MetaItem label="Gemini disponível" valor={meta.ia_disponivel ? '✓' : '✗'} />
          </div>
        )}
      </div>

      {erro && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 mb-4">
          <AlertCircle className="w-5 h-5" /> {erro}
        </div>
      )}

      {/* FILTROS DE SEVERIDADE */}
      {flags.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase">Filtrar:</span>
          <FiltroChip ativo={filtroSev === 'todos'} onClick={() => setFiltroSev('todos')} cor="gray" label="Todos" count={counts.todos} />
          <FiltroChip ativo={filtroSev === 'critico'} onClick={() => setFiltroSev('critico')} cor="red" label="Críticos" count={counts.critico} />
          <FiltroChip ativo={filtroSev === 'atencao'} onClick={() => setFiltroSev('atencao')} cor="amber" label="Atenção" count={counts.atencao} />
          <FiltroChip ativo={filtroSev === 'info'} onClick={() => setFiltroSev('info')} cor="blue" label="Info" count={counts.info} />
        </div>
      )}

      {/* LISTA DE FLAGS */}
      {!auditando && flags.length === 0 && meta && (
        <div className="p-8 bg-green-50 border border-green-200 rounded-lg text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-green-900 font-semibold">Nenhum problema detectado</p>
          <p className="text-sm text-green-700 mt-1">Tatiane está respondendo dentro dos parâmetros.</p>
        </div>
      )}

      {!auditando && flags.length === 0 && !meta && (
        <div className="p-8 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500">
          <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-medium">Pronto para auditar</p>
          <p className="text-sm mt-1">Clique em "Auditar agora" pra começar a análise das conversas.</p>
        </div>
      )}

      <div className="space-y-3">
        {flagsFiltradas.map((f) => (
          <FlagCard
            key={f.flag_key}
            flag={f}
            expandido={expandidos.has(f.flag_key)}
            onToggle={() => toggleExpand(f.flag_key)}
            onDesconsiderar={() => setModalDescon(f)}
            onCorrigir={() => setModalCorrig(f)}
          />
        ))}
      </div>

      {/* MODAIS */}
      {showRegras && <ModalRegras onClose={() => setShowRegras(false)} />}
      {modalDescon && (
        <ModalDesconsiderar
          flag={modalDescon}
          onClose={() => setModalDescon(null)}
          onSucesso={() => {
            setFlags(prev => prev.filter(f => f.flag_key !== modalDescon.flag_key));
            setModalDescon(null);
          }}
        />
      )}
      {modalCorrig && (
        <ModalCorrigir
          flag={modalCorrig}
          onClose={() => setModalCorrig(null)}
          onSucesso={() => {
            setFlags(prev => prev.filter(f => f.flag_key !== modalCorrig.flag_key));
            setModalCorrig(null);
          }}
        />
      )}
    </div>
  );
}

function MetaItem({ label, valor }: { label: string; valor: any }) {
  return (
    <div>
      <p className="text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-base font-bold text-gray-900">{valor}</p>
    </div>
  );
}

function FiltroChip({ ativo, onClick, cor, label, count }: { ativo: boolean; onClick: () => void; cor: 'gray' | 'red' | 'amber' | 'blue'; label: string; count: number }) {
  const corMap = {
    gray: { ativo: 'bg-gray-900 text-white', inativo: 'bg-gray-100 text-gray-700' },
    red: { ativo: 'bg-red-600 text-white', inativo: 'bg-red-50 text-red-700' },
    amber: { ativo: 'bg-amber-600 text-white', inativo: 'bg-amber-50 text-amber-700' },
    blue: { ativo: 'bg-blue-600 text-white', inativo: 'bg-blue-50 text-blue-700' },
  };
  return (
    <button onClick={onClick} className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium', ativo ? corMap[cor].ativo : corMap[cor].inativo)}>
      {label} <span className="opacity-75">{count}</span>
    </button>
  );
}

function FlagCard({ flag, expandido, onToggle, onDesconsiderar, onCorrigir }: {
  flag: FlagEnriquecida;
  expandido: boolean;
  onToggle: () => void;
  onDesconsiderar: () => void;
  onCorrigir: () => void;
}) {
  const sev = flag.regra.severidade;
  const cores = {
    critico: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600', text: 'text-red-900' },
    atencao: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600', text: 'text-amber-900' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', text: 'text-blue-900' },
  };
  const c = cores[sev as keyof typeof cores] || cores.info;
  const Icon = sev === 'critico' ? AlertCircle : sev === 'atencao' ? AlertTriangle : Info;
  const iaDiz = flag.analise_ia;
  const iaConfirma = iaDiz?.e_problema === true;
  const iaDescarta = iaDiz?.e_problema === false;

  return (
    <div className={clsx('border rounded-lg overflow-hidden', c.bg, c.border)}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <Icon className={clsx('w-5 h-5 flex-shrink-0 mt-0.5', c.icon)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <p className={clsx('font-semibold text-sm', c.text)}>{flag.regra.nome}</p>
              <div className="flex items-center gap-2">
                {iaConfirma && (
                  <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">⚠ IA confirma problema</span>
                )}
                {iaDescarta && (
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">✓ IA: falso positivo</span>
                )}
                {!iaDiz && (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">sem IA</span>
                )}
              </div>
            </div>

            {flag.lead && (
              <p className="text-xs text-gray-600 mb-2">
                Lead <span className="font-mono">#{flag.lead.id}</span>
                {flag.lead.nome && ` · ${flag.lead.nome}`}
                {flag.lead.telefone && ` · ${flag.lead.telefone}`}
                {flag.lead.stage && (
                  <span className="ml-2 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">{flag.lead.stage}</span>
                )}
              </p>
            )}

            {flag.trecho_problema && (
              <p className="text-xs text-gray-700 mb-2">
                <span className="font-medium">Trecho:</span> <code className="bg-white px-1.5 py-0.5 rounded border border-gray-200">{flag.trecho_problema}</code>
              </p>
            )}

            <div className="bg-white border border-gray-200 rounded p-3 mb-2 text-sm text-gray-800">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                <MessageSquare className="w-3 h-3" /> Tatiane disse:
              </div>
              <p className="whitespace-pre-wrap">{flag.conteudo}</p>
            </div>

            {iaDiz && (
              <div className={clsx('rounded p-3 text-sm border mt-2', iaConfirma ? 'bg-red-100/50 border-red-200 text-red-900' : 'bg-green-100/50 border-green-200 text-green-900')}>
                <p className="text-xs font-semibold mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Análise da IA
                </p>
                <p>{iaDiz.motivo}</p>
                {iaDiz.sugestao && (
                  <p className="mt-2 pt-2 border-t border-current/20">
                    <span className="font-semibold">Sugestão:</span> {iaDiz.sugestao}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={onDesconsiderar}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-50"
                title="Criar exceção: mensagens com padrão similar serão ignoradas no futuro"
              >
                <Filter className="w-3 h-3" />
                Desconsiderar contexto
              </button>
              <button
                onClick={onCorrigir}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 text-red-700 rounded-lg text-xs font-medium hover:bg-red-50"
                title="É problema real — escrever lição pra Tatiane"
              >
                <GraduationCap className="w-3 h-3" />
                Corrigir Tatiane
              </button>
              <button
                onClick={onToggle}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
              >
                {expandido ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expandido ? 'Ocultar' : 'Ver'} contexto ({flag.contexto.length} msgs)
              </button>
              <span className="ml-auto text-xs text-gray-400">
                <Clock className="w-3 h-3 inline mr-1" />
                {new Date(flag.mensagem_created_at).toLocaleString('pt-BR', { timeZone: 'America/Bahia' })}
              </span>
            </div>

            {expandido && flag.contexto.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                {flag.contexto.map((m, i) => (
                  <div key={i} className={clsx('p-2 rounded text-xs', m.tipo === 'human' ? 'bg-gray-100 text-gray-800' : 'bg-purple-50 text-purple-900 border border-purple-100')}>
                    <p className="font-semibold mb-0.5">{m.tipo === 'human' ? 'LEAD' : 'TATIANE'}</p>
                    <p className="whitespace-pre-wrap">{m.conteudo}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MODAL DE REGRAS
// ============================================
function ModalRegras({ onClose }: { onClose: () => void }) {
  const { fetchApi } = useApi();
  const [regras, setRegras] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNova, setShowNova] = useState(false);

  // form nova
  const [novaNome, setNovaNome] = useState('');
  const [novaDesc, setNovaDesc] = useState('');
  const [novaTipo, setNovaTipo] = useState<'regex' | 'keywords' | 'mensagem_longa'>('keywords');
  const [novaPadrao, setNovaPadrao] = useState('');
  const [novaSev, setNovaSev] = useState<'info' | 'atencao' | 'critico'>('atencao');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchApi<{ success: boolean; data: Regra[] }>('/api/supervisao/regras');
    if (data?.success) setRegras(data.data);
    setLoading(false);
  }, [fetchApi]);

  useEffect(() => { carregar(); }, [carregar]);

  const toggleAtiva = async (r: Regra) => {
    await fetchApi(`/api/supervisao/regras/${r.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ativa: !r.ativa }),
    });
    carregar();
  };

  const remover = async (r: Regra) => {
    if (!confirm(`Remover regra "${r.nome}"?`)) return;
    await fetchApi(`/api/supervisao/regras/${r.id}`, { method: 'DELETE' });
    carregar();
  };

  const criar = async () => {
    if (!novaNome.trim() || !novaPadrao.trim()) return;
    setSalvando(true);
    const { error } = await fetchApi('/api/supervisao/regras', {
      method: 'POST',
      body: JSON.stringify({
        nome: novaNome,
        descricao: novaDesc || null,
        tipo: novaTipo,
        padrao: novaPadrao,
        severidade: novaSev,
      }),
    });
    setSalvando(false);
    if (!error) {
      setNovaNome(''); setNovaDesc(''); setNovaPadrao(''); setNovaSev('atencao'); setNovaTipo('keywords');
      setShowNova(false);
      carregar();
    } else {
      alert('Erro: ' + error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5" /> Regras de detecção
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-4 flex-1">
          {loading ? (
            <div className="text-center py-8 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                {regras.map(r => (
                  <div key={r.id} className={clsx('p-3 border rounded-lg', r.ativa ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900">{r.nome}</span>
                          <span className={clsx('text-xs px-1.5 py-0.5 rounded',
                            r.severidade === 'critico' ? 'bg-red-100 text-red-700' :
                            r.severidade === 'atencao' ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700')}>{r.severidade}</span>
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{r.tipo}</span>
                        </div>
                        {r.descricao && <p className="text-xs text-gray-600 mb-1">{r.descricao}</p>}
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 break-all">{r.padrao}</code>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => toggleAtiva(r)} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">
                          {r.ativa ? 'Desativar' : 'Ativar'}
                        </button>
                        <button onClick={() => remover(r)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Remover">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {!showNova ? (
                <button onClick={() => setShowNova(true)} className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Adicionar nova regra
                </button>
              ) : (
                <div className="border border-purple-200 bg-purple-50/50 rounded-lg p-4 space-y-3">
                  <h4 className="font-semibold text-sm">Nova regra</h4>
                  <input value={novaNome} onChange={e => setNovaNome(e.target.value)} placeholder="Nome (ex: Mencionou taxa)" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                  <input value={novaDesc} onChange={e => setNovaDesc(e.target.value)} placeholder="Descrição (opcional)" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={novaTipo} onChange={e => setNovaTipo(e.target.value as any)} className="border border-gray-300 rounded px-3 py-2 text-sm">
                      <option value="keywords">Keywords (separadas por vírgula)</option>
                      <option value="regex">Regex</option>
                      <option value="mensagem_longa">Mensagem longa (limite chars)</option>
                    </select>
                    <select value={novaSev} onChange={e => setNovaSev(e.target.value as any)} className="border border-gray-300 rounded px-3 py-2 text-sm">
                      <option value="info">Severidade: Info</option>
                      <option value="atencao">Severidade: Atenção</option>
                      <option value="critico">Severidade: Crítico</option>
                    </select>
                  </div>
                  <input
                    value={novaPadrao}
                    onChange={e => setNovaPadrao(e.target.value)}
                    placeholder={
                      novaTipo === 'keywords' ? 'palavra1, palavra2, palavra3' :
                      novaTipo === 'regex' ? 'expressão regex (ex: R\\$\\s*\\d+)' :
                      'limite em caracteres (ex: 500)'
                    }
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowNova(false)} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-white">Cancelar</button>
                    <button onClick={criar} disabled={salvando || !novaNome.trim() || !novaPadrao.trim()} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300">
                      {salvando ? 'Salvando...' : 'Criar regra'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// MODAL DESCONSIDERAR (cria exceção regex)
// ============================================
function ModalDesconsiderar({ flag, onClose, onSucesso }: {
  flag: FlagEnriquecida;
  onClose: () => void;
  onSucesso: () => void;
}) {
  const { fetchApi } = useApi();
  const [nome, setNome] = useState('');
  const [padrao, setPadrao] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Sugere um padrão baseado no trecho
  useEffect(() => {
    if (flag.trecho_problema) {
      // Pega contexto ao redor do trecho na mensagem
      const trecho = flag.trecho_problema;
      const idx = flag.conteudo.toLowerCase().indexOf(trecho.toLowerCase());
      if (idx >= 0) {
        const inicio = Math.max(0, idx - 30);
        const fim = Math.min(flag.conteudo.length, idx + trecho.length + 30);
        const contexto = flag.conteudo.slice(inicio, fim);
        setPadrao(`(?i)sem.{0,5}${trecho}|sem v.nculo.{0,20}${trecho}`);
        setDescricao(`Quando aparecer "${trecho}" no contexto: "${contexto.trim()}"`);
        setNome(`"${trecho}" em contexto explicativo`);
      }
    }
  }, [flag]);

  const salvar = async () => {
    if (!nome.trim() || !padrao.trim()) return;
    setSalvando(true); setErro(null);

    // Valida regex
    try { new RegExp(padrao, 'i'); }
    catch (e: any) { setErro(`Regex inválida: ${e.message}`); setSalvando(false); return; }

    const { error } = await fetchApi('/api/supervisao/desconsiderar', {
      method: 'POST',
      body: JSON.stringify({
        regra_id: flag.regra.id,
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        padrao_regex: padrao.trim(),
        flag_key_atual: flag.flag_key,
        session_id: flag.session_id,
        mensagem_created_at: flag.mensagem_created_at,
      }),
    });
    setSalvando(false);
    if (error) setErro(error);
    else onSucesso();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Filter className="w-5 h-5 text-amber-600" /> Desconsiderar este contexto
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-4 flex-1 space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
            <p className="font-semibold text-amber-900 mb-1">Como funciona?</p>
            <p className="text-amber-800 text-xs">
              Você está dizendo que essa regra ({flag.regra.nome}) <strong>não deve disparar</strong> em
              mensagens com o padrão abaixo. Toda mensagem futura que case com esse regex será
              automaticamente desconsiderada para essa regra.
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs">
            <p className="font-semibold text-gray-700 mb-1">Mensagem original da Tatiane:</p>
            <p className="text-gray-600 italic">{flag.conteudo.slice(0, 300)}{flag.conteudo.length > 300 ? '…' : ''}</p>
            <p className="mt-2 text-gray-700">
              <span className="font-semibold">Trecho que disparou:</span> <code className="bg-white px-1 rounded">{flag.trecho_problema}</code>
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700">Nome da exceção</label>
            <input value={nome} onChange={e => setNome(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1"
              placeholder="Ex: 'CLT' em contexto explicativo" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700">Padrão regex</label>
            <input value={padrao} onChange={e => setPadrao(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 font-mono"
              placeholder="(?i)sem.{0,5}CLT|sem v.nculo" />
            <p className="text-xs text-gray-500 mt-1">Regex JS. Quando casar com a mensagem, descarta a flag.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700">Descrição (opcional)</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1"
              placeholder="Quando essa exceção se aplica?" />
          </div>

          {erro && <div className="text-sm text-red-600">{erro}</div>}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancelar</button>
          <button onClick={salvar} disabled={salvando || !nome.trim() || !padrao.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:bg-gray-300">
            {salvando && <Loader2 className="w-3 h-3 animate-spin" />}
            Criar exceção
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MODAL CORRIGIR (cria correção pendente)
// ============================================
function ModalCorrigir({ flag, onClose, onSucesso }: {
  flag: FlagEnriquecida;
  onClose: () => void;
  onSucesso: () => void;
}) {
  const { fetchApi } = useApi();
  const [licao, setLicao] = useState('');
  const [secao, setSecao] = useState<'regras_ouro' | 'fora_escopo' | 'fluxo' | 'outro'>('regras_ouro');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Pré-popula com sugestão da IA se tiver
  useEffect(() => {
    if (flag.analise_ia?.sugestao) {
      setLicao(flag.analise_ia.sugestao);
    } else if (flag.analise_ia?.motivo) {
      setLicao(`Não fazer: ${flag.analise_ia.motivo}`);
    }
  }, [flag]);

  const salvar = async () => {
    if (!licao.trim()) return;
    setSalvando(true); setErro(null);
    const { error } = await fetchApi('/api/supervisao/correcoes', {
      method: 'POST',
      body: JSON.stringify({
        licao: licao.trim(),
        secao,
        flag_key: flag.flag_key,
        session_id: flag.session_id,
        mensagem_problematica: flag.conteudo,
      }),
    });
    setSalvando(false);
    if (error) setErro(error);
    else onSucesso();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-red-600" /> Corrigir Tatiane
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-4 flex-1 space-y-3">
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm">
            <p className="font-semibold text-red-900 mb-1">Importante</p>
            <p className="text-red-800 text-xs">
              Sua lição vai pra <strong>fila de correções pendentes</strong>. Ela só será aplicada
              ao prompt da Tatiane quando você clicar em <strong>"Aplicar correções"</strong> na
              aba <strong>Lições e Versões</strong>.
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs">
            <p className="font-semibold text-gray-700 mb-1">Tatiane disse (problema):</p>
            <p className="text-gray-600 whitespace-pre-wrap">{flag.conteudo.slice(0, 400)}{flag.conteudo.length > 400 ? '…' : ''}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700">Lição (regra clara em 1-2 linhas)</label>
            <textarea value={licao} onChange={e => setLicao(e.target.value)} rows={3} className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1"
              placeholder='Ex: "NUNCA mencione valor R$ específico de corrida — diga apenas que varia conforme a entrega"' />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-700">Onde inserir no prompt</label>
            <select value={secao} onChange={e => setSecao(e.target.value as any)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1">
              <option value="regras_ouro">Regras de Ouro (recomendado pra "nunca / sempre")</option>
              <option value="fora_escopo">Fora de Escopo</option>
              <option value="fluxo">Fluxo Obrigatório</option>
              <option value="outro">Lições Aprendidas (seção nova)</option>
            </select>
          </div>

          {erro && <div className="text-sm text-red-600">{erro}</div>}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancelar</button>
          <button onClick={salvar} disabled={salvando || !licao.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300">
            {salvando && <Loader2 className="w-3 h-3 animate-spin" />}
            Adicionar à fila de correções
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SupervisaoPage() {
  return (
    <AuthLayout>
      <SupervisaoContent />
    </AuthLayout>
  );
}
