'use client';

// ===========================================
// Cérebro da Tati — Ensinar algo novo (CEREBRO_TATI_V1)
// ===========================================

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { GraduationCap, Loader2, MessageCircle, Pencil, Trash2, X, Save } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { Aviso, Conhecimento, Pill, RascunhoConhecimento, Switch, TIPOS, TipoConhecimento, fmtData, fmtDia } from './comum';

const VAZIO: RascunhoConhecimento = { tipo: 'informacao', titulo: '', conteudo: '', valido_ate: '' };

export default function Ensinar({ rascunho, setRascunho, testarNoChat }: {
  rascunho: RascunhoConhecimento | null;
  setRascunho: (r: RascunhoConhecimento | null) => void;
  testarNoChat: (r: RascunhoConhecimento) => void;
}) {
  const { fetchApi } = useApi();
  const [lista, setLista] = useState<Conhecimento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<RascunhoConhecimento>(rascunho || VAZIO);
  const [editId, setEditId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; t: string } | null>(null);
  const [filtro, setFiltro] = useState<'ativos' | 'desligados' | 'todos'>('ativos');

  useEffect(() => { if (rascunho) { setForm(rascunho); setEditId(null); } }, [rascunho]);

  const carregar = useCallback(async () => {
    const { data, error } = await fetchApi<{ conhecimentos: Conhecimento[] }>('/api/cerebro/conhecimentos', { cache: 'no-store' });
    if (error || !data) { setErro(error || 'Não deu para carregar'); return; }
    setErro(null); setLista(data.conhecimentos);
  }, [fetchApi]);
  useEffect(() => { carregar(); }, [carregar]);

  const mudarForm = (patch: Partial<RascunhoConhecimento>) => { const n = Object.assign({}, form, patch); setForm(n); setRascunho(n); };
  const limpar = () => { setForm(VAZIO); setRascunho(null); setEditId(null); };

  const salvar = async () => {
    setSalvando(true); setMsg(null);
    const corpo = { tipo: form.tipo, titulo: form.titulo, conteudo: form.conteudo, valido_ate: form.valido_ate || null };
    const { error } = editId
      ? await fetchApi(`/api/cerebro/conhecimentos/${editId}`, { method: 'PUT', body: JSON.stringify(corpo) })
      : await fetchApi('/api/cerebro/conhecimentos', { method: 'POST', body: JSON.stringify(corpo) });
    setSalvando(false);
    if (error) { setMsg({ tipo: 'erro', t: error }); return; }
    setMsg({ tipo: 'ok', t: editId ? 'Atualizado. Já vale na próxima mensagem dela.' : 'Pronto, a Tati aprendeu. Já vale na próxima mensagem dela.' });
    limpar(); carregar();
  };

  const alternar = async (k: Conhecimento, ativo: boolean) => {
    setLista((l) => (l || []).map((x) => (x.id === k.id ? Object.assign({}, x, { ativo }) : x)));
    const { error } = await fetchApi(`/api/cerebro/conhecimentos/${k.id}`, { method: 'PUT', body: JSON.stringify({ ativo }) });
    if (error) { setMsg({ tipo: 'erro', t: error }); carregar(); }
  };
  const excluir = async (k: Conhecimento) => {
    if (!window.confirm(`Excluir "${k.titulo}"? Ela deixa de saber disso.`)) return;
    const { error } = await fetchApi(`/api/cerebro/conhecimentos/${k.id}`, { method: 'DELETE' });
    if (error) setMsg({ tipo: 'erro', t: error }); else carregar();
  };
  const editar = (k: Conhecimento) => {
    setEditId(k.id);
    const r = { tipo: k.tipo, titulo: k.titulo, conteudo: k.conteudo, valido_ate: k.valido_ate || '' };
    setForm(r); setRascunho(r); setMsg(null);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) document.getElementById('cerebro-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const valendo = (k: Conhecimento) => k.ativo && !k.vencido;
  const vis = (lista || []).filter((k) => filtro === 'todos' || (filtro === 'ativos' ? valendo(k) : !valendo(k)));
  const podeSalvar = form.titulo.trim() && form.conteudo.trim() && (form.tipo !== 'aviso' || form.valido_ate);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <div className="space-y-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          {(['ativos', 'desligados', 'todos'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFiltro(f)}
              className={clsx('px-3 py-1.5 rounded-full text-xs font-medium', filtro === f ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100')}>
              {f === 'ativos' ? 'Valendo' : f === 'desligados' ? 'Desligados ou vencidos' : 'Todos'}
              <span className="opacity-75 ml-1">{(lista || []).filter((k) => f === 'todos' || (f === 'ativos' ? valendo(k) : !valendo(k))).length}</span>
            </button>
          ))}
        </div>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {!lista && !erro && <div className="flex items-center gap-2 text-gray-500 py-8 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Carregando…</div>}
        {lista && vis.length === 0 && (
          <div className="p-8 bg-white border border-dashed border-gray-300 rounded-xl text-center text-gray-500">
            <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="font-medium">{filtro === 'ativos' ? 'Nada ensinado ainda' : 'Nada aqui'}</p>
            <p className="text-sm mt-1">Use o formulário ao lado para ensinar uma novidade: praça nova, mudança de repasse, regra de atendimento…</p>
          </div>
        )}
        {vis.map((k) => (
          <div key={k.id} className={clsx('bg-white border rounded-xl px-4 py-3 flex gap-3 items-start', editId === k.id ? 'border-purple-400 ring-2 ring-purple-100' : 'border-gray-200', !valendo(k) && 'opacity-70')}>
            <Pill cor={TIPOS[k.tipo].cor}>{k.tipo === 'aviso' && k.valido_ate ? `Aviso até ${fmtDia(k.valido_ate)}` : TIPOS[k.tipo].label}</Pill>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 text-sm">{k.titulo}{k.vencido && <span className="ml-2 text-xs font-medium text-gray-500">(vencido)</span>}</div>
              <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap break-words">{k.conteudo}</p>
              <div className="text-xs text-gray-500 mt-1">
                {[k.atualizado_por || k.criado_por, fmtData(k.atualizado_em || k.criado_em)].filter(Boolean).join(' · ')}
                {k.tipo !== 'aviso' && k.valido_ate ? ` · vale até ${fmtDia(k.valido_ate)}` : ''}
              </div>
              <div className="flex gap-3 mt-1.5">
                <button type="button" onClick={() => editar(k)} className="text-xs text-purple-700 font-medium inline-flex items-center gap-1 hover:underline"><Pencil className="w-3 h-3" />Editar</button>
                <button type="button" onClick={() => excluir(k)} className="text-xs text-gray-500 font-medium inline-flex items-center gap-1 hover:text-red-600"><Trash2 className="w-3 h-3" />Excluir</button>
              </div>
            </div>
            <Switch on={k.ativo} label={`${k.ativo ? 'Desligar' : 'Ligar'} ${k.titulo}`} onChange={(v) => alternar(k, v)} />
          </div>
        ))}
      </div>

      <div id="cerebro-form" className="bg-white border border-gray-200 rounded-xl p-4 lg:sticky lg:top-4 scroll-mt-4">
        <div className="flex items-center gap-2 mb-3">
          <b className="flex-1 text-gray-900">{editId ? 'Editar conhecimento' : 'Novo conhecimento'}</b>
          {(editId || form.titulo || form.conteudo) && <button type="button" onClick={limpar} className="text-xs text-gray-500 inline-flex items-center gap-1 hover:text-gray-800"><X className="w-3.5 h-3.5" />Limpar</button>}
        </div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
        <div className="flex flex-wrap gap-1 mb-1">
          {(Object.keys(TIPOS) as TipoConhecimento[]).map((t) => (
            <button key={t} type="button" aria-pressed={form.tipo === t} onClick={() => mudarForm({ tipo: t })}
              className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium border', form.tipo === t ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400')}>{TIPOS[t].label}</button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mb-3">{TIPOS[form.tipo].ajuda}</p>
        <label htmlFor="k-titulo" className="block text-xs font-medium text-gray-600 mb-1">Título</label>
        <input id="k-titulo" value={form.titulo} maxLength={160} onChange={(e) => mudarForm({ titulo: e.target.value })} placeholder="Ex.: Nova praça em Teresina"
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-purple-400" />
        <label htmlFor="k-conteudo" className="block text-xs font-medium text-gray-600 mb-1">O que ela precisa saber</label>
        <textarea id="k-conteudo" value={form.conteudo} maxLength={2000} rows={5} onChange={(e) => mudarForm({ conteudo: e.target.value })}
          placeholder="Escreva como explicaria para uma pessoa nova na equipe…"
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-purple-400" />
        <label htmlFor="k-ate" className="block text-xs font-medium text-gray-600 mb-1">Vale até {form.tipo === 'aviso' ? '' : '(opcional)'}</label>
        <input id="k-ate" type="date" value={form.valido_ate} onChange={(e) => mudarForm({ valido_ate: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-purple-400" />
        {msg && <div className="mb-3"><Aviso tipo={msg.tipo}>{msg.t}</Aviso></div>}
        <div className="flex gap-2">
          <button type="button" disabled={!form.conteudo.trim()} onClick={() => testarNoChat(form)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><MessageCircle className="w-4 h-4" />Testar no chat</button>
          <button type="button" disabled={!podeSalvar || salvando} onClick={salvar}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : editId ? <Save className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}{editId ? 'Salvar alteração' : 'Ensinar a Tati'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">“Testar no chat” usa este texto sem salvar, para ver como ela responde antes.</p>
      </div>
    </div>
  );
}
