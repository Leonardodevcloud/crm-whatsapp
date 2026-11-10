'use client';

// ===========================================
// Cérebro da Tati — Áreas de atendimento (CEREBRO_TATI_V1)
// Por estado: atende ou não; todas as cidades (lista do IBGE) ou só algumas; veículo.
// ===========================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Loader2, MapPin, Plus, Save, Search, Trash2, Eye, X, Undo2 } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { Area, Cidade, Chips, Switch, Pill, Aviso, MODAIS_OPCOES, normalizar, fmtData } from './comum';

interface Municipio { ibge_id: number; nome: string; }

function copiar<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function resumoUf(a: Area) {
  if (!a.atende) return <Pill cor="bg-gray-100 text-gray-600">Não atende</Pill>;
  if (a.todas_cidades) return <Pill cor="bg-green-50 text-green-700">Todas</Pill>;
  return <Pill cor="bg-purple-50 text-purple-700">{a.total_cidades} {a.total_cidades === 1 ? 'cidade' : 'cidades'}</Pill>;
}

function ListaTexto({ valor, onChange, placeholder, mono }: { valor: string[]; onChange: (v: string[]) => void; placeholder: string; mono?: boolean }) {
  const [txt, setTxt] = useState(valor.join(', '));
  useEffect(() => { setTxt(valor.join(', ')); }, [valor.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input value={txt} placeholder={placeholder}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => onChange(txt.split(',').map((s) => s.trim()).filter(Boolean))}
      className={clsx('w-full min-w-[120px] px-2 py-1.5 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400', mono && 'font-mono')} />
  );
}

