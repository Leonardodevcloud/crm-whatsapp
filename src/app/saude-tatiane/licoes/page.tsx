'use client';

// ===========================================
// Página: /saude-tatiane/licoes
// Lições pendentes + Histórico de versões do prompt
// ===========================================

import { useState, useEffect, useCallback } from 'react';
import AuthLayout from '@/components/AuthLayout';
import SaudeTatianeTabs from '@/components/SaudeTatianeTabs';
import { useApi } from '@/lib/hooks';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  History as HistoryIcon,
  Info,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import clsx from 'clsx';

const SECAO_LABELS: Record<string, string> = {
  regras_ouro: 'Regras de Ouro',
  fora_escopo: 'Fora de Escopo',
  fluxo: 'Fluxo Obrigatório',
  outro: 'Lições Aprendidas',
};

interface Correcao {
  id: number;
  flag_key: string | null;
  session_id: string | null;
  mensagem_problematica: string | null;
  licao: string;
  secao: string;
  status: 'pendente' | 'aplicada' | 'descartada';
  criado_em: string;
  criado_por: string | null;
  aplicada_em: string | null;
  versao_prompt_resultante: number | null;
}

interface Versao {
  id: number;
  versao: number;
  ativa: boolean;
  criado_em: string;
  criado_por: string | null;
  resumo_mudancas: string | null;
  correcoes_aplicadas: number[] | null;
}

