'use client';

// ===========================================
// DISPONIVEIS_V1 — Motoboys Disponíveis
// Ativação cadastra motoboys que conseguiu mas ainda não têm vaga.
// A lista é a MESMA que o suporte vê na Disponibilidade da Central; quando o
// motoboy é colocado numa linha da escala ele sai daqui sozinho (WS em tempo real).
// ===========================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { useApi, useAuth } from '@/lib/hooks';
import {
  Bike, Loader2, AlertCircle, AlertTriangle, Info, Search, Plus, Trash2, Pencil, Check, X,
  Download, Wifi, WifiOff, CheckCircle2, Clock,
} from 'lucide-react';
import clsx from 'clsx';

// ── Types ──
interface Disponivel {
  id: number;
  cod_profissional: string;
  nome: string | null;
  telefone: string | null;
  regiao: string | null;
  cidade: string | null;
  disponibilidade: string | null;
  observacao: string | null;
  origem: 'crm' | 'central';
  criado_por: string | null;
  criado_em: string;
  atualizado_por: string | null;
  atualizado_em: string | null;
  obs_historico: { por: string; em: string; texto: string; onde?: string }[];
  foto?: string | null;
}
interface Lookup {
  encontrado: boolean;
  cod: string;
  nome: string | null;
  telefone: string | null;
  regiao: string | null;
  cidade: string | null;
  ja_na_lista: { id: number; por: string | null; em: string; observacao: string | null } | null;
  escalado: { loja: string; regiao: string | null; status: string } | null;
}
interface Evento { acao: string; item?: Partial<Disponivel>; por?: string | null; detalhe?: string | null; lista?: Disponivel[]; total?: number }

const fHora = (ts?: string | null) => {
  if (!ts) return '';
  const d = new Date(ts), hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  const dia = d.toDateString() === hoje.toDateString() ? 'Hoje' : d.toDateString() === ontem.toDateString() ? 'Ontem' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${dia} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};
const iniciais = (n?: string | null) => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

// ── Toasts locais (a página não tem sistema global de toast) ──
type Toast = { id: number; tipo: 'novo' | 'alocado' | 'removido' | 'ok' | 'erro'; titulo: string; sub?: string };
function ToastStack({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  const cor: Record<Toast['tipo'], string> = { novo: 'bg-emerald-500', alocado: 'bg-violet-600', removido: 'bg-red-600', ok: 'bg-blue-600', erro: 'bg-red-600' };
  const Ico: Record<Toast['tipo'], any> = { novo: Plus, alocado: Check, removido: Trash2, ok: CheckCircle2, erro: AlertCircle };
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)]">
      {toasts.map(t => { const I = Ico[t.tipo]; return (
        <div key={t.id} className="flex items-center gap-3 bg-gray-900 text-white rounded-xl px-3 py-2.5 shadow-2xl text-[12.5px]">
          <span className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', cor[t.tipo])}><I className="w-3.5 h-3.5" /></span>
          <div className="flex-1 min-w-0"><div className="font-bold truncate">{t.titulo}</div>{t.sub && <div className="text-gray-300 truncate">{t.sub}</div>}</div>
          <button onClick={() => onClose(t.id)} aria-label="Fechar" className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      ); })}
    </div>
  );
}

