'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { useApi } from '@/lib/hooks';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';

// ============================================
// HELPERS DE DATA SEGUROS
// ============================================
function parseDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  let s = String(value);
  if (s.includes(' ') && !s.includes('T')) {
    s = s.replace(' ', 'T');
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function safeFormatDistanceToNow(value: any): string {
  const d = parseDateSafe(value);
  if (!d) return '—';
  try {
    return formatDistanceToNow(d, { locale: ptBR, addSuffix: true });
  } catch {
    return '—';
  }
}

// ============================================
// TIPOS
// ============================================
interface DadosHoje {
  conversas_ativas: number;
  followups_enviados_hoje: number;
  leads_ativados_hoje: number;
  novos_leads_hoje: number;
  mensagens_hoje: { total: number; humanas: number; ia: number };
  ultima_atividade_tatiane: string | null;
}

interface DadosPeriodo {
  periodo_dias: number;
  total_cadastros: number;
  total_ativados: number;
  taxa_conversao_pct: number;
  tempo_mediana_ativar_dias: number | null;
  tempo_medio_ativar_dias: number | null;
  amostra_tempo_ativar: number;
  followups: { total: number; respondidos: number; taxa_resposta_pct: number };
  serie_temporal_msgs: Array<{ dia: string; ia: number; humanas: number }>;
}

interface Alerta {
  id: string;
  severidade: 'critico' | 'aviso' | 'info';
  titulo: string;
  descricao: string;
  valor?: string | number;
  link?: string;
}

interface DadosAlertas {
  alertas: Alerta[];
  total: number;
  por_severidade: { critico: number; aviso: number; info: number };
}

// ============================================
// COMPONENTE
// ============================================
function DashboardContent() {
  const router = useRouter();
  const { fetchApi } = useApi();
  const [hoje, setHoje] = useState<DadosHoje | null>(null);
  const [periodo, setPeriodo] = useState<DadosPeriodo | null>(null);
  const [alertas, setAlertas] = useState<DadosAlertas | null>(null);
  const [diasFiltro, setDiasFiltro] = useState<7 | 30 | 90>(7);
  const [carregando, setCarregando] = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarTudo = useCallback(async () => {
    setRecarregando(true);
    setErro(null);

    const [respHoje, respPeriodo, respAlertas] = await Promise.all([
      fetchApi<{ success: boolean; data: DadosHoje }>('/api/dashboard/hoje'),
      fetchApi<{ success: boolean; data: DadosPeriodo }>(`/api/dashboard/periodo?dias=${diasFiltro}`),
      fetchApi<{ success: boolean; data: DadosAlertas }>('/api/dashboard/alertas'),
    ]);

    if (respHoje.error) setErro(respHoje.error);
    if (respHoje.data?.success) setHoje(respHoje.data.data);
    if (respPeriodo.data?.success) setPeriodo(respPeriodo.data.data);
    if (respAlertas.data?.success) setAlertas(respAlertas.data.data);

    setCarregando(false);
    setRecarregando(false);
  }, [fetchApi, diasFiltro]);

  useEffect(() => {
    carregarTudo();
    // Auto-refresh a cada 60s
    const interval = setInterval(() => carregarTudo(), 60000);
    return () => clearInterval(interval);
  }, [carregarTudo]);

  if (carregando && !hoje) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      {/* ================== HEADER ================== */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-7 h-7 text-purple-600" />
            Dashboard
          </h1>
          <p className="text-sm text-gray-600 mt-1">Visão executiva da operação Tutts</p>
        </div>
        <button
          onClick={carregarTudo}
          disabled={recarregando}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={clsx('w-4 h-4', recarregando && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* ================== ERRO ================== */}
      {erro && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>{erro}</span>
        </div>
      )}

      {/* ================== ALERTAS (no topo) ================== */}
      {alertas && alertas.alertas.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Alertas
              <span className="text-xs font-normal text-gray-500">
                {alertas.por_severidade.critico} críticos •{' '}
                {alertas.por_severidade.aviso} avisos •{' '}
                {alertas.por_severidade.info} info
              </span>
            </h2>
          </div>
          <div className="space-y-2">
            {alertas.alertas.map((a) => (
              <AlertaCard key={a.id} alerta={a} onClick={() => a.link && router.push(a.link)} />
            ))}
          </div>
        </div>
      )}

      {alertas && alertas.alertas.length === 0 && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">Tudo operando bem.</span>
          <span className="text-sm text-green-600">Nenhum alerta detectado.</span>
        </div>
      )}

      {/* ================== HOJE ================== */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-600" />
          Hoje
          {hoje?.ultima_atividade_tatiane && (
            <span className="text-xs font-normal text-gray-500 ml-2">
              Última atividade: {safeFormatDistanceToNow(hoje.ultima_atividade_tatiane)}
            </span>
          )}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icone={<Bot className="w-5 h-5" />}
            cor="purple"
            titulo="Conversas ativas"
            valor={hoje?.conversas_ativas ?? '—'}
            subtitulo="Tatiane (últimas 2h)"
          />
          <KpiCard
            icone={<Send className="w-5 h-5" />}
            cor="blue"
            titulo="Follow-ups enviados"
            valor={hoje?.followups_enviados_hoje ?? '—'}
            subtitulo="Hoje"
          />
          <KpiCard
            icone={<CheckCircle2 className="w-5 h-5" />}
            cor="green"
            titulo="Leads ativados"
            valor={hoje?.leads_ativados_hoje ?? '—'}
            subtitulo="Hoje"
          />
          <KpiCard
            icone={<Users className="w-5 h-5" />}
            cor="amber"
            titulo="Novos leads"
            valor={hoje?.novos_leads_hoje ?? '—'}
            subtitulo="Entraram hoje"
          />
        </div>

        {/* Sub-métricas: mensagens */}
        {hoje && hoje.mensagens_hoje.total > 0 && (
          <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MessageSquare className="w-4 h-4 text-gray-400" />
                Mensagens trocadas hoje
              </div>
              <div className="flex gap-4 text-sm">
                <span><strong>{hoje.mensagens_hoje.total}</strong> total</span>
                <span className="text-purple-600">
                  <strong>{hoje.mensagens_hoje.ia}</strong> Tatiane
                </span>
                <span className="text-blue-600">
                  <strong>{hoje.mensagens_hoje.humanas}</strong> leads
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ================== PERÍODO ================== */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Histórico
          </h2>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDiasFiltro(d)}
                className={clsx(
                  'px-3 py-1 text-sm rounded-md transition-colors',
                  diasFiltro === d
                    ? 'bg-white shadow-sm font-medium text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>

        {periodo && (
          <>
            {/* KPIs do período (3 cards limpos) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              <KpiCard
                icone={<Target className="w-5 h-5" />}
                cor="purple"
                titulo="Taxa de conversão"
                valor={`${periodo.taxa_conversao_pct}%`}
                subtitulo={`${periodo.total_ativados} de ${periodo.total_cadastros} ativaram`}
              />
              <KpiCard
                icone={<Clock className="w-5 h-5" />}
                cor="blue"
                titulo="Tempo até ativar (mediana)"
                valor={
                  periodo.tempo_mediana_ativar_dias !== null
                    ? `${periodo.tempo_mediana_ativar_dias} dias`
                    : '—'
                }
                subtitulo={
                  periodo.amostra_tempo_ativar > 0
                    ? `${periodo.amostra_tempo_ativar} leads · média ${periodo.tempo_medio_ativar_dias} dias`
                    : 'Sem dados'
                }
              />
              <KpiCard
                icone={<Send className="w-5 h-5" />}
                cor="green"
                titulo="Taxa resposta follow-up"
                valor={`${periodo.followups.taxa_resposta_pct}%`}
                subtitulo={`${periodo.followups.respondidos} de ${periodo.followups.total} responderam`}
              />
            </div>

            {/* Gráfico de mensagens (SVG nativo) */}
            {periodo.serie_temporal_msgs.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Atividade diária — Mensagens
                  </h3>
                  <div className="flex gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-purple-500" />
                      Tatiane
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-blue-500" />
                      Leads
                    </span>
                  </div>
                </div>
                <ChartMensagens dados={periodo.serie_temporal_msgs} />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ============================================
// KPI CARD
// ============================================
function KpiCard({
  icone,
  cor,
  titulo,
  valor,
  subtitulo,
}: {
  icone: React.ReactNode;
  cor: 'purple' | 'blue' | 'green' | 'amber' | 'red';
  titulo: string;
  valor: string | number;
  subtitulo?: string;
}) {
  const cores = {
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-600' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-600' },
    green: { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-600' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'text-amber-600' },
    red: { bg: 'bg-red-50', text: 'text-red-700', icon: 'text-red-600' },
  };
  const c = cores[cor];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-gray-600 uppercase tracking-wide font-medium">{titulo}</span>
        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', c.bg, c.icon)}>
          {icone}
        </div>
      </div>
      <p className={clsx('text-2xl font-bold', c.text)}>{valor}</p>
      {subtitulo && <p className="text-xs text-gray-500 mt-1">{subtitulo}</p>}
    </div>
  );
}

// ============================================
// ALERTA CARD
// ============================================
function AlertaCard({ alerta, onClick }: { alerta: Alerta; onClick?: () => void }) {
  const cores = {
    critico: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900', icon: 'text-red-600' },
    aviso: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', icon: 'text-amber-600' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', icon: 'text-blue-600' },
  };
  const c = cores[alerta.severidade];
  const Icon = alerta.severidade === 'critico' ? AlertCircle : alerta.severidade === 'aviso' ? AlertTriangle : Info;

  return (
    <div
      className={clsx(
        'p-4 border rounded-lg flex items-start gap-3 transition-shadow',
        c.bg,
        c.border,
        alerta.link && 'hover:shadow-md cursor-pointer'
      )}
      onClick={onClick}
    >
      <Icon className={clsx('w-5 h-5 flex-shrink-0 mt-0.5', c.icon)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className={clsx('font-semibold text-sm', c.text)}>{alerta.titulo}</p>
          {alerta.valor !== undefined && (
            <span className={clsx('text-xs font-mono px-2 py-0.5 rounded', c.bg, c.text, 'border', c.border)}>
              {alerta.valor}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-700 mt-1">{alerta.descricao}</p>
      </div>
      {alerta.link && <ArrowRight className={clsx('w-4 h-4 mt-1', c.icon)} />}
    </div>
  );
}

// ============================================
// CHART DE MENSAGENS — SVG nativo (sem Recharts)
// ============================================
function ChartMensagens({ dados }: { dados: Array<{ dia: string; ia: number; humanas: number }> }) {
  const W = 800;
  const H = 240;
  const PAD = { top: 10, right: 20, bottom: 30, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const N = dados.length;

  if (N === 0) return null;

  const maxY = Math.max(1, ...dados.map((d) => Math.max(d.ia, d.humanas)));
  const yMax = Math.ceil(maxY * 1.1);

  const xAt = (i: number) => PAD.left + (N === 1 ? plotW / 2 : (i / (N - 1)) * plotW);
  const yAt = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  // Path linear (linhas retas entre pontos) — mostra picos e vales nítidos
  const linearPath = (points: Array<{ x: number; y: number }>) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  };

  const pontosIa = dados.map((d, i) => ({ x: xAt(i), y: yAt(d.ia) }));
  const pontosHum = dados.map((d, i) => ({ x: xAt(i), y: yAt(d.humanas) }));

  const baseY = PAD.top + plotH;
  const areaIa = `${linearPath(pontosIa)} L ${pontosIa[N - 1].x} ${baseY} L ${pontosIa[0].x} ${baseY} Z`;
  const areaHum = `${linearPath(pontosHum)} L ${pontosHum[N - 1].x} ${baseY} L ${pontosHum[0].x} ${baseY} Z`;

  // Gridlines (4 linhas)
  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const v = Math.round((yMax / 4) * i);
    return { v, y: yAt(v) };
  });

  // Labels X (mostra só alguns)
  // Mostra labels no eixo X: TODOS se ≤14 dias, senão a cada N para caber ~10 labels
  const stepX = N <= 14 ? 1 : Math.max(1, Math.ceil(N / 10));

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full h-auto">
        <defs>
          <linearGradient id="dashGradIa" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="dashGradHum" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines + labels Y */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={g.y}
              y2={g.y}
              stroke="#e5e7eb"
              strokeDasharray="3 3"
            />
            <text x={PAD.left - 6} y={g.y + 4} textAnchor="end" fontSize="11" fill="#9ca3af">
              {g.v}
            </text>
          </g>
        ))}

        {/* Áreas */}
        <path d={areaIa} fill="url(#dashGradIa)" />
        <path d={areaHum} fill="url(#dashGradHum)" />

        {/* Linhas (linear, mostram picos/vales nítidos) */}
        <path d={linearPath(pontosIa)} fill="none" stroke="#7c3aed" strokeWidth="2.5" />
        <path d={linearPath(pontosHum)} fill="none" stroke="#3b82f6" strokeWidth="2.5" />

        {/* Pontos nos vértices (Tatiane) */}
        {pontosIa.map((p, i) => (
          <circle key={`pi-${i}`} cx={p.x} cy={p.y} r="3.5" fill="#7c3aed" stroke="white" strokeWidth="1.5" />
        ))}
        {/* Pontos nos vértices (Leads) */}
        {pontosHum.map((p, i) => (
          <circle key={`ph-${i}`} cx={p.x} cy={p.y} r="3.5" fill="#3b82f6" stroke="white" strokeWidth="1.5" />
        ))}

        {/* Valores acima de cada ponto (só nos pontos visíveis) */}
        {dados.map((d, i) => {
          if (i % stepX !== 0 && i !== N - 1) return null;
          return (
            <g key={`vals-${i}`}>
              <text
                x={xAt(i)}
                y={yAt(d.ia) - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#7c3aed"
                fontWeight="600"
              >
                {d.ia}
              </text>
              <text
                x={xAt(i)}
                y={yAt(d.humanas) - 8}
                textAnchor="middle"
                fontSize="10"
                fill="#3b82f6"
                fontWeight="600"
              >
                {d.humanas}
              </text>
            </g>
          );
        })}

        {/* Labels X */}
        {dados.map((d, i) => {
          if (i % stepX !== 0 && i !== N - 1) return null;
          const data = parseDateSafe(d.dia);
          return (
            <text
              key={i}
              x={xAt(i)}
              y={PAD.top + plotH + 18}
              textAnchor="middle"
              fontSize="11"
              fill="#6b7280"
            >
              {data ? format(data, 'dd/MM', { locale: ptBR }) : ''}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ============================================
// EXPORT
// ============================================
export default function DashboardPage() {
  return (
    <AuthLayout>
      <DashboardContent />
    </AuthLayout>
  );
}
