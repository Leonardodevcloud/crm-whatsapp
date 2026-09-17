'use client';

// ===========================================
// Tela: /config-contato
// Markers: CONFIG_CONTATO_V1 / CONTATADOS_COL_V1 / RODAR_AGORA_V1 / COL_MAIOR_V1 / PIZZA_V1
// 3 colunas: Configuração | Contatados pela Tati | Raio-X (pizza) do dia-alvo
// "iniciada em segundo plano" (disparo assíncrono)
// ===========================================

import { useState, useEffect, useCallback } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { useApi } from '@/lib/hooks';
import {
  Send, Loader2, Save, CheckCircle, AlertCircle, Info, Minus, Plus, MessageCircle, RefreshCw, PieChart,
} from 'lucide-react';

interface OutboundConfig { ativo: boolean; leads_por_dia: number; dias_apos_chegada: number; }
interface Contatado { cod: string; nome: string | null; celular: string | null; regiao: string | null; estado: string | null; tati_contatado_em: string | null; }
interface Stats { total: number; contatados: number; ja_conhecidos: number; a_contatar: number; sem_telefone: number; }

function formatarDia(diasAtras: number): string {
  const alvo = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit' }).format(alvo);
}
function formatFone(v: string | null): string {
  const d = String(v || '').replace(/\D/g, '');
  const s = d.startsWith('55') ? d.slice(2) : d;
  if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`;
  return v || '—';
}

const FATIAS = [
  { key: 'contatados' as const,   label: 'Contatados pela Tati',       cor: '#7c3aed' },
  { key: 'ja_conhecidos' as const, label: 'Já falaram com a Tati',      cor: '#f59e0b' },
  { key: 'a_contatar' as const,    label: 'A contatar (novos)',         cor: '#10b981' },
  { key: 'sem_telefone' as const,  label: 'Sem telefone / sem verific.', cor: '#9ca3af' },
];

function Stepper({ valor, min, max, onChange }: { valor: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(Math.max(min, valor - 1))} className="w-9 h-10 flex items-center justify-center rounded-lg border border-gray-200 bg-purple-50 text-purple-700 hover:bg-purple-100"><Minus className="w-4 h-4" /></button>
      <input type="number" value={valor} min={min} max={max}
        onChange={(e) => { const n = parseInt(e.target.value, 10); onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min); }}
        className="w-20 text-center px-2 py-2 rounded-lg border border-gray-200 font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500" />
      <button type="button" onClick={() => onChange(Math.min(max, valor + 1))} className="w-9 h-10 flex items-center justify-center rounded-lg border border-gray-200 bg-purple-50 text-purple-700 hover:bg-purple-100"><Plus className="w-4 h-4" /></button>
    </div>
  );
}

function Pizza({ stats }: { stats: Stats }) {
  const total = stats.total || 0;
  if (total === 0) {
    return <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-sm"><PieChart className="w-7 h-7 mb-2 opacity-40" /> Sem leads no dia-alvo.</div>;
  }
  let acc = 0;
  const segs: string[] = [];
  for (const f of FATIAS) {
    const v = (stats as any)[f.key] as number || 0;
    if (v <= 0) continue;
    const ini = (acc / total) * 100;
    acc += v;
    const fim = (acc / total) * 100;
    segs.push(`${f.cor} ${ini}% ${fim}%`);
  }
  const grad = `conic-gradient(${segs.join(', ')})`;
  return (
    <div>
      <div className="mx-auto my-4" style={{ width: 170, height: 170, borderRadius: '50%', background: grad }} />
      <div className="px-1 pb-1">
        {FATIAS.map((f) => {
          const v = (stats as any)[f.key] as number || 0;
          const pct = total ? Math.round((v / total) * 100) : 0;
          return (
            <div key={f.key} className="flex items-center gap-2 py-2 border-b border-dashed border-gray-100 text-sm">
              <span className="w-3 h-3 rounded-sm flex-none" style={{ background: f.cor }} />
              <span className="text-gray-700">{f.label}</span>
              <span className="ml-auto font-semibold text-gray-900">{v} · {pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfigContatoInner() {
  const { fetchApi } = useApi();
  const [cfg, setCfg] = useState<OutboundConfig>({ ativo: false, leads_por_dia: 20, dias_apos_chegada: 2 });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [contatados, setContatados] = useState<Contatado[]>([]);
  const [hoje, setHoje] = useState<number>(0);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [rodando, setRodando] = useState(false);
  const [resultadoRun, setResultadoRun] = useState<string | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [diaAlvo, setDiaAlvo] = useState<string>('');
  const [carregandoStats, setCarregandoStats] = useState(true);
  const [classificando, setClassificando] = useState(false);

  const carregarConfig = useCallback(async () => {
    setCarregando(true); setErro(null);
    const { data, error } = await fetchApi<{ success: boolean; data: OutboundConfig }>('/api/tatiane-outbound-config', { cache: 'no-store' });
    if (error) setErro(error);
    else if (data?.data) setCfg({ ativo: !!data.data.ativo, leads_por_dia: Number(data.data.leads_por_dia) || 0, dias_apos_chegada: Number(data.data.dias_apos_chegada) || 2 });
    setCarregando(false);
  }, [fetchApi]);

  const carregarContatados = useCallback(async () => {
    setCarregandoLista(true);
    const { data } = await fetchApi<{ success: boolean; hoje: number; data: Contatado[] }>('/api/tatiane-outbound-contatados?limite=50', { cache: 'no-store' });
    if (data?.data) { setContatados(data.data); setHoje(Number(data.hoje) || 0); }
    setCarregandoLista(false);
  }, [fetchApi]);

  const carregarStats = useCallback(async (dias: number) => {
    setCarregandoStats(true);
    const { data } = await fetchApi<{ success: boolean; dia_alvo: string; stats: Stats }>(`/api/tatiane-outbound-stats?dias=${dias}`, { cache: 'no-store' });
    if (data?.stats) { setStats(data.stats); setDiaAlvo(data.dia_alvo || ''); }
    setCarregandoStats(false);
  }, [fetchApi]);

  useEffect(() => { carregarConfig(); carregarContatados(); }, [carregarConfig, carregarContatados]);
  useEffect(() => { carregarStats(cfg.dias_apos_chegada); }, [cfg.dias_apos_chegada, carregarStats]);

  const salvar = async () => {
    setSalvando(true); setErro(null); setSalvo(false);
    const { error } = await fetchApi('/api/tatiane-outbound-config', { method: 'PUT', body: JSON.stringify({ ativo: cfg.ativo, leads_por_dia: cfg.leads_por_dia, dias_apos_chegada: cfg.dias_apos_chegada }) });
    if (error) setErro(error); else { setSalvo(true); setTimeout(() => setSalvo(false), 3000); }
    setSalvando(false);
  };

  const rodarAgora = async () => {
    setRodando(true); setResultadoRun(null);
    const { data, error } = await fetchApi<any>('/api/tatiane-outbound-rodar', { method: 'POST', cache: 'no-store', body: '{}' });
    if (error) { setResultadoRun('Erro: ' + error); }
    else if (data && data.iniciado) { setResultadoRun('Rodada iniciada em segundo plano. A lista atualiza conforme a Tati envia.'); }
    else { setResultadoRun('Rodada executada.'); }
    setTimeout(() => { carregarContatados(); carregarStats(cfg.dias_apos_chegada); }, 5000);
    setRodando(false);
  };

  const classificarBase = async () => {
    setClassificando(true); setResultadoRun(null);
    const { data, error } = await fetchApi<any>('/api/tatiane-outbound-classificar', { method: 'POST', cache: 'no-store', body: '{}' });
    if (error) setResultadoRun('Erro na classificação: ' + error);
    else setResultadoRun('Classificação iniciada. O gráfico atualiza em instantes.');
    setTimeout(() => { carregarStats(cfg.dias_apos_chegada); carregarContatados(); }, 6000);
    setClassificando(false);
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">{/* PIZZA_V1 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center"><Send className="w-5 h-5" /></div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Contato automático da Tatiane</h1>
          <p className="text-sm text-gray-500">Primeiro contato com leads por data de chegada, com trava diária.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUNA 1 — CONFIG */}
        <div className="lg:col-span-4">
          {carregando ? (
            <div className="flex items-center justify-center py-20 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...</div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div><div className="text-sm font-medium text-gray-900">Ativar contato automático</div><div className="text-xs text-gray-500 mt-0.5">Quando desligado, a Tati não inicia contato novo.</div></div>
                <button type="button" onClick={() => setCfg(c => ({ ...c, ativo: !c.ativo }))} className={`relative w-12 h-7 rounded-full transition-colors ${cfg.ativo ? 'bg-purple-600' : 'bg-gray-300'}`} aria-pressed={cfg.ativo}><span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${cfg.ativo ? 'right-1' : 'left-1'}`} /></button>
              </div>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div><div className="text-sm font-medium text-gray-900">Leads por dia</div><div className="text-xs text-gray-500 mt-0.5">Trava de quantos leads a Tati inicia por dia.</div></div>
                <Stepper valor={cfg.leads_por_dia} min={0} max={500} onChange={(v) => setCfg(c => ({ ...c, leads_por_dia: v }))} />
              </div>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div><div className="text-sm font-medium text-gray-900">Dias após a chegada</div><div className="text-xs text-gray-500 mt-0.5">Ex.: 2 = contatar quem chegou há 2 dias (D-2).</div></div>
                <Stepper valor={cfg.dias_apos_chegada} min={0} max={60} onChange={(v) => setCfg(c => ({ ...c, dias_apos_chegada: v }))} />
              </div>
              <div className="px-5 py-4">
                <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-purple-700 font-semibold">Preview de hoje</div>
                  <div className="text-sm text-gray-700 mt-1.5 leading-relaxed">A Tati inicia contato com leads que chegaram em <b>{formatarDia(cfg.dias_apos_chegada)}</b> — no máximo <span className="inline-block bg-purple-600 text-white font-semibold rounded-full px-2 py-0.5 text-xs">{cfg.leads_por_dia} leads</span>. Quem já falou com a Tati é pulado e não gasta a cota.</div>
                </div>
                <div className="flex items-start gap-2 text-xs text-gray-500 mt-3"><Info className="w-4 h-4 flex-none mt-0.5" /><span>Envios na janela 8h–20h (Salvador). Cada lead é contatado uma única vez.</span></div>
              </div>
              <div className="flex items-center gap-3 px-5 pb-5">
                <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-2 bg-purple-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-purple-700 disabled:bg-gray-300">{salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{salvando ? 'Salvando...' : 'Salvar configuração'}</button>
                {salvo && <span className="inline-flex items-center gap-1.5 text-sm text-green-600"><CheckCircle className="w-4 h-4" /> Salvo</span>}
                {erro && <span className="inline-flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="w-4 h-4" /> {erro}</span>}
              </div>
            </div>
          )}
        </div>

        {/* COLUNA 2 — CONTATADOS */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div><div className="text-sm font-semibold text-gray-900">Contatados pela Tati</div><div className="text-xs text-gray-500 mt-0.5">Já receberam o primeiro contato</div></div>
              <div className="flex items-center gap-2">{/* RODAR_AGORA_V1 */}
                <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-100 rounded-full px-2.5 py-0.5">hoje: {hoje}</span>
                <button type="button" onClick={rodarAgora} disabled={rodando} className="inline-flex items-center gap-1 text-xs font-medium bg-purple-600 text-white rounded-lg px-2.5 py-1.5 hover:bg-purple-700 disabled:bg-gray-300" title="Disparar a Tati agora">{rodando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Rodar agora</button>
                <button type="button" onClick={carregarContatados} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Atualizar"><RefreshCw className={`w-4 h-4 ${carregandoLista ? 'animate-spin' : ''}`} /></button>
              </div>
            </div>
            {resultadoRun && (<div className="px-5 py-2 text-xs text-gray-600 bg-purple-50 border-b border-purple-100">{resultadoRun}</div>)}
            <div className="max-h-[72vh] overflow-auto">
              {carregandoLista ? (
                <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...</div>
              ) : contatados.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm"><MessageCircle className="w-6 h-6 mb-2 opacity-50" /> Nenhum lead contatado ainda.</div>
              ) : (
                contatados.map((c) => (
                  <div key={c.cod} className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold text-gray-900 truncate">{c.nome || 'Sem nome'}</div>
                      <div className="text-[13px] text-gray-500 mt-1">{formatFone(c.celular)}{c.regiao ? ` • ${c.regiao}${c.estado ? ' ' + c.estado : ''}` : ''}</div>
                    </div>
                    <span className="text-sm font-semibold text-purple-700 bg-purple-50 rounded-lg px-3 py-1.5 flex-none ml-3">{c.cod}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* COLUNA 3 — RAIO-X / PIZZA */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div><div className="text-sm font-semibold text-gray-900">Raio-X do dia{diaAlvo ? ` (${formatarDia(cfg.dias_apos_chegada)})` : ''}</div><div className="text-xs text-gray-500 mt-0.5">{stats ? `${stats.total} leads inativos` : '—'}</div></div>
              <button type="button" onClick={carregarStats.bind(null, cfg.dias_apos_chegada)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Atualizar"><RefreshCw className={`w-4 h-4 ${carregandoStats ? 'animate-spin' : ''}`} /></button>
            </div>
            <div className="px-4 pt-3">
              <button type="button" onClick={classificarBase} disabled={classificando} className="w-full inline-flex items-center justify-center gap-2 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 hover:bg-purple-100 disabled:opacity-60">{classificando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Classificar base do dia</button>
              <div className="text-[11px] text-gray-400 mt-1 text-center">Marca quem já falou com a Tati (não envia nada)</div>
            </div>
            <div className="px-5 pb-5">
              {carregandoStats && !stats ? (
                <div className="flex items-center justify-center py-12 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...</div>
              ) : stats ? (
                <Pizza stats={stats} />
              ) : (
                <div className="py-12 text-center text-gray-400 text-sm">Sem dados.</div>
              )}
              <div className="flex items-start gap-2 text-[11px] text-gray-400 mt-2"><Info className="w-3.5 h-3.5 flex-none mt-0.5" /><span>Match por telefone. Parte do histórico da Tati não tem número, então alguns "já falaram" podem cair em "a contatar".</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConfigContatoPage() {
  return (
    <AuthLayout>
      <ConfigContatoInner />
    </AuthLayout>
  );
}
