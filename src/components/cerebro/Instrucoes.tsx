'use client';

// ===========================================
// Cérebro da Tati — Conhecimento atual (instruções por seção, com versão) (CEREBRO_TATI_V1)
// CEREBRO_TATI_V2: a seção Cobertura mostra as cidades e veículos que vêm da aba Áreas
// ===========================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ChevronDown, ChevronUp, FileText, History as HistoryIcon, Loader2, Pencil, Save, X } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { Aviso, Pill, PromptInfo, Secao, fmtData } from './comum';

function resumoCobertura(c: string | undefined) {
  if (!c) return '[cidades e veículos da aba Áreas de atendimento]';
  const linhas = c.split('\n').filter((l) => /^- [A-Z]{2}[ ,:—]/.test(l));
  return linhas.length ? linhas.map((l) => l.replace(/^- /, '')).join(' · ') : '[cidades e veículos da aba Áreas de atendimento]';
}

function previa(t: string, cobertura?: string, n = 260) {
  const limpo = t.replace(/\{\{COBERTURA\}\}/g, resumoCobertura(cobertura)).replace(/[#*]/g, '').replace(/\n{2,}/g, '\n').trim();
  return limpo.length > n ? limpo.slice(0, n).replace(/\s+\S*$/, '') + '…' : limpo;
}

export default function Instrucoes({ irPara }: { irPara: (aba: 'areas' | 'ensinar') => void }) {
  const { fetchApi } = useApi();
  const [p, setP] = useState<PromptInfo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; t: string } | null>(null);
  const [verTudo, setVerTudo] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await fetchApi<PromptInfo>('/api/cerebro/prompt', { cache: 'no-store' });
    if (error || !data) { setErro(error || 'Não deu para carregar as instruções'); return; }
    setErro(null); setP(data);
  }, [fetchApi]);
  useEffect(() => { carregar(); }, [carregar]);

  const editar = (s: Secao) => {
    if (editando != null && editando !== s.indice && !window.confirm('Descartar a edição da outra seção?')) return;
    setEditando(s.indice); setTexto(s.texto); setMotivo(''); setMsg(null); setAberta(s.indice);
  };

  const salvar = async (s: Secao) => {
    if (!p) return;
    setSalvando(true); setMsg(null);
    const { data, error } = await fetchApi<{ versao: number }>('/api/cerebro/prompt/secao', {
      method: 'PUT', body: JSON.stringify({ indice: s.indice, titulo: s.titulo, texto, versao_base: p.versao, motivo: motivo.trim() || undefined }),
    });
    setSalvando(false);
    if (error || !data) { setMsg({ tipo: 'erro', t: error || 'Não deu para salvar' }); return; }
    setEditando(null);
    setMsg({ tipo: 'ok', t: `Salvo como versão ${data.versao}. A Tati já usa a partir da próxima mensagem.` });
    carregar();
  };

  if (erro) return <Aviso tipo="erro">{erro} <button className="underline ml-1" onClick={carregar}>Tentar de novo</button></Aviso>;
  if (!p) return <div className="flex items-center gap-2 text-gray-500 py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Carregando instruções…</div>;

  return (
    <div className="space-y-3">
      {!!p.contradicoes?.length && (
        <Aviso tipo="atencao">
          Estas frases das instruções contradizem as Áreas de atendimento (a Tati pode ficar em dúvida). Vale editar a seção onde elas estão:
          <ul className="list-disc ml-5 mt-1 space-y-0.5">{p.contradicoes.map((c) => <li key={c.linha}><i>“{c.texto}”</i></li>)}</ul>
        </Aviso>
      )}
      {!p.cobertura_dinamica && (
        <Aviso tipo="atencao">
          As instruções ativas têm uma lista de cidades escrita à mão. A Tati já recebe as <b>Áreas de atendimento</b> no fim (e elas mandam), mas o ideal é editar a seção <b>Cobertura</b> e trocar a lista pela linha <code className="bg-white px-1 rounded">{'{{COBERTURA}}'}</code>, para não ter duas listas.
        </Aviso>
      )}
      {msg && <Aviso tipo={msg.tipo}>{msg.t}</Aviso>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-200">
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2 flex-wrap">
              <b className="text-gray-900">Instruções da Tatiane</b>
              {p.fonte === 'banco' ? <Pill cor="bg-green-50 text-green-700">versão {p.versao} · ativa</Pill> : <Pill cor="bg-gray-100 text-gray-600">texto padrão do sistema</Pill>}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {p.fonte === 'banco' ? [p.criado_em ? 'Desde ' + fmtData(p.criado_em, true) : null, p.criado_por ? 'por ' + p.criado_por : null].filter(Boolean).join(' · ') : 'Ao editar uma seção, ela vira a versão 1 no banco.'}
              {p.resumo && p.fonte === 'banco' ? ' · ' + p.resumo : ''}
            </p>
          </div>
          <Link href="/saude-tatiane/licoes" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"><HistoryIcon className="w-3.5 h-3.5" />Versões anteriores</Link>
          <button type="button" onClick={() => setVerTudo(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"><FileText className="w-3.5 h-3.5" />Ver texto completo</button>
        </div>

        {p.secoes.map((s) => {
          const ed = editando === s.indice;
          const open = aberta === s.indice || ed;
          const auto = s.automatica === 'cobertura';
          const soMarcador = auto && s.texto.trim() === '{{COBERTURA}}';
          return (
            <div key={s.indice} className="border-t border-gray-100 first:border-t-0 px-4 py-3">
              <div className="flex flex-wrap gap-3 items-start">
                <div className="sm:w-56 flex-none">
                  <div className="font-semibold text-gray-900 text-sm flex items-center gap-2 flex-wrap">{s.titulo || 'Cabeçalho'}{auto && <Pill cor="bg-purple-50 text-purple-700">cidades automáticas</Pill>}</div>
                </div>
                <div className="flex-1 min-w-[220px]">
                  {!ed && (
                    <button type="button" onClick={() => setAberta(open ? null : s.indice)} className="text-left w-full">
                      {open
                        ? (auto
                          ? <TextoComCobertura texto={s.texto} cobertura={p.cobertura_texto} />
                          : <pre className="whitespace-pre-wrap text-[13px] text-gray-800 font-sans leading-relaxed">{s.texto}</pre>)
                        : <p className="text-sm text-gray-700 leading-relaxed">{previa(s.texto, p.cobertura_texto)}</p>}
                      <span className="text-xs text-purple-700 font-medium inline-flex items-center gap-0.5 mt-1">{open ? <>Fechar <ChevronUp className="w-3 h-3" /></> : <>Ver tudo <ChevronDown className="w-3 h-3" /></>}</span>
                    </button>
                  )}
                  {ed && (
                    <div className="space-y-2">
                      {auto && <Aviso tipo="info">Mantenha a linha <code className="bg-white px-1 rounded">{'{{COBERTURA}}'}</code>: é nela que entram as cidades. Para mudar cidades, use a aba Áreas de atendimento.</Aviso>}
                      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={Math.min(28, Math.max(6, texto.split('\n').length + 2))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-[13px] font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-purple-400" />
                      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="O que mudou? (aparece no histórico de versões)"
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                      <div className="flex flex-wrap gap-2 justify-end">
                        <button type="button" onClick={() => setEditando(null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"><X className="w-4 h-4" />Cancelar</button>
                        <button type="button" disabled={salvando || texto.trim() === s.texto.trim()} onClick={() => salvar(s)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50">
                          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Salvar como versão nova
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {!ed && (
                  <div className="flex gap-2">
                    {auto && <button type="button" onClick={() => irPara('areas')} className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50">Ir para Áreas</button>}
                    {!soMarcador && <button type="button" onClick={() => editar(s)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"><Pencil className="w-3.5 h-3.5" />Editar</button>}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className="border-t border-gray-100 px-4 py-3 flex flex-wrap gap-3 items-start bg-purple-50/40">
          <div className="sm:w-56 flex-none font-semibold text-gray-900 text-sm flex items-center gap-2">Ensinado pela equipe <Pill cor="bg-purple-50 text-purple-700">{p.conhecimentos_ativos} valendo</Pill></div>
          <p className="flex-1 min-w-[220px] text-sm text-gray-700">O que vocês adicionam em <b>Ensinar algo novo</b> entra no fim das instruções, e vale mais que o texto acima quando os dois falam do mesmo assunto.</p>
          <button type="button" onClick={() => irPara('ensinar')} className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 bg-white">Ir para Ensinar</button>
        </div>
        <div className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">
          Editar uma seção cria uma versão nova (dá para voltar a qualquer versão em Saúde Tatiane › Lições &amp; Versões). Texto final enviado à IA: {p.tamanho.toLocaleString('pt-BR')} caracteres.
        </div>
      </div>

      {verTudo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setVerTudo(false)}>
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center px-4 py-3 border-b border-gray-200"><b className="flex-1">Texto completo que vai para a IA (com cidades e conhecimentos)</b>
              <button type="button" aria-label="Fechar" onClick={() => setVerTudo(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button></div>
            <pre className={clsx('p-4 overflow-auto text-[12.5px] whitespace-pre-wrap text-gray-800 font-mono')}>{p.texto_final}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** Seção Cobertura: o texto da seção com a lista gerada pelas Áreas no lugar do marcador */
function TextoComCobertura({ texto, cobertura }: { texto: string; cobertura?: string }) {
  const partes = texto.split('{{COBERTURA}}');
  return (
    <div className="space-y-2">
      {partes.map((parte, i) => (
        <div key={i} className="space-y-2">
          {parte.trim() && <pre className="whitespace-pre-wrap text-[13px] text-gray-800 font-sans leading-relaxed">{parte.trim()}</pre>}
          {i < partes.length - 1 && (
            <div className="border-l-[3px] border-purple-400 bg-purple-50/60 rounded-r-lg px-3 py-2">
              <div className="text-[11px] font-semibold text-purple-700 uppercase tracking-wide mb-1">Vem da aba Áreas de atendimento</div>
              <pre className="whitespace-pre-wrap text-[13px] text-gray-800 font-sans leading-relaxed">{cobertura || '(as cidades aparecem aqui depois de configurar as Áreas)'}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