function DisponiveisContent() {
  const { fetchApi } = useApi();
  const { user, token } = useAuth();

  const [lista, setLista] = useState<Disponivel[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aoVivo, setAoVivo] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroRegiao, setFiltroRegiao] = useState('');

  // form
  const [cod, setCod] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [buscandoCod, setBuscandoCod] = useState(false);
  const [disponibilidade, setDisponibilidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  // edição inline
  const [editando, setEditando] = useState<{ id: number; observacao: string; disponibilidade: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [saindo, setSaindo] = useState<Record<number, string>>({}); // id → motivo (animação de saída)

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const toast = useCallback((tipo: Toast['tipo'], titulo: string, sub?: string) => {
    const id = ++toastId.current;
    setToasts(t => [...t, { id, tipo, titulo, sub }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 6000);
  }, []);
  const fecharToast = (id: number) => setToasts(t => t.filter(x => x.id !== id));

  // ── carregar ──
  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    const { data, error } = await fetchApi<{ success: boolean; lista: Disponivel[] }>('/api/disponiveis');
    if (error) setErro(error); else { setErro(null); setLista(data?.lista || []); }
    setLoading(false);
  }, [fetchApi]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── tempo real: WS da Central (/ws/disponibilidade) + polling de segurança ──
  const wsRef = useRef<WebSocket | null>(null);
  const meuNome = user?.nome;
  useEffect(() => {
    if (!token) return;
    let fechado = false, tentativas = 0, reconTimer: any = null, ping: any = null;

    const tratarEvento = (ev: Evento) => {
      if (Array.isArray(ev.lista)) {
        // marca quem saiu pra animar antes de sumir
        setLista(atual => {
          const novosIds = new Set(ev.lista!.map(i => i.id));
          const sairam = atual.filter(i => !novosIds.has(i.id));
          if (sairam.length && (ev.acao === 'alocado' || ev.acao === 'removido')) {
            const marca: Record<number, string> = {}; sairam.forEach(i => { marca[i.id] = ev.acao; });
            setSaindo(s => ({ ...s, ...marca }));
            setTimeout(() => { setLista(ev.lista!); setSaindo(s => { const c = { ...s }; sairam.forEach(i => delete c[i.id]); return c; }); }, 1400);
            return atual;
          }
          return ev.lista!;
        });
      }
      const it = ev.item || {};
      const nome = `${it.cod_profissional || ''} · ${it.nome || ''}`.trim();
      if (ev.por && ev.por === meuNome) return; // ação minha: já dei o feedback local
      if (ev.acao === 'inserido') toast('novo', 'Novo motoboy disponível', `${nome} — ${it.regiao || '—'} · por ${ev.por || '—'}`);
      else if (ev.acao === 'alocado') toast('alocado', 'Saiu da lista — entrou na Disponibilidade', `${nome}${ev.detalhe ? ' — ' + ev.detalhe : ''} · por ${ev.por || 'suporte'}`);
      else if (ev.acao === 'removido') toast('removido', 'Removido da lista', `${nome} · por ${ev.por || '—'}${ev.detalhe ? ` — motivo: "${ev.detalhe}"` : ''}`);
    };

    const conectar = async () => {
      const { data } = await fetchApi<{ wsUrl: string }>('/api/disponiveis/config');
      if (!data?.wsUrl || fechado) return;
      try {
        const ws = new WebSocket(data.wsUrl);
        wsRef.current = ws;
        ws.onopen = () => { ws.send(JSON.stringify({ type: 'AUTH', token })); };
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.event === 'AUTH_SUCCESS') { setAoVivo(true); tentativas = 0; ping = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'PING' })), 25000); }
            else if (msg.event === 'AUTH_ERROR' || msg.event === 'AUTH_EXPIRED') { setAoVivo(false); }
            else if (msg.event === 'DISPONIVEIS_CHANGED') tratarEvento(msg.data || {});
          } catch { /* ignora */ }
        };
        ws.onclose = () => { setAoVivo(false); if (ping) clearInterval(ping); if (!fechado && tentativas < 8) { tentativas++; reconTimer = setTimeout(conectar, Math.min(30000, 2000 * tentativas)); } };
        ws.onerror = () => { /* onclose reconecta */ };
      } catch { setAoVivo(false); }
    };
    conectar();
    // fallback: sem WS autenticado, revalida a cada 10s; com WS, a cada 60s
    const poll = setInterval(() => carregar(true), 10000);
    return () => { fechado = true; clearInterval(poll); if (reconTimer) clearTimeout(reconTimer); if (ping) clearInterval(ping); if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; } };
  }, [token, meuNome, fetchApi, carregar, toast]);

  // ── lookup do código (debounce) ──
  useEffect(() => {
    const c = cod.replace(/\D/g, '');
    setLookup(null);
    if (c.length < 2) return;
    setBuscandoCod(true);
    const t = setTimeout(async () => {
      const { data } = await fetchApi<Lookup>(`/api/disponiveis/lookup/${c}`);
      setBuscandoCod(false);
      if (data) setLookup(data);
    }, 350);
    return () => clearTimeout(t);
  }, [cod, fetchApi]);

  const podeAdicionar = !!lookup?.encontrado && !lookup?.ja_na_lista && !salvando;
  const adicionar = async () => {
    if (!podeAdicionar || !lookup) return;
    setSalvando(true);
    const { data, error } = await fetchApi<{ success: boolean; item: Disponivel }>('/api/disponiveis', { method: 'POST', body: JSON.stringify({ cod: lookup.cod, disponibilidade, observacao }) });
    setSalvando(false);
    if (error) { toast('erro', 'Não deu pra adicionar', error); return; }
    toast('ok', 'Motoboy adicionado à lista', `${data?.item.cod_profissional} · ${data?.item.nome}`);
    setCod(''); setLookup(null); setDisponibilidade(''); setObservacao('');
    carregar(true);
  };
  const editarExistente = () => {
    if (!lookup?.ja_na_lista) return;
    const it = lista.find(i => i.id === lookup.ja_na_lista!.id);
    if (it) { setEditando({ id: it.id, observacao: it.observacao || '', disponibilidade: it.disponibilidade || '' }); document.getElementById(`disp-row-${it.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    setCod(''); setLookup(null);
  };
  const salvarEdicao = async () => {
    if (!editando) return;
    setBusyId(editando.id);
    const { error } = await fetchApi(`/api/disponiveis/${editando.id}`, { method: 'PATCH', body: JSON.stringify({ observacao: editando.observacao, disponibilidade: editando.disponibilidade }) });
    setBusyId(null);
    if (error) { toast('erro', 'Erro ao salvar', error); return; }
    toast('ok', 'Observação salva'); setEditando(null); carregar(true);
  };
  const remover = async (it: Disponivel) => {
    const motivo = window.prompt(`Remover ${it.cod_profissional} · ${it.nome || ''} da lista?\n\nMotivo (opcional):`, '');
    if (motivo === null) return;
    setBusyId(it.id);
    const { error } = await fetchApi(`/api/disponiveis/${it.id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) });
    setBusyId(null);
    if (error) { toast('erro', 'Erro ao remover', error); return; }
    toast('ok', 'Removido da lista', `${it.cod_profissional} · ${it.nome || ''}`); carregar(true);
  };
  const exportarCsv = () => {
    const cab = ['cod', 'nome', 'telefone', 'regiao', 'cidade', 'disponibilidade', 'observacao', 'cadastrado_por', 'cadastrado_em'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [cab.join(';'), ...lista.map(i => [i.cod_profissional, i.nome, i.telefone, i.regiao, i.cidade, i.disponibilidade, i.observacao, i.criado_por, new Date(i.criado_em).toLocaleString('pt-BR')].map(esc).join(';'))];
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `motoboys-disponiveis-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const regioes = useMemo(() => { const m: Record<string, number> = {}; lista.forEach(i => { const r = i.regiao || 'SEM REGIÃO'; m[r] = (m[r] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); }, [lista]);
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter(i => (!filtroRegiao || (i.regiao || 'SEM REGIÃO') === filtroRegiao) && (!q || [i.cod_profissional, i.nome, i.telefone, i.regiao, i.cidade, i.observacao].some(v => String(v || '').toLowerCase().includes(q))));
  }, [lista, busca, filtroRegiao]);

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto">
      <ToastStack toasts={toasts} onClose={fecharToast} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0"><Bike className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Motoboys Disponíveis</h1>
            <p className="text-sm text-gray-500">Motoboys que a ativação conseguiu e ainda não têm vaga. O suporte vê esta lista na Disponibilidade da Central em tempo real.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full border', aoVivo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200')}>
            {aoVivo ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {aoVivo ? 'Ao vivo · sincronizado com a Central' : 'Atualizando a cada 10s'}
          </span>
          <button onClick={exportarCsv} disabled={!lista.length} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"><Download className="w-3.5 h-3.5" /> Exportar CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start">
        {/* ── Form de cadastro ── */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 xl:sticky xl:top-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><Plus className="w-4 h-4 text-blue-600" /> Cadastrar motoboy disponível</h2>
          <p className="text-xs text-gray-500 mt-1 mb-4">Digite só o código — nome, telefone e região vêm do cadastro da Central.</p>

          <label htmlFor="disp-cod" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Código</label>
          <div className="relative">
            <input id="disp-cod" value={cod} onChange={e => setCod(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Ex.: 5946" autoComplete="off"
              className={clsx('w-full h-11 px-3.5 pr-10 rounded-xl border-2 text-base font-bold text-gray-900 focus:outline-none', lookup && !lookup.encontrado ? 'border-red-500 ring-4 ring-red-100' : lookup?.encontrado ? 'border-emerald-500 ring-4 ring-emerald-100' : 'border-blue-500 ring-4 ring-blue-100')} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{buscandoCod ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</span>
          </div>

          {lookup && !lookup.encontrado && (
            <div className="mt-2 flex gap-2 items-start bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-[12.5px] text-red-800"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>Código <b>{lookup.cod}</b> não existe no cadastro da Central. Confira o código no app do motoboy.</span></div>
          )}
          {lookup?.encontrado && (
            <div className="mt-3 grid grid-cols-1 gap-2.5">
              <div><div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Nome <span className="text-emerald-600 normal-case tracking-normal font-semibold">· encontrado</span></div><div className="h-10 flex items-center px-3 rounded-lg bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-900">{lookup.nome}</div></div>
              <div className="grid grid-cols-2 gap-2.5">
                <div><div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Telefone</div><div className="h-10 flex items-center px-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-800">{lookup.telefone || '—'}</div></div>
                <div><div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Região · Cidade</div><div className="h-10 flex items-center px-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-800 truncate">{[lookup.regiao, lookup.cidade].filter(Boolean).join(' · ') || '—'}</div></div>
              </div>
              {lookup.ja_na_lista && (
                <div className="flex flex-col gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[12.5px] text-amber-900">
                  <div className="flex gap-2 items-start"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span><b>{lookup.cod} · {lookup.nome}</b> já está na lista (cadastrado por {lookup.ja_na_lista.por || '—'}, {fHora(lookup.ja_na_lista.em).toLowerCase()}). Quer atualizar a observação?</span></div>
                  <div className="flex gap-2"><button onClick={editarExistente} className="flex-1 h-9 rounded-lg bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700">Atualizar observação</button><button onClick={() => { setCod(''); setLookup(null); }} className="h-9 px-3.5 rounded-lg border border-gray-200 bg-white text-[13px] font-semibold text-gray-700">Cancelar</button></div>
                </div>
              )}
              {lookup.escalado && !lookup.ja_na_lista && (
                <div className="flex gap-2 items-start bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5 text-[12.5px] text-violet-900"><Info className="w-4 h-4 shrink-0 mt-0.5" /><span><b>{lookup.cod} · {lookup.nome}</b> já está escalado hoje na Disponibilidade ({lookup.escalado.loja}, {lookup.escalado.status.toLowerCase()}). Provavelmente não precisa entrar na lista.</span></div>
              )}
            </div>
          )}

          <label htmlFor="disp-disp" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mt-3 mb-1">Disponibilidade</label>
          <input id="disp-disp" value={disponibilidade} onChange={e => setDisponibilidade(e.target.value)} placeholder="Ex.: manhã e tarde, seg a sáb" maxLength={200} className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-blue-500" />
          <label htmlFor="disp-obs" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mt-3 mb-1">Observação</label>
          <textarea id="disp-obs" value={observacao} onChange={e => setObservacao(e.target.value)} rows={3} placeholder="Tem moto própria? Prefere qual região/operação? Já trabalhou com alguém?" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-blue-500 resize-none" />

          <button onClick={adicionar} disabled={!podeAdicionar} className={clsx('mt-4 w-full h-11 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2', podeAdicionar ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed')}>
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar à lista
          </button>
          <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1"><Clock className="w-3 h-3" /> Cadastrado como <b className="text-gray-600">{user?.nome || '—'}</b> · aparece na Central em menos de 1s.</p>
        </section>

        {/* ── Lista ── */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 mr-2">Na lista · <span className="text-blue-600">{lista.length}</span> {lista.length === 1 ? 'motoboy' : 'motoboys'}</h2>
            <div className="relative ml-auto">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por código, nome, região..." className="h-9 pl-8 pr-3 rounded-lg border border-gray-200 text-sm w-[260px] focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
            <button onClick={() => setFiltroRegiao('')} className={clsx('text-xs font-bold px-2.5 py-1 rounded-full', !filtroRegiao ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100')}>Todas as regiões</button>
            {regioes.map(([r, n]) => (
              <button key={r} onClick={() => setFiltroRegiao(filtroRegiao === r ? '' : r)} className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full', filtroRegiao === r ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100')}>{r} · {n}</button>
            ))}
          </div>

          {erro && <div className="m-4 flex gap-2 items-center bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-800"><AlertCircle className="w-4 h-4" /> {erro} <button onClick={() => carregar()} className="ml-auto underline font-semibold">tentar de novo</button></div>}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : visiveis.length === 0 ? (
            <div className="text-center py-16 px-6 text-gray-400 text-sm">{lista.length === 0 ? 'Ninguém na lista agora. Cadastre o primeiro motoboy disponível ao lado.' : 'Nenhum motoboy bate com o filtro.'}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 bg-gray-50">
                  <th className="px-4 py-2.5 font-bold">Cód</th><th className="px-3 py-2.5 font-bold">Motoboy</th><th className="px-3 py-2.5 font-bold">Telefone</th><th className="px-3 py-2.5 font-bold">Região</th><th className="px-3 py-2.5 font-bold min-w-[240px]">Observação</th><th className="px-3 py-2.5 font-bold">Cadastrado</th><th className="px-3 py-2.5 font-bold text-right">Ações</th>
                </tr></thead>
                <tbody>
                  {visiveis.map(it => {
                    const recente = Date.now() - new Date(it.criado_em).getTime() < 15 * 60 * 1000;
                    const emEdicao = editando?.id === it.id;
                    const saindoMotivo = saindo[it.id];
                    return (
                      <tr key={it.id} id={`disp-row-${it.id}`} className={clsx('border-t border-gray-100 transition-all duration-700', saindoMotivo ? 'opacity-40 bg-violet-50' : emEdicao ? 'bg-blue-50/50' : 'hover:bg-gray-50')}>
                        <td className="px-4 py-3 align-top"><span className="font-mono text-xs font-extrabold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{it.cod_profissional}</span></td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex items-center gap-2">
                            {it.foto ? <img src={it.foto} alt="" className="w-7 h-7 rounded-full object-cover" /> : <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">{iniciais(it.nome)}</span>}
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900 truncate max-w-[220px]" title={it.nome || ''}>{it.nome || '—'}</div>
                              {saindoMotivo === 'alocado' ? <div className="text-[11px] text-violet-700 font-semibold flex items-center gap-1"><Check className="w-3 h-3" /> entrou na Disponibilidade · saindo da lista…</div>
                                : saindoMotivo === 'removido' ? <div className="text-[11px] text-red-600 font-semibold">removido · saindo da lista…</div>
                                : recente ? <div className="text-[11px] text-emerald-700 font-semibold">adicionado agora</div> : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top text-gray-700 whitespace-nowrap">{it.telefone || '—'}</td>
                        <td className="px-3 py-3 align-top"><div className="font-semibold text-gray-900">{it.regiao || 'SEM REGIÃO'}</div><div className="text-[11.5px] text-gray-500">{[it.cidade, it.disponibilidade].filter(Boolean).join(' · ')}</div></td>
                        <td className="px-3 py-3 align-top text-gray-700">
                          {emEdicao ? (
                            <div className="flex flex-col gap-1.5">
                              <input value={editando!.disponibilidade} onChange={e => setEditando({ ...editando!, disponibilidade: e.target.value })} placeholder="Disponibilidade" className="h-8 px-2 rounded-lg border border-blue-200 text-xs focus:outline-none" />
                              <textarea autoFocus rows={3} value={editando!.observacao} onChange={e => setEditando({ ...editando!, observacao: e.target.value })} placeholder="Observação" className="px-2 py-1.5 rounded-lg border-2 border-blue-500 text-xs focus:outline-none resize-none bg-white" />
                              <div className="flex gap-1.5 justify-end">
                                <button onClick={() => setEditando(null)} className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700">Cancelar</button>
                                <button onClick={salvarEdicao} disabled={busyId === it.id} className="h-8 px-3.5 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-50">Salvar</button>
                              </div>
                              {it.obs_historico?.length > 1 && <div className="text-[10.5px] text-gray-500">Histórico: {it.obs_historico.slice(-3).map(o => `${o.por || '—'}${o.onde ? ` (${o.onde === 'crm' ? 'CRM' : 'Central'})` : ''} ${fHora(o.em)}`).join(' → ')}</div>}
                            </div>
                          ) : it.observacao ? <span className="leading-snug">{it.observacao}</span> : <span className="text-gray-400 italic">Sem observação</span>}
                        </td>
                        <td className="px-3 py-3 align-top text-[12px] text-gray-500 whitespace-nowrap">{fHora(it.criado_em)}<div>por <b className="text-gray-700">{it.criado_por || '—'}</b>{it.origem === 'central' && <span className="ml-1 text-[10px] font-bold text-violet-700 bg-violet-50 px-1 rounded">Central</span>}</div></td>
                        <td className="px-3 py-3 align-top">
                          {!emEdicao && !saindoMotivo && (
                            <div className="flex gap-1.5 justify-end">
                              <button aria-label="Editar observação" disabled={busyId === it.id} onClick={() => setEditando({ id: it.id, observacao: it.observacao || '', disponibilidade: it.disponibilidade || '' })} className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex items-center justify-center disabled:opacity-50"><Pencil className="w-3.5 h-3.5" /></button>
                              <button aria-label="Remover da lista" disabled={busyId === it.id} onClick={() => remover(it)} className="w-8 h-8 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 flex items-center justify-center disabled:opacity-50">{busyId === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-gray-100 text-[11.5px] text-gray-400 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Quando o suporte coloca um motoboy na Disponibilidade da Central, ele sai desta lista sozinho.</div>
        </section>
      </div>
    </div>
  );
}

export default function DisponiveisPage() {
  return (
    <AuthLayout>
      <DisponiveisContent />
    </AuthLayout>
  );
}
