'use client';

// ===========================================
// Página: /saude-tatiane/causas
// Análise de leads_morto: por que perdemos
// ===========================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import AuthLayout from '@/components/AuthLayout';
import SaudeTatianeTabs from '@/components/SaudeTatianeTabs';
import { useApi } from '@/lib/hooks';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  RefreshCw,
  Skull,
  TrendingDown,
  Eye,
  X,
  Filter,
  GraduationCap,
} from 'lucide-react';
import clsx from 'clsx';

const CATEGORIA_LABELS: Record<string, { label: string; cor: string }> = {
  preco: { label: 'Preço/Repasse', cor: 'red' },
  cidade_fora: { label: 'Cidade fora cobertura', cor: 'orange' },
  veiculo: { label: 'Veículo errado', cor: 'amber' },
  sem_retorno: { label: 'Sem retorno', cor: 'gray' },
  horario: { label: 'Horário fixo', cor: 'blue' },
  clt: { label: 'Quer CLT', cor: 'indigo' },
  concorrencia: { label: 'Concorrência', cor: 'pink' },
  desinteresse: { label: 'Desinteresse', cor: 'rose' },
  confusao: { label: 'Confusão', cor: 'yellow' },
  documentacao: { label: 'Documentação', cor: 'cyan' },
  outro: { label: 'Outro', cor: 'slate' },
};

const ESTAGIO_LABELS: Record<string, string> = {
  etapa_1: 'Etapa 1 — Boas-vindas',
  etapa_2: 'Etapa 2 — Apresentação',
  etapa_3: 'Etapa 3 — Detalhes',
  etapa_4: 'Etapa 4 — Link app',
  etapa_5: 'Etapa 5 — Qualificação',
  etapa_6: 'Etapa 6 — Encaminhar',
  etapa_7: 'Etapa 7 — Encerrar',
  desconhecido: 'Desconhecido',
};

interface Resumo {
  total: number;
  por_categoria: Record<string, number>;
  por_estagio: Record<string, number>;
  por_regiao: Record<string, number>;
  por_dia: Record<string, number>;
  sinal_medio: number;
  fila: { pendentes: number; falhas: number };
  periodo_dias: number;
}

interface Analise {
  id: number;
  lead_id: number;
  morreu_em: string;
  causa_categoria: string;
  causa_descricao: string;
  estagio_que_parou: string;
  sinal_churn_pct: number;
  trecho_chave: string;
  recomendacao: string;
  lead_regiao: string | null;
  lead_cidade: string | null;
  total_mensagens: number;
  analisado_em: string;
  dados_cliente: {
    id: number;
    nomewpp: string | null;
    telefone: string | null;
    chat_lid: string | null;
    stage: string;
  } | null;
}