function LicoesContent() {
  const { fetchApi } = useApi();
  const [tab, setTab] = useState<'pendentes' | 'aplicadas' | 'versoes'>('pendentes');

  const [correcoes, setCorrecoes] = useState<Correcao[]>([]);
  const [totais, setTotais] = useState({ pendente: 0, aplicada: 0, descartada: 0 });
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [loading, setLoading] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [revertendo, setRevertendo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [previewVersao, setPreviewVersao] = useState<Versao | null>(null);
  const [confirmarRevert, setConfirmarRevert] = useState<Versao | null>(null);
  const [resultadoAplicacao, setResultadoAplicacao] = useState<any>(null);

  const carregarCorrecoes = useCallback(async (status: string) => {
    setLoading(true);
    const { data, error } = await fetchApi<{ success: boolean; data: Correcao[]; totais: any }>(
      `/api/supervisao/correcoes?status=${status}`
    );
    if (error) setErro(error);
    else if (data?.success) {
      setCorrecoes(data.data);
      setTotais(data.totais || { pendente: 0, aplicada: 0, descartada: 0 });
    }
    setLoading(false);
  }, [fetchApi]);

  const carregarVersoes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchApi<{ success: boolean; data: Versao[] }>(
      '/api/supervisao/prompt-versoes'
    );
    if (error) setErro(error);
    else if (data?.success) setVersoes(data.data);
    setLoading(false);
  }, [fetchApi]);

  useEffect(() => {
    setErro(null);
    if (tab === 'pendentes') carregarCorrecoes('pendente');
    else if (tab === 'aplicadas') carregarCorrecoes('aplicada');
    else carregarVersoes();
  }, [tab, carregarCorrecoes, carregarVersoes]);

  const toggleSel = (id: number) => {
    setSelecionadas(prev => {
      const ns = new Set(prev);
      if (ns.has(id)) ns.delete(id); else ns.add(id);
      return ns;
    });
  };

  const selecionarTodas = () => {
    if (selecionadas.size === correcoes.length) setSelecionadas(new Set());
    else setSelecionadas(new Set(correcoes.map(c => c.id)));
  };

  const aplicarCorrecoes = async () => {
    const ids = Array.from(selecionadas);
    if (ids.length === 0) {
      if (!confirm(`Aplicar TODAS as ${correcoes.length} correções pendentes ao prompt da Tatiane?`)) return;
    } else {
      if (!confirm(`Aplicar ${ids.length} correções selecionadas ao prompt da Tatiane?`)) return;
    }

    setAplicando(true); setErro(null);
    const { data, error } = await fetchApi<{ success: boolean; data: any }>(
      '/api/supervisao/correcoes/aplicar',
      { method: 'POST', body: JSON.stringify({ ids: ids.length > 0 ? ids : undefined }) }
    );
    setAplicando(false);

    if (error) {
      setErro(error);
    } else if (data?.success) {
      setResultadoAplicacao(data.data);
      setSelecionadas(new Set());
      await carregarCorrecoes('pendente');
    }
  };

  const reverter = async (versao: Versao) => {
    setRevertendo(versao.id); setErro(null);
    const { error } = await fetchApi('/api/supervisao/prompt-versoes', {
      method: 'POST',
      body: JSON.stringify({ versao_id: versao.id }),
    });
    setRevertendo(null);
    setConfirmarRevert(null);
    if (error) setErro(error);
    else await carregarVersoes();
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Activity className="w-7 h-7 text-purple-600" />
          Saúde Tatiane
        </h1>
        <p className="text-sm text-gray-600 mt-1">Visão executiva da operação Tutts</p>
      </div>

      <SaudeTatianeTabs />

      {/* SUB-NAV INTERNA */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setTab('pendentes')}
          className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
            tab === 'pendentes' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100')}>
          <Clock className="w-3.5 h-3.5" /> Pendentes <span className="opacity-75">{totais.pendente}</span>
        </button>
        <button
          onClick={() => setTab('aplicadas')}
          className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
            tab === 'aplicadas' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100')}>
          <CheckCircle2 className="w-3.5 h-3.5" /> Aplicadas <span className="opacity-75">{totais.aplicada}</span>
        </button>
        <button
          onClick={() => setTab('versoes')}
          className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
            tab === 'versoes' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
          <HistoryIcon className="w-3.5 h-3.5" /> Versões do prompt
        </button>
      </div>

      {erro && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 mb-4">
          <AlertCircle className="w-5 h-5" /> {erro}
        </div>
      )}

      {resultadoAplicacao && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="font-semibold text-green-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> Correções aplicadas com sucesso
              </p>
              <p className="text-sm text-green-800 mt-1">
                {resultadoAplicacao.correcoes_aplicadas} correções → versão v{resultadoAplicacao.versao_anterior} → <strong>v{resultadoAplicacao.versao_nova}</strong>
                {' '}· prompt agora tem {resultadoAplicacao.prompt_chars} chars
              </p>
              {resultadoAplicacao.aviso && (
                <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {resultadoAplicacao.aviso}
                </p>
              )}
              <p className="text-xs text-green-700 mt-2">
                A Tatiane vai usar a nova versão dentro de 5 minutos (cache).
              </p>
            </div>
            <button onClick={() => setResultadoAplicacao(null)} className="p-1 hover:bg-green-100 rounded">
              <X className="w-4 h-4 text-green-700" />
            </button>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA TAB */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : tab === 'pendentes' ? (
        <PendentesTab
          correcoes={correcoes}
          selecionadas={selecionadas}
          aplicando={aplicando}
          onToggleSel={toggleSel}
          onSelTodas={selecionarTodas}
          onAplicar={aplicarCorrecoes}
        />
      ) : tab === 'aplicadas' ? (
        <AplicadasTab correcoes={correcoes} />
      ) : (
        <VersoesTab
          versoes={versoes}
          onPreview={setPreviewVersao}
          onReverter={setConfirmarRevert}
          revertendo={revertendo}
        />
      )}

      {/* MODAIS */}
      {previewVersao && <ModalPreviewVersao versao={previewVersao} onClose={() => setPreviewVersao(null)} />}
      {confirmarRevert && (
        <ModalConfirmarRevert
          versao={confirmarRevert}
          onConfirm={() => reverter(confirmarRevert)}
          onClose={() => setConfirmarRevert(null)}
          revertendo={revertendo === confirmarRevert.id}
        />
      )}
    </div>
  );
}

