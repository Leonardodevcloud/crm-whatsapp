'use client';

// ===========================================
// Página: /saude-tatiane/funil  (FUNIL_TATI_V1)
// Onde a Tati perde o lead: conversa → nome → veículo → cidade → link → cadastro
// no app (conferido no sistema da Tutts) → encaminhado → liberado → fez entrega.
// Dados: Tatiane /api/tatiane/cerebro/funil (via proxy /api/cerebro/*).
// ===========================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import AuthLayout from '@/components/AuthLayout';
import SaudeTatianeTabs from '@/components/SaudeTatianeTabs';
import { useApi } from '@/lib/hooks';
import { Activity, AlertCircle, ArrowDownRight, Filter, Loader2, MessageSquare, RefreshCw, Users, X } from 'lucide-react';

type EtapaId = 'conversou' | 'nome' | 'veiculo' | 'cidade' | 'link' | 'cadastro' | 'encaminhado' | 'ativado' | 'rodando';

interface Etapa {
  id: EtapaId;
  titulo: string;
  dica: string;
  quantidade: number;
  pct_inicio: number;
  pct_anterior: number;
  indisponivel?: boolean;
}

interface LeadFunil {
  lead_id: number;
  nome: string | null;
  telefone: string | null;
  cidade: string | null;
  veiculo: string | null;
  primeira: string;
  ultima: string;
  quem_comecou: 'tati' | 'lead';
  msgs_lead: number;
  etapas: Record<EtapaId, boolean>;
  parou_em: EtapaId | 'inicio';
  cadastro: 'nao_cadastrado' | 'cadastrado' | 'ativo' | null;
  ja_tinha_cadastro: boolean;
  codigo: string | null;
  kanban: string | null;
}

interface Versao { versao: number; desde: string | null; resumo: string | null; leads: number; link: number; cadastro: number; encaminhado: number; ativado: number }

interface Funil {
  periodo: { inicio: string; fim: string; dias: number };
  total: number;
  fora_do_funil: { ja_eram_ativos_suporte: number; sem_cadastro_no_crm: number };
  ja_tinham_cadastro: number;
  etapas: Etapa[];
  tempos: { link_h: number | null; cadastro_h: number | null; encaminhado_h: number | null };
  por_versao: Versao[];
  regioes: string[];
  central_ok: boolean;
  leads: LeadFunil[];
}

const hojeBahia = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const menosDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '—');
const fmtDia = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a.slice(2)}`; };

function fmtHoras(h: number | null) {
  if (h == null) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h * 10) / 10} h`;
  return `${Math.round(h / 24)} dias`;
}

function fmtQuando(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bahia' });
}

function fmtTel(t: string | null) {
  const d = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || '—';
}

const CADASTRO_LABEL: Record<string, { t: string; c: string }> = {
  nao_cadastrado: { t: 'sem cadastro no app', c: 'bg-gray-100 text-gray-600' },
  cadastrado: { t: 'cadastrado, aguardando liberação', c: 'bg-amber-50 text-amber-700' },
  ativo: { t: 'liberado', c: 'bg-green-50 text-green-700' },
};