function CausasContent() {
  const { fetchApi } = useApi();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [analises, setAnalises] = useState<Analise[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dias, setDias] = useState(30);
  const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);
  const [filtroEstagio, setFiltroEstagio] = useState<string | null>(null);
  const [analiseAtiva, setAnaliseAtiva] = useState<Analise | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);

    // Resumo
    const { data: resumoData, error: errResumo } = await fetchApi<{ success: boolean; data: Resumo }>(
      `/api/causas/resumo?dias=${dias}`
    );
    if (errResumo) {
      setErro(errResumo);
      setLoading(false);
      return;
    }
    if (resumoData?.success) setResumo(resumoData.data);

    // Lista
    const params = new URLSearchParams({ dias: String(dias), limit: '200' });
    if (filtroCategoria) params.set('categoria', filtroCategoria);
    if (filtroEstagio) params.set('estagio', filtroEstagio);

    const { data: listaData, error: errLista } = await fetchApi<{ success: boolean; data: Analise[] }>(
      `/api/causas?${params.toString()}`
    );
    if (errLista) setErro(errLista);
    else if (listaData?.success) setAnalises(listaData.data);

    setLoading(false);
  }, [fetchApi, dias, filtroCategoria, filtroEstagio]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Top 5 categorias pra gráfico
  const topCategorias = useMemo(() => {
    if (!resumo) return [];
    return Object.entries(resumo.por_categoria)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [resumo]);

  const topEstagios = useMemo(() => {
    if (!resumo) return [];
    return Object.entries(resumo.por_estagio)
      .sort((a, b) => b[1] - a[1]);
  }, [resumo]);

  const topRegioes = useMemo(() => {
    if (!resumo) return [];
    return Object.entries(resumo.por_regiao)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [resumo]);

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

      {/* HEADER COM CONTROLES */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Skull className="w-5 h-5 text-red-600" />
              Causas de churn — por que perdemos esses leads?
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              Quando um lead vira <code className="bg-gray-100 px-1 rounded">lead_morto</code>, a IA analisa o histórico e classifica a causa.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={dias} onChange={(e) => setDias(parseInt(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-sm">
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
              <option value={365}>1 ano</option>
            </select>
            <button onClick={carregar} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
              <RefreshCw className="w-3 h-3" /> Atualizar
            </button>
          </div>
        </div>

        {resumo?.fila && (resumo.fila.pendentes > 0 || resumo.fila.falhas > 0) && (
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
            {resumo.fila.pendentes > 0 && (
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                {resumo.fila.pendentes} análises em fila (Tatiane está processando)
              </span>
            )}
            {resumo.fila.falhas > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <AlertCircle className="w-3 h-3" />
                {resumo.fila.falhas} análises falharam
              </span>
            )}
          </div>
        )}
      </div>

      {erro && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 mb-4">
          <AlertCircle className="w-5 h-5" /> {erro}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : !resumo || resumo.total === 0 ? (
        <div className="p-8 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500">
          <Skull className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-medium">Nenhuma análise disponível</p>
          <p className="text-sm mt-1">
            A análise é gerada automaticamente quando um lead vira <code className="bg-white px-1 rounded">lead_morto</code>.
            Aguarde alguns minutos pós-morte pra IA processar.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <KPI label="Total analisados" valor={resumo.total} icon={<Skull className="w-4 h-4" />} cor="red" />
            <KPI label="Sinal médio de churn" valor={`${resumo.sinal_medio}%`} icon={<TrendingDown className="w-4 h-4" />} cor="amber" />
            <KPI label="Período" valor={`${resumo.periodo_dias} dias`} icon={<Calendar className="w-4 h-4" />} cor="blue" />
          </div>

          {/* GRÁFICOS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Categorias */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Causas mais comuns</h3>
              <div className="space-y-2">
                {topCategorias.map(([cat, qt]) => {
                  const meta = CATEGORIA_LABELS[cat] || { label: cat, cor: 'gray' };
                  const pct = Math.round((qt / resumo.total) * 100);
                  const ativo = filtroCategoria === cat;
                  return (
                    <button key={cat}
                      onClick={() => setFiltroCategoria(ativo ? null : cat)}
                      className={clsx('w-full text-left group', ativo && 'ring-2 ring-purple-300 rounded')}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-gray-700">{meta.label}</span>
                        <span className="text-gray-500">{qt} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full bg-${meta.cor}-500 group-hover:opacity-80`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Estágios */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Onde mais perdemos (etapa)</h3>
              <div className="space-y-2">
                {topEstagios.map(([est, qt]) => {
                  const pct = Math.round((qt / resumo.total) * 100);
                  const ativo = filtroEstagio === est;
                  return (
                    <button key={est}
                      onClick={() => setFiltroEstagio(ativo ? null : est)}
                      className={clsx('w-full text-left group', ativo && 'ring-2 ring-purple-300 rounded')}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-gray-700">{ESTAGIO_LABELS[est] || est}</span>
                        <span className="text-gray-500">{qt} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 group-hover:opacity-80"
                          style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Regiões */}
          {topRegioes.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Regiões com mais churn</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {topRegioes.map(([reg, qt]) => (
                  <div key={reg} className="bg-gray-50 border border-gray-200 rounded p-2">
                    <p className="text-xs text-gray-600">{reg}</p>
                    <p className="text-base font-semibold text-gray-900">{qt}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FILTROS ATIVOS */}
          {(filtroCategoria || filtroEstagio) && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs text-gray-500">Filtros ativos:</span>
              {filtroCategoria && (
                <button onClick={() => setFiltroCategoria(null)}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                  Causa: {CATEGORIA_LABELS[filtroCategoria]?.label || filtroCategoria} <X className="w-3 h-3" />
                </button>
              )}
              {filtroEstagio && (
                <button onClick={() => setFiltroEstagio(null)}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                  Estágio: {ESTAGIO_LABELS[filtroEstagio] || filtroEstagio} <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* LISTA DE ANÁLISES */}
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Detalhes ({analises.length} análises)
          </h3>
          <div className="space-y-2">
            {analises.length === 0 ? (
              <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg">
                Nenhuma análise corresponde aos filtros
              </div>
            ) : (
              analises.map(a => (
                <CardAnalise key={a.id} analise={a} onAbrir={() => setAnaliseAtiva(a)} />
              ))
            )}
          </div>
        </>
      )}

      {analiseAtiva && (
        <ModalAnalise analise={analiseAtiva} onClose={() => setAnaliseAtiva(null)} />
      )}
    </div>
  );
}

function KPI({ label, valor, icon, cor }: { label: string; valor: any; icon: React.ReactNode; cor: string }) {
  const corClass = {
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
  }[cor] || 'bg-gray-50 text-gray-700 border-gray-200';

  return (
    <div className={`border rounded-lg p-3 ${corClass}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-75">
        {icon} {label}
      </div>
      <p className="text-2xl font-bold mt-1">{valor}</p>
    </div>
  );
}

function CardAnalise({ analise, onAbrir }: { analise: Analise; onAbrir: () => void }) {
  const meta = CATEGORIA_LABELS[analise.causa_categoria] || { label: analise.causa_categoria, cor: 'gray' };
  const lead = analise.dados_cliente;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 hover:border-gray-300 cursor-pointer"
      onClick={onAbrir}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs px-2 py-0.5 bg-${meta.cor}-100 text-${meta.cor}-700 rounded font-medium`}>
              {meta.label}
            </span>
            {analise.estagio_que_parou && analise.estagio_que_parou !== 'desconhecido' && (
              <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                {ESTAGIO_LABELS[analise.estagio_que_parou] || analise.estagio_que_parou}
              </span>
            )}
            <span className="text-xs text-gray-500">
              <span className={clsx(
                'inline-block w-2 h-2 rounded-full mr-1',
                analise.sinal_churn_pct >= 70 ? 'bg-red-500' :
                analise.sinal_churn_pct >= 40 ? 'bg-amber-500' : 'bg-gray-400'
              )} />
              Churn: {analise.sinal_churn_pct}%
            </span>
          </div>

          <p className="text-sm font-medium text-gray-900 mb-1">
            {lead?.nomewpp || `Lead #${analise.lead_id}`}
            {analise.lead_regiao && (
              <span className="text-xs text-gray-500 ml-2">· {analise.lead_regiao}</span>
            )}
          </p>

          <p className="text-sm text-gray-700">{analise.causa_descricao}</p>

          {analise.trecho_chave && (
            <p className="text-xs text-gray-500 mt-1 italic">
              💬 "{analise.trecho_chave}"
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
            <Eye className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalAnalise({ analise, onClose }: { analise: Analise; onClose: () => void }) {
  const meta = CATEGORIA_LABELS[analise.causa_categoria] || { label: analise.causa_categoria, cor: 'gray' };
  const lead = analise.dados_cliente;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {lead?.nomewpp || `Lead #${analise.lead_id}`}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-4 flex-1 space-y-4">
          <div>
            <span className={`text-xs px-2 py-0.5 bg-${meta.cor}-100 text-${meta.cor}-700 rounded font-medium`}>
              {meta.label}
            </span>
            <p className="text-sm text-gray-700 mt-2">{analise.causa_descricao}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-gray-50 rounded p-2">
              <p className="text-gray-500 uppercase tracking-wide">Estágio</p>
              <p className="font-medium">{ESTAGIO_LABELS[analise.estagio_que_parou] || analise.estagio_que_parou}</p>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <p className="text-gray-500 uppercase tracking-wide">Sinal de churn</p>
              <p className="font-medium">{analise.sinal_churn_pct}%</p>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <p className="text-gray-500 uppercase tracking-wide">Região</p>
              <p className="font-medium">{analise.lead_regiao || '—'}</p>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <p className="text-gray-500 uppercase tracking-wide">Mensagens trocadas</p>
              <p className="font-medium">{analise.total_mensagens}</p>
            </div>
          </div>

          {analise.trecho_chave && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3">
              <p className="text-xs font-semibold text-amber-900 mb-1">💬 Trecho chave (lead)</p>
              <p className="text-sm text-amber-900 italic">"{analise.trecho_chave}"</p>
            </div>
          )}

          {analise.recomendacao && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-xs font-semibold text-blue-900 mb-1">💡 Recomendação</p>
              <p className="text-sm text-blue-900">{analise.recomendacao}</p>
            </div>
          )}

          <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
            Morreu em {new Date(analise.morreu_em).toLocaleString('pt-BR', { timeZone: 'America/Bahia' })} ·
            Analisado em {new Date(analise.analisado_em).toLocaleString('pt-BR', { timeZone: 'America/Bahia' })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CausasPage() {
  return (
    <AuthLayout>
      <CausasContent />
    </AuthLayout>
  );
}