export default function Areas() {
  const { fetchApi } = useApi();
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [cobertura, setCobertura] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [uf, setUf] = useState<string>('BA');
  const [draft, setDraft] = useState<Area | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; t: string } | null>(null);
  const [verTexto, setVerTexto] = useState(false);
  const [muni, setMuni] = useState<Record<string, Municipio[]>>({});
  const [carregandoMuni, setCarregandoMuni] = useState(false);
  const [erroMuni, setErroMuni] = useState<string | null>(null);
  const muniEmVoo = useRef<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [abrirBusca, setAbrirBusca] = useState(false);
  const detalheRef = useRef<HTMLDivElement | null>(null);

  const carregar = useCallback(async (manterUf?: string) => {
    const { data, error } = await fetchApi<{ areas: Area[]; cobertura: string }>('/api/cerebro/estado', { cache: 'no-store' });
    if (error || !data) { setErro(error || 'Não deu para carregar as áreas'); return; }
    setErro(null);
    setAreas(data.areas);
    setCobertura(data.cobertura || '');
    const alvo = manterUf || uf;
    const a = data.areas.find((x) => x.uf === alvo) || data.areas.find((x) => x.atende) || data.areas[0];
    setUf(a.uf);
    setDraft(copiar(a));
  }, [fetchApi, uf]);

  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const original = useMemo(() => (areas || []).find((a) => a.uf === uf) || null, [areas, uf]);
  const sujo = !!(draft && original && JSON.stringify(normalizarArea(draft)) !== JSON.stringify(normalizarArea(original)));

  const escolherUf = (novo: string) => {
    if (novo === uf) return;
    if (sujo && !window.confirm('Há mudanças não salvas neste estado. Descartar?')) return;
    const a = (areas || []).find((x) => x.uf === novo);
    if (!a) return;
    setUf(novo); setDraft(copiar(a)); setMsg(null); setBusca(''); setAbrirBusca(false); setErroMuni(null);
    setTimeout(() => { if (detalheRef.current && window.innerWidth < 1024) detalheRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  };

  // CEREBRO_TATI_V2: o servidor tem a lista do IBGE junto do código; se mesmo assim falhar,
  // o navegador busca direto no IBGE e manda guardar no servidor.
  const carregarMunicipios = useCallback(async (sigla: string, forcar = false) => {
    if ((muni[sigla] && !forcar) || muniEmVoo.current.has(sigla)) return;
    muniEmVoo.current.add(sigla);
    setCarregandoMuni(true); setErroMuni(null);
    try {
      const { data, error } = await fetchApi<{ municipios: Municipio[] }>(`/api/cerebro/municipios/${sigla}`, { cache: 'no-store' });
      if (!error && data && data.municipios?.length) { setMuni((m) => Object.assign({}, m, { [sigla]: data.municipios })); return; }
      try {
        const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${sigla}/municipios`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const bruto = (await r.json()) as { id: number; nome: string }[];
        const lista = bruto.filter((x) => x && x.id && x.nome).map((x) => ({ ibge_id: x.id, nome: x.nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        if (!lista.length) throw new Error('lista vazia');
        setMuni((m) => Object.assign({}, m, { [sigla]: lista }));
        fetchApi(`/api/cerebro/municipios/${sigla}`, { method: 'POST', body: JSON.stringify({ municipios: lista }) }).catch(() => undefined);
      } catch {
        setErroMuni(`Não consegui carregar a lista de cidades (${error || 'servidor sem resposta'}). Você ainda pode adicionar pelo nome.`);
      }
    } finally {
      muniEmVoo.current.delete(sigla);
      setCarregandoMuni(false);
    }
  }, [fetchApi, muni]);

  const alterar = (fn: (a: Area) => void) => setDraft((d) => { if (!d) return d; const n = copiar(d); fn(n); return n; });
  const alterarCidade = (i: number, fn: (c: Cidade) => void) => alterar((a) => { fn(a.cidades[i]); });

  const adicionar = (nome: string, ibge_id: number | null) => {
    if (!draft) return;
    const k = normalizar(nome);
    if (!k) return;
    if (draft.cidades.some((c) => normalizar(c.cidade) === k)) { setMsg({ tipo: 'erro', t: `${nome} já está na lista` }); return; }
    alterar((a) => { a.cidades.unshift({ uf: a.uf, cidade: nome.trim(), termos: [], modais: (a.modais_padrao || ['moto']).slice(), ambigua: false, ddds: [], ibge_id, ativo: true }); });
    setBusca(''); setAbrirBusca(false); setMsg(null);
  };

  const salvar = async () => {
    if (!draft) return;
    setSalvando(true); setMsg(null);
    const corpo = {
      atende: draft.atende, todas_cidades: draft.todas_cidades, modais_padrao: draft.modais_padrao,
      cidades: draft.cidades.map((c) => ({ cidade: c.cidade, termos: c.termos, modais: c.modais, ambigua: c.ambigua, ddds: c.ddds, ibge_id: c.ibge_id || null, ativo: c.ativo !== false })),
    };
    const { data, error } = await fetchApi<{ areas: Area[]; cobertura: string }>(`/api/cerebro/areas/${draft.uf}`, { method: 'PUT', body: JSON.stringify(corpo) });
    setSalvando(false);
    if (error || !data) { setMsg({ tipo: 'erro', t: error || 'Não deu para salvar' }); return; }
    setAreas(data.areas); setCobertura(data.cobertura || '');
    const a = data.areas.find((x) => x.uf === draft.uf);
    if (a) setDraft(copiar(a));
    setMsg({ tipo: 'ok', t: `${draft.nome} salvo. A Tati já usa a partir da próxima mensagem.` });
  };

  const sugestoes = useMemo(() => {
    const lista = (draft && muni[draft.uf]) || [];
    const q = normalizar(busca);
    if (!q) return [];
    const ja = new Set((draft?.cidades || []).map((c) => normalizar(c.cidade)));
    return lista.filter((m) => normalizar(m.nome).includes(q) && !ja.has(normalizar(m.nome)))
      .sort((x, y) => (normalizar(x.nome).startsWith(q) ? 0 : 1) - (normalizar(y.nome).startsWith(q) ? 0 : 1) || x.nome.localeCompare(y.nome, 'pt-BR'))
      .slice(0, 8);
  }, [busca, muni, draft]);

  if (erro) return <Aviso tipo="erro">{erro} <button className="underline ml-1" onClick={() => carregar()}>Tentar de novo</button></Aviso>;
  if (!areas || !draft) return <div className="flex items-center gap-2 text-gray-500 py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Carregando áreas…</div>;

  const ordenadas = areas.slice().sort((x, y) => Number(y.atende) - Number(x.atende) || x.nome.localeCompare(y.nome, 'pt-BR'));
  const nAtende = areas.filter((a) => a.atende).length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[290px_minmax(0,1fr)] items-start">
      {/* Estados */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <b className="flex-1 text-gray-900">Estados</b>
          <Pill cor="bg-green-50 text-green-700">{nAtende} atendidos</Pill>
        </div>
        <div className="max-h-[260px] lg:max-h-[640px] overflow-y-auto">
          {ordenadas.map((a) => (
            <button key={a.uf} type="button" onClick={() => escolherUf(a.uf)}
              className={clsx('w-full flex items-center gap-3 px-4 py-2.5 text-left border-t border-gray-100 first:border-t-0 text-sm', a.uf === uf ? 'bg-purple-50' : 'hover:bg-gray-50')}>
              <span className="w-7 font-mono font-semibold text-gray-700">{a.uf}</span>
              <span className={clsx('flex-1 min-w-0 truncate', a.atende ? 'text-gray-900' : 'text-gray-500')}>{a.nome}</span>
              {resumoUf(a)}
            </button>
          ))}
        </div>
      </div>

      {/* Detalhe */}
      <div ref={detalheRef} className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 scroll-mt-4 min-w-0">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[180px]">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><MapPin className="w-5 h-5 text-purple-600" />{draft.nome}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{original?.atualizado_em ? `Alterado em ${fmtData(original.atualizado_em, true)}${original.atualizado_por ? ' por ' + original.atualizado_por : ''}` : 'Ainda não configurado'}</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            A Tati atende {draft.uf === 'DF' ? 'o DF' : draft.nome}
            <Switch on={draft.atende} label={`Atende ${draft.nome}`} onChange={(v) => alterar((a) => { a.atende = v; })} />
          </label>
        </div>

        {!draft.atende ? (
          <div className="mt-4">
            <Aviso tipo="info">Fora da área: se o lead for de {draft.nome}, ela não dispensa. Diz que um atendente vai confirmar a disponibilidade na região e segue com o cadastro.
              {draft.cidades.length ? ` As ${draft.cidades.length} cidades abaixo continuam sendo reconhecidas (para a etiqueta do lead).` : ''}</Aviso>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2 mt-4">
            {[{ v: true, t: 'Todas as cidades do estado', d: `Ela aceita qualquer cidade de ${draft.nome} (lista do IBGE)` }, { v: false, t: 'Só algumas cidades', d: 'Fora da lista, ela diz que o atendente confirma a região (nunca dispensa)' }].map((o) => (
              <button key={String(o.v)} type="button" onClick={() => { alterar((a) => { a.todas_cidades = o.v; }); if (o.v) carregarMunicipios(draft.uf); }}
                className={clsx('text-left border-[1.5px] rounded-xl px-3.5 py-3', draft.todas_cidades === o.v ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-purple-300')}>
                <b className="block text-sm text-gray-900">{o.t}</b><span className="text-xs text-gray-500">{o.d}</span>
              </button>
            ))}
          </div>
        )}

        {draft.atende && (
          <div className="flex flex-wrap items-center gap-2 mt-4 text-sm">
            <span className="text-gray-600">{draft.todas_cidades ? 'Veículo em todas as cidades:' : 'Veículo das cidades novas:'}</span>
            <Chips opcoes={MODAIS_OPCOES} valor={draft.modais_padrao} onChange={(v) => alterar((a) => { a.modais_padrao = v; })} />
            {draft.todas_cidades && original && original.municipios_ibge > 0 && <span className="text-xs text-gray-500">{original.municipios_ibge} cidades no IBGE</span>}
          </div>
        )}

        {/* Cidades */}
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <b className="text-sm text-gray-900 flex-1">
              {draft.todas_cidades ? 'Cidades com ajuste especial (opcional)' : 'Cidades atendidas'} <span className="text-gray-400 font-normal">· {draft.cidades.length}</span>
            </b>
          </div>
          {draft.todas_cidades && <p className="text-xs text-gray-500 mb-2">Use só para uma cidade com veículo diferente, outro nome que o lead usa ou DDD. As demais já valem.</p>}
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={busca} placeholder={`Adicionar cidade de ${draft.nome} (busca na lista do IBGE)…`}
              onFocus={() => { setAbrirBusca(true); carregarMunicipios(draft.uf); }}
              onChange={(e) => { setBusca(e.target.value); setAbrirBusca(true); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (sugestoes[0]) adicionar(sugestoes[0].nome, sugestoes[0].ibge_id); } if (e.key === 'Escape') setAbrirBusca(false); }}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            {abrirBusca && busca.trim().length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {carregandoMuni && <div className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Buscando no IBGE…</div>}
                {sugestoes.map((m) => (
                  <button key={m.ibge_id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => adicionar(m.nome, m.ibge_id)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 flex items-center gap-2"><Plus className="w-4 h-4 text-purple-600" />{m.nome}</button>
                ))}
                {!carregandoMuni && !erroMuni && muni[draft.uf] && sugestoes.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">Nenhuma cidade com esse nome na lista do IBGE ({draft.uf}){draft.cidades.some((c) => normalizar(c.cidade).includes(normalizar(busca))) ? ' (ou ela já está na lista abaixo)' : ''}.</div>
                )}
                {!carregandoMuni && (
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => adicionar(busca, null)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-600 border-t border-gray-100">
                    Adicionar “{busca.trim()}” com este nome (distrito, bairro grande…)
                  </button>
                )}
              </div>
            )}
            {erroMuni && (
              <div className="mt-1.5 text-xs text-red-700 flex flex-wrap items-center gap-2">
                <span>{erroMuni}</span>
                <button type="button" className="underline font-medium" onClick={() => carregarMunicipios(draft.uf, true)}>Tentar de novo</button>
              </div>
            )}
            {!erroMuni && muni[draft.uf] && <div className="mt-1 text-[11px] text-gray-400">{muni[draft.uf].length} cidades ({draft.uf}) na lista do IBGE</div>}
          </div>

          {draft.cidades.length === 0 ? (
            <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg px-4 py-6 text-center">
              {draft.todas_cidades ? 'Nenhum ajuste especial. Todas as cidades do estado valem com o veículo acima.' : 'Nenhuma cidade ainda. Busque acima para adicionar.'}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="font-semibold px-2 py-2">Cidade</th>
                    <th className="font-semibold px-2 py-2">Veículo</th>
                    <th className="font-semibold px-2 py-2">Outros nomes que o lead usa</th>
                    <th className="font-semibold px-2 py-2 w-24">DDD</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {draft.cidades.map((c, i) => (
                    <tr key={c.cidade + i} className="border-t border-gray-100 align-middle">
                      <td className="px-2 py-2">
                        <div className="font-semibold text-gray-900">{c.cidade}</div>
                        <button type="button" onClick={() => alterarCidade(i, (x) => { x.ambigua = !x.ambigua; })}
                          title="Também é nome de pessoa ou palavra comum: ela só conta a cidade quando o lead diz 'moro em', 'sou de'…"
                          className={clsx('mt-0.5 text-[11px] font-semibold rounded-full px-2 py-0.5', c.ambigua ? 'bg-amber-50 text-amber-700' : 'text-gray-400 hover:text-gray-600')}>
                          {c.ambigua ? 'nome comum ✓' : 'marcar como nome comum'}
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <Chips opcoes={MODAIS_OPCOES} valor={c.modais} onChange={(v) => alterarCidade(i, (x) => { x.modais = v; })} />
                        {!c.modais.length && <div className="text-[11px] text-gray-500 mt-1">sem operação (só reconhece)</div>}
                      </td>
                      <td className="px-2 py-2"><ListaTexto mono valor={c.termos.filter((t) => normalizar(t) !== normalizar(c.cidade))} placeholder="ex.: ssa, lauro" onChange={(v) => alterarCidade(i, (x) => { x.termos = v; })} /></td>
                      <td className="px-2 py-2"><ListaTexto valor={c.ddds} placeholder="71" onChange={(v) => alterarCidade(i, (x) => { x.ddds = v; })} /></td>
                      <td className="px-2 py-2 text-right">
                        <button type="button" aria-label={`Tirar ${c.cidade}`} title={`Tirar ${c.cidade}`} onClick={() => alterar((a) => { a.cidades.splice(i, 1); })}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {msg && <div className="mt-4"><Aviso tipo={msg.tipo}>{msg.t}</Aviso></div>}

        <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-gray-100">
          <span className="text-xs text-gray-500 flex-1 min-w-[200px]">O texto de cobertura que ela usa é montado sozinho a partir daqui.</span>
          <button type="button" onClick={() => setVerTexto(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"><Eye className="w-4 h-4" />Ver como ela fala hoje</button>
          {sujo && <button type="button" onClick={() => original && setDraft(copiar(original))} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"><Undo2 className="w-4 h-4" />Desfazer</button>}
          <button type="button" disabled={!sujo || salvando} onClick={salvar}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{salvando ? 'Salvando…' : `Salvar ${draft.uf === 'DF' ? 'DF' : draft.nome}`}
          </button>
        </div>
      </div>

      {verTexto && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setVerTexto(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center px-4 py-3 border-b border-gray-200"><b className="flex-1">Cobertura que a Tati usa agora</b>
              <button type="button" aria-label="Fechar" onClick={() => setVerTexto(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button></div>
            <pre className="p-4 overflow-auto text-[12.5px] whitespace-pre-wrap text-gray-800 font-mono">{cobertura}</pre>
            {sujo && <div className="px-4 pb-4"><Aviso tipo="atencao">As mudanças ainda não salvas não aparecem aqui.</Aviso></div>}
          </div>
        </div>
      )}
    </div>
  );
}

function normalizarArea(a: Area) {
  return {
    atende: a.atende, todas: a.todas_cidades, padrao: (a.modais_padrao || []).slice().sort(),
    cidades: a.cidades.map((c) => ({ n: c.cidade, t: (c.termos || []).map(normalizar).filter((t) => t !== normalizar(c.cidade)).sort(), m: (c.modais || []).slice().sort(), a: !!c.ambigua, d: (c.ddds || []).slice().sort() })),
  };
}