function FunilContent() {
  const { fetchApi } = useApi();
  const [preset, setPreset] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [inicio, setInicio] = useState(menosDias(hojeBahia(), 29));
  const [fim, setFim] = useState(hojeBahia());
  const [origem, setOrigem] = useState<'todos' | 'lead' | 'tati'>('todos');
  const [regiao, setRegiao] = useState('');
  const [dados, setDados] = useState<Funil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [lista, setLista] = useState<Etapa | null>(null);

  const escolherPreset = (p: '7' | '30' | '90' | 'custom') => {
    setPreset(p);
    if (p !== 'custom') { const f = hojeBahia(); setFim(f); setInicio(menosDias(f, Number(p) - 1)); }
  };

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    const qs = new URLSearchParams({ inicio, fim, origem });
    if (regiao) qs.set('regiao', regiao);
    const { data, error } = await fetchApi<Funil>(`/api/cerebro/funil?${qs.toString()}`, { cache: 'no-store' });
    setCarregando(false);
    if (error || !data) { setErro(error || 'Não deu para carregar o funil'); return; }
    setDados(data);
  }, [fetchApi, inicio, fim, origem, regiao]);

  useEffect(() => { carregar(); }, [carregar]);

  const pararam = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of dados?.leads || []) m[l.parou_em] = (m[l.parou_em] || 0) + 1;
    return m;
  }, [dados]);

  const maiorQueda = useMemo(() => {
    if (!dados) return null;
    let pior: { de: Etapa; para: Etapa; perdidos: number } | null = null;
    for (let i = 1; i < dados.etapas.length; i++) {
      const de = dados.etapas[i - 1], para = dados.etapas[i];
      if (para.indisponivel) continue;
      const perdidos = de.quantidade - para.quantidade;
      if (perdidos > 0 && (!pior || perdidos > pior.perdidos)) pior = { de, para, perdidos };
    }
    return pior;
  }, [dados]);

  const kpi = (id: EtapaId) => dados?.etapas.find((e) => e.id === id);

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

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Filter className="w-5 h-5 text-purple-600" />
              Funil da Tati — onde ela perde o lead
            </h2>
            <p className="text-xs text-gray-600 mt-1">Conversas que começaram no período. O cadastro no app é conferido no sistema da Tutts, não pela palavra do lead.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Período" value={preset} onChange={(e) => escolherPreset(e.target.value as '7' | '30' | '90' | 'custom')}
              className="px-2.5 py-1.5 text-sm border border-gray-300 rounded bg-white">
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="custom">Escolher datas</option>
            </select>
            {preset === 'custom' && (
              <>
                <input type="date" aria-label="De" value={inicio} max={fim} onChange={(e) => setInicio(e.target.value)} className="px-2 py-1.5 text-sm border border-gray-300 rounded" />
                <input type="date" aria-label="Até" value={fim} min={inicio} max={hojeBahia()} onChange={(e) => setFim(e.target.value)} className="px-2 py-1.5 text-sm border border-gray-300 rounded" />
              </>
            )}
            <select aria-label="Quem começou a conversa" value={origem} onChange={(e) => setOrigem(e.target.value as 'todos' | 'lead' | 'tati')}
              className="px-2.5 py-1.5 text-sm border border-gray-300 rounded bg-white">
              <option value="todos">Todas as conversas</option>
              <option value="lead">O lead chamou</option>
              <option value="tati">A Tati chamou (Contato Auto)</option>
            </select>
            <select aria-label="Região" value={regiao} onChange={(e) => setRegiao(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-gray-300 rounded bg-white max-w-[180px]">
              <option value="">Todas as regiões</option>
              {(dados?.regioes || []).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button type="button" onClick={carregar} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
              <RefreshCw className={clsx('w-3 h-3', carregando && 'animate-spin')} /> Atualizar
            </button>
          </div>
        </div>
      </div>

      {erro && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 mb-4">
          <AlertCircle className="w-5 h-5 flex-none" /> {erro}
          <button type="button" onClick={carregar} className="underline ml-1">Tentar de novo</button>
        </div>
      )}

      {!dados && carregando && (
        <div className="flex items-center gap-2 text-gray-500 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Montando o funil…</div>
      )}

      {dados && (
        <div className={clsx('space-y-4', carregando && 'opacity-60')}>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { t: 'Conversas', v: String(dados.total), s: `${fmtDia(dados.periodo.inicio)} a ${fmtDia(dados.periodo.fim)}` },
              { t: 'Receberam o link', v: pct(kpi('link')?.quantidade || 0, dados.total), s: `${kpi('link')?.quantidade || 0} · em ${fmtHoras(dados.tempos.link_h)} (mediana)` },
              { t: 'Fizeram o cadastro', v: pct(kpi('cadastro')?.quantidade || 0, dados.total), s: `${kpi('cadastro')?.quantidade || 0} conferidos no sistema` },
              { t: 'Liberados', v: pct(kpi('ativado')?.quantidade || 0, dados.total), s: `${kpi('ativado')?.quantidade || 0} · ${kpi('rodando')?.indisponivel ? 'entregas: Central fora' : `${kpi('rodando')?.quantidade || 0} já fizeram entrega`}` },
            ].map((k) => (
              <div key={k.t} className="bg-white border border-gray-200 rounded-lg p-3.5 min-w-0">
                <div className="text-xs text-gray-500">{k.t}</div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums mt-0.5">{k.v}</div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">{k.s}</div>
              </div>
            ))}
          </div>

          {maiorQueda && dados.total > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 flex items-start gap-2">
              <ArrowDownRight className="w-4 h-4 mt-0.5 flex-none" />
              <span>A maior perda está entre <b>{maiorQueda.de.titulo.toLowerCase()}</b> e <b>{maiorQueda.para.titulo.toLowerCase()}</b>: {maiorQueda.perdidos} leads ({pct(maiorQueda.perdidos, maiorQueda.de.quantidade)} de quem chegou lá).</span>
            </div>
          )}

          {/* Funil */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-2">
              <b className="text-gray-900 flex-1">Etapas</b>
              <span className="text-xs text-gray-500">Na ordem do fluxo da Tati · barra = % das conversas · quem chegou numa etapa conta nas anteriores · clique em “pararam aqui” para ver os leads</span>
            </div>
            {dados.total === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">Nenhuma conversa começou nesse período com esses filtros.</div>
            ) : (
              <ol>
                {dados.etapas.map((e, i) => {
                  const parou = pararam[e.id] || 0;
                  return (
                    <li key={e.id} className="px-4 py-3 border-t border-gray-100 first:border-t-0">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="w-full sm:w-56 flex-none min-w-0">
                          <div className="text-sm font-semibold text-gray-900">{i + 1}. {e.titulo}</div>
                          <div className="text-xs text-gray-500">{e.dica}</div>
                        </div>
                        <div className="flex-1 min-w-[160px]">
                          <div className="h-6 bg-gray-100 rounded overflow-hidden">
                            <div className={clsx('h-full rounded', e.indisponivel ? 'bg-gray-300' : 'bg-purple-600')} style={{ width: `${e.indisponivel ? 0 : Math.max(e.pct_inicio, e.quantidade ? 1.5 : 0)}%` }} />
                          </div>
                        </div>
                        <div className="w-24 text-right flex-none">
                          {e.indisponivel ? <span className="text-xs text-gray-500">Central fora</span> : (
                            <>
                              <div className="text-sm font-bold text-gray-900 tabular-nums">{e.quantidade}</div>
                              <div className="text-xs text-gray-500 tabular-nums">{e.pct_inicio}%</div>
                            </>
                          )}
                        </div>
                        <div className="w-36 flex-none text-xs">
                          {i > 0 && !e.indisponivel && <div className="text-gray-500 tabular-nums">{e.pct_anterior}% da etapa anterior</div>}
                          {parou > 0 && (
                            <button type="button" onClick={() => setLista(e)} className="text-purple-700 font-medium hover:underline">
                              {parou} {parou === 1 ? 'parou' : 'pararam'} aqui
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500 space-y-0.5">
              <div>Fora do funil: {dados.fora_do_funil.ja_eram_ativos_suporte} já eram profissionais ativos (foram direto para o suporte).{dados.ja_tinham_cadastro ? ` ${dados.ja_tinham_cadastro} já tinham cadastro no app antes de falar com a Tati.` : ''}</div>
              <div>Nome e veículo vêm do que a IA entendeu da conversa (a partir da 3ª mensagem do lead). Tempo até o encaminhamento: {fmtHoras(dados.tempos.encaminhado_h)} · até o cadastro: {fmtHoras(dados.tempos.cadastro_h)} (medianas).</div>
              {!dados.central_ok && <div className="text-amber-700">Não consegui consultar as entregas na Central agora — a etapa “Fez entrega” ficou sem número.</div>}
            </div>
          </div>

          {/* Por versão */}
          {dados.por_versao.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200">
                <b className="text-gray-900">Por versão das instruções</b>
                <p className="text-xs text-gray-500 mt-0.5">A versão que valia quando a conversa começou. Serve para ver se uma mudança no Cérebro da Tati melhorou ou piorou.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Versão</th>
                      <th className="text-right font-medium px-3 py-2">Conversas</th>
                      <th className="text-right font-medium px-3 py-2">Link</th>
                      <th className="text-right font-medium px-3 py-2">Cadastro</th>
                      <th className="text-right font-medium px-3 py-2">Encaminhado</th>
                      <th className="text-right font-medium px-3 py-2">Liberado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.por_versao.map((v) => (
                      <tr key={v.versao} className="border-t border-gray-100">
                        <td className="px-4 py-2 min-w-[200px]">
                          <div className="font-medium text-gray-900">{v.versao ? `v${v.versao}` : 'Padrão do código'}{v.desde ? <span className="text-xs text-gray-500 font-normal"> · desde {fmtQuando(v.desde)}</span> : null}</div>
                          {v.resumo && <div className="text-xs text-gray-500 truncate max-w-[340px]">{v.resumo}</div>}
                        </td>
                        <td className="text-right px-3 py-2 tabular-nums">{v.leads}</td>
                        {(['link', 'cadastro', 'encaminhado', 'ativado'] as const).map((k) => (
                          <td key={k} className="text-right px-3 py-2 tabular-nums">{pct(v[k], v.leads)}<span className="text-xs text-gray-400"> · {v[k]}</span></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {lista && dados && <ListaLeads etapa={lista} leads={dados.leads.filter((l) => l.parou_em === lista.id)} proxima={dados.etapas[dados.etapas.findIndex((e) => e.id === lista.id) + 1] || null} onClose={() => setLista(null)} />}
    </div>
  );
}

function ListaLeads({ etapa, leads, proxima, onClose }: { etapa: Etapa; leads: LeadFunil[]; proxima: Etapa | null; onClose: () => void }) {
  useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Pararam em ${etapa.titulo}`} className="bg-white w-full sm:max-w-3xl max-h-[88vh] rounded-t-xl sm:rounded-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <b className="text-gray-900 flex items-center gap-2"><Users className="w-4 h-4 text-purple-600" />{leads.length} {leads.length === 1 ? 'parou' : 'pararam'} em “{etapa.titulo}”</b>
            <p className="text-xs text-gray-500 mt-0.5">{proxima ? `Chegaram aqui e não passaram para “${proxima.titulo.toLowerCase()}”.` : 'Chegaram até o fim do funil.'} Os mais recentes primeiro.</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <ul className="overflow-y-auto divide-y divide-gray-100">
          {leads.map((l) => {
            const cad = l.cadastro ? CADASTRO_LABEL[l.cadastro] : null;
            return (
              <li key={l.lead_id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm font-medium text-gray-900">{l.nome || 'Sem nome'}</div>
                  <div className="text-xs text-gray-500">{fmtTel(l.telefone)}{l.cidade ? ` · ${l.cidade}` : ''}{l.veiculo ? ` · ${l.veiculo}` : ''}</div>
                </div>
                <div className="text-xs text-gray-500 w-44">
                  <div>Última mensagem {fmtQuando(l.ultima)}</div>
                  <div>{l.quem_comecou === 'tati' ? 'A Tati chamou' : 'O lead chamou'} · {l.msgs_lead} msg do lead</div>
                </div>
                <div className="w-48 flex-none">
                  {cad && <span className={clsx('inline-block text-[11px] font-medium px-2 py-0.5 rounded-full', cad.c)}>{cad.t}{l.codigo ? ` · ${l.codigo}` : ''}</span>}
                </div>
                <Link href={`/chat/${l.lead_id}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  <MessageSquare className="w-3.5 h-3.5" />Abrir conversa
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default function FunilPage() {
  return (
    <AuthLayout>
      <FunilContent />
    </AuthLayout>
  );
}