// ============================================
// TAB: Pendentes
// ============================================
function PendentesTab({ correcoes, selecionadas, aplicando, onToggleSel, onSelTodas, onAplicar }: {
  correcoes: Correcao[];
  selecionadas: Set<number>;
  aplicando: boolean;
  onToggleSel: (id: number) => void;
  onSelTodas: () => void;
  onAplicar: () => void;
}) {
  if (correcoes.length === 0) {
    return (
      <div className="p-8 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500">
        <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="font-medium">Nenhuma correção pendente</p>
        <p className="text-sm mt-1">Quando você marcar "Corrigir Tatiane" em alguma flag da Supervisão IA, ela aparece aqui.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-purple-900">
              {correcoes.length} correção{correcoes.length === 1 ? '' : 'ões'} pendente{correcoes.length === 1 ? '' : 's'}
              {selecionadas.size > 0 && (
                <span className="ml-2 text-sm font-normal">({selecionadas.size} selecionada{selecionadas.size === 1 ? '' : 's'})</span>
              )}
            </p>
            <p className="text-xs text-purple-800 mt-1">
              Selecione individualmente ou aplique todas. Cada aplicação cria uma nova versão do prompt.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onSelTodas}
              className="px-3 py-1.5 text-xs border border-purple-300 text-purple-700 bg-white rounded hover:bg-purple-50">
              {selecionadas.size === correcoes.length ? 'Desmarcar todas' : 'Selecionar todas'}
            </button>
            <button onClick={onAplicar} disabled={aplicando}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 font-medium">
              {aplicando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Aplicar {selecionadas.size > 0 ? `${selecionadas.size}` : 'todas'} ao prompt
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {correcoes.map(c => (
          <div key={c.id} className={clsx('p-4 border rounded-lg bg-white',
            selecionadas.has(c.id) ? 'border-purple-400 ring-2 ring-purple-100' : 'border-gray-200')}>
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={selecionadas.has(c.id)} onChange={() => onToggleSel(c.id)}
                className="mt-1 rounded" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                    {SECAO_LABELS[c.secao] || c.secao}
                  </span>
                  <span className="text-xs text-gray-500">
                    Por {c.criado_por || 'desconhecido'} · {new Date(c.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Bahia' })}
                  </span>
                </div>
                <p className="text-sm text-gray-900 font-medium whitespace-pre-wrap">{c.licao}</p>
                {c.mensagem_problematica && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Ver mensagem original</summary>
                    <p className="text-xs text-gray-600 italic mt-1 bg-gray-50 p-2 rounded">
                      {c.mensagem_problematica.slice(0, 400)}{c.mensagem_problematica.length > 400 ? '…' : ''}
                    </p>
                  </details>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ============================================
// TAB: Aplicadas (histórico)
// ============================================
function AplicadasTab({ correcoes }: { correcoes: Correcao[] }) {
  if (correcoes.length === 0) {
    return (
      <div className="p-8 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500">
        <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="font-medium">Nenhuma correção aplicada ainda</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {correcoes.map(c => (
        <div key={c.id} className="p-4 border border-gray-200 rounded-lg bg-white">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
              {SECAO_LABELS[c.secao] || c.secao}
            </span>
            {c.versao_prompt_resultante && (
              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                Aplicada em v{c.versao_prompt_resultante}
              </span>
            )}
            <span className="text-xs text-gray-500 ml-auto">
              {c.aplicada_em && new Date(c.aplicada_em).toLocaleString('pt-BR', { timeZone: 'America/Bahia' })}
            </span>
          </div>
          <p className="text-sm text-gray-900">{c.licao}</p>
        </div>
      ))}
    </div>
  );
}

// ============================================
// TAB: Versões
// ============================================
function VersoesTab({ versoes, onPreview, onReverter, revertendo }: {
  versoes: Versao[];
  onPreview: (v: Versao) => void;
  onReverter: (v: Versao) => void;
  revertendo: number | null;
}) {
  if (versoes.length === 0) {
    return (
      <div className="p-8 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500">
        <HistoryIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="font-medium">Nenhuma versão encontrada</p>
        <p className="text-sm mt-1">Rode a migration SQL pra ter a versão inicial.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {versoes.map(v => (
        <div key={v.id} className={clsx('p-4 border rounded-lg',
          v.ativa ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200')}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-base font-bold text-gray-900">v{v.versao}</span>
                {v.ativa && (
                  <span className="text-xs px-2 py-0.5 bg-green-600 text-white rounded font-medium">
                    ATIVA
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  {new Date(v.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Bahia' })}
                </span>
                {v.criado_por && (
                  <span className="text-xs text-gray-500">· {v.criado_por}</span>
                )}
                {v.correcoes_aplicadas && v.correcoes_aplicadas.length > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                    +{v.correcoes_aplicadas.length} lições
                  </span>
                )}
              </div>
              {v.resumo_mudancas && (
                <p className="text-sm text-gray-700 mt-1">{v.resumo_mudancas}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => onPreview(v)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
                <Eye className="w-3 h-3" /> Ver prompt
              </button>
              {!v.ativa && (
                <button onClick={() => onReverter(v)} disabled={revertendo === v.id}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs border border-amber-300 text-amber-700 bg-white rounded hover:bg-amber-50 disabled:opacity-50">
                  {revertendo === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  Ativar esta
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// MODAL: Preview da versão (mostra prompt completo)
// ============================================
function ModalPreviewVersao({ versao, onClose }: { versao: Versao; onClose: () => void }) {
  const { fetchApi } = useApi();
  const [prompt, setPrompt] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Endpoint /prompt-versoes retorna metadados, mas não o conteúdo full
      // Como workaround, faço query direto numa rota de detalhe (se não tiver, mostro só metadados)
      // Aqui vou mostrar o que já tenho + aviso
      setLoading(false);
    })();
  }, [versao]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Versão v{versao.versao} {versao.ativa && <span className="text-xs px-2 py-0.5 bg-green-600 text-white rounded ml-2">ATIVA</span>}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          <div className="space-y-2 text-sm">
            <p><strong>Criada em:</strong> {new Date(versao.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Bahia' })}</p>
            {versao.criado_por && <p><strong>Por:</strong> {versao.criado_por}</p>}
            {versao.resumo_mudancas && <p><strong>Mudanças:</strong> {versao.resumo_mudancas}</p>}
            {versao.correcoes_aplicadas && versao.correcoes_aplicadas.length > 0 && (
              <p><strong>Lições aplicadas:</strong> {versao.correcoes_aplicadas.length}</p>
            )}
          </div>
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
            <Info className="w-3 h-3 inline mr-1" />
            Pra ver o conteúdo completo do prompt, consulte a tabela <code className="bg-white px-1 rounded">tatiane_system_prompt</code> no Supabase (id={versao.id}).
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MODAL: Confirmar reverter
// ============================================
function ModalConfirmarRevert({ versao, onConfirm, onClose, revertendo }: {
  versao: Versao;
  onConfirm: () => void;
  onClose: () => void;
  revertendo: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" /> Confirmar reversão
          </h3>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-sm text-gray-700">
            Você está prestes a tornar a <strong>v{versao.versao}</strong> a versão ATIVA.
          </p>
          <p className="text-sm text-gray-700">
            A Tatiane vai começar a usar essa versão do prompt nos próximos 5 minutos (cache).
            Todas as lições aplicadas em versões mais recentes serão desfeitas.
          </p>
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            Você pode reverter de novo a qualquer momento.
          </p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancelar</button>
          <button onClick={onConfirm} disabled={revertendo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:bg-gray-300">
            {revertendo && <Loader2 className="w-3 h-3 animate-spin" />}
            Sim, ativar v{versao.versao}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LicoesPage() {
  return (
    <AuthLayout>
      <LicoesContent />
    </AuthLayout>
  );
}
