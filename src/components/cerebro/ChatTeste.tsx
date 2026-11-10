'use client';

// ===========================================
// Cérebro da Tati — Chat de teste (CEREBRO_TATI_V1)
// CEREBRO_TATI_V2: cidade pelo DDD aparece como "provável" (71 = Salvador, a cidade principal do DDD)
// Simula a Tati com as instruções, áreas e conhecimentos salvos (+ o rascunho de "Ensinar"),
// sem mandar nada para o WhatsApp, Kanban ou planilha.
// ===========================================

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Loader2, PenLine, RotateCcw, Send, X } from 'lucide-react';
import { useApi } from '@/lib/hooks';
import { Aviso, Pill, RascunhoConhecimento, TIPOS } from './comum';

interface Msg { de: 'lead' | 'tati'; texto: string; blocos?: string[]; hora: string; }
interface Resultado {
  blocos: string[]; resposta: string; modelo: string; ms: number; encaminharia: boolean; enviou_link: boolean;
  cidade: { nome: string; uf?: string; atende: boolean; modais: string[]; pelo: 'texto' | 'ddd'; origem?: string | null } | null;
  checklist: Record<string, any> | null; conhecimentos_ativos: number;
}

const ITENS: { k: string; l: string }[] = [
  { k: 'nome_completo', l: 'Nome completo' }, { k: 'veiculo', l: 'Veículo' }, { k: 'tem_caixote_ou_bau', l: 'Baú ou caixote' },
  { k: 'regiao', l: 'Cidade onde vai rodar' }, { k: 'disponibilidade_comercial', l: 'Horário comercial' },
  { k: 'baixou_app', l: 'Baixou o app' }, { k: 'cadastro_completo', l: 'Enviou documentos' },
];

const hora = () => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
const valorCheck = (v: any) => v === true ? 'sim' : v === false ? 'não' : typeof v === 'string' && v ? v : null;

export default function ChatTeste({ rascunho, limparRascunho, corrigir }: {
  rascunho: RascunhoConhecimento | null; limparRascunho: () => void; corrigir: (leadMsg: string, resposta: string) => void;
}) {
  const { fetchApi } = useApi();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [txt, setTxt] = useState('');
  const [ddd, setDdd] = useState('');
  const [nome, setNome] = useState('');
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ult, setUlt] = useState<Resultado | null>(null);
  const fimRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [msgs.length, pensando]);

  const enviar = async () => {
    const t = txt.trim();
    if (!t || pensando) return;
    const novas: Msg[] = msgs.concat({ de: 'lead', texto: t, hora: hora() });
    setMsgs(novas); setTxt(''); setErro(null); setPensando(true);
    const corpo = {
      mensagens: novas.map((m) => ({ de: m.de, texto: m.texto })),
      ddd: ddd || undefined, nome_whatsapp: nome || undefined,
      extras: rascunho && rascunho.conteudo.trim() ? [{ tipo: rascunho.tipo, titulo: rascunho.titulo || 'Rascunho', conteudo: rascunho.conteudo, valido_ate: rascunho.valido_ate || null }] : undefined,
    };
    const { data, error } = await fetchApi<Resultado>('/api/cerebro/simular', { method: 'POST', body: JSON.stringify(corpo) });
    setPensando(false);
    if (error || !data) { setErro(error || 'A Tati não respondeu'); return; }
    setUlt(data);
    setMsgs(novas.concat({ de: 'tati', texto: data.resposta, blocos: data.blocos, hora: hora() }));
  };

  const recomecar = () => { setMsgs([]); setUlt(null); setErro(null); setTxt(''); };
  const linkJaFoi = msgs.some((m) => m.de === 'tati' && /play\.google\.com/.test(m.texto));
  const ck = ult && ult.checklist;
  const coletou = ck ? ITENS.filter((i) => valorCheck(ck[i.k])) : [];
  const falta = ck ? ITENS.filter((i) => !valorCheck(ck[i.k])) : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_330px] items-start">
      <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <b className="flex-1 text-gray-900 min-w-[140px]">Conversa simulada</b>
          <label className="text-xs text-gray-500 flex items-center gap-1.5">DDD do lead
            <input value={ddd} onChange={(e) => setDdd(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="71" inputMode="numeric"
              className="w-12 px-2 py-1 rounded-md border border-gray-300 text-sm text-gray-900 text-center" /></label>
          <label className="text-xs text-gray-500 flex items-center gap-1.5">Nome no WhatsApp
            <input value={nome} onChange={(e) => setNome(e.target.value.slice(0, 60))} placeholder="opcional"
              className="w-28 px-2 py-1 rounded-md border border-gray-300 text-sm text-gray-900" /></label>
          <button type="button" onClick={recomecar} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"><RotateCcw className="w-3.5 h-3.5" />Recomeçar</button>
        </div>
        {rascunho && rascunho.conteudo.trim() && (
          <div className="mb-3"><Aviso tipo="info">
            <span className="font-semibold">Testando com o rascunho</span> ({TIPOS[rascunho.tipo].label}{rascunho.titulo ? ': ' + rascunho.titulo : ''}), ainda não salvo.
            <button type="button" onClick={limparRascunho} className="ml-2 underline">Testar sem ele</button>
          </Aviso></div>
        )}
        <div className="rounded-xl p-3 sm:p-4 flex flex-col gap-2 min-h-[380px] max-h-[62vh] overflow-y-auto" style={{ background: '#efeae2' }}>
          {msgs.length === 0 && !pensando && (
            <div className="m-auto text-center text-sm text-gray-600 max-w-xs">Escreva como se fosse um motoboy chegando no WhatsApp. Ex.: “oi, vi o post, sou de feira de santana”.</div>
          )}
          {msgs.map((m, i) => m.de === 'lead' ? (
            <div key={i} className="self-start max-w-[82%] bg-white rounded-lg px-3 py-2 shadow-sm text-sm text-gray-900 whitespace-pre-wrap break-words">
              {m.texto}<div className="text-[10.5px] text-gray-500 text-right mt-0.5">{m.hora}</div>
            </div>
          ) : (
            <div key={i} className="self-end max-w-[82%] flex flex-col items-end gap-1">
              {(m.blocos && m.blocos.length ? m.blocos : [m.texto]).map((b, j, arr) => (
                <div key={j} className="bg-[#d9fdd3] rounded-lg px-3 py-2 shadow-sm text-sm text-gray-900 whitespace-pre-wrap break-words">
                  {b}{j === arr.length - 1 && <div className="text-[10.5px] text-gray-500 text-right mt-0.5">{m.hora} · Tati</div>}
                </div>
              ))}
              <button type="button" onClick={() => { const anterior = msgs.slice(0, i).reverse().find((x) => x.de === 'lead'); corrigir(anterior ? anterior.texto : '', m.texto); }}
                className="text-[11.5px] text-purple-700 font-semibold inline-flex items-center gap-1 hover:underline"><PenLine className="w-3 h-3" />Corrigir esta resposta</button>
            </div>
          ))}
          {pensando && <div className="self-end bg-[#d9fdd3]/70 rounded-lg px-3 py-2 text-sm text-gray-600 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />digitando…</div>}
          <div ref={fimRef} />
        </div>
        {erro && <div className="mt-2"><Aviso tipo="erro">{erro}</Aviso></div>}
        <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
          <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Escreva como se fosse o lead…" aria-label="Mensagem do lead"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          <button type="submit" disabled={!txt.trim() || pensando} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"><Send className="w-4 h-4" />Enviar</button>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm lg:sticky lg:top-4">
        <b className="block text-gray-900 mb-2">O que ela entendeu</b>
        {!ult ? <p className="text-gray-500 text-sm">Aparece aqui depois da primeira resposta.</p> : (
          <div className="divide-y divide-gray-100">
            <Linha l="Cidade">{ult.cidade ? <b>{ult.cidade.nome}{ult.cidade.uf ? ` (${ult.cidade.uf})` : ''}{ult.cidade.pelo === 'ddd' ? <span className="font-normal text-gray-500"> · provável, pelo DDD</span> : null}</b> : <span className="text-gray-500">não identificada</span>}</Linha>
            {ult.cidade && <Linha l="Atende?">{ult.cidade.atende ? <Pill cor="bg-green-50 text-green-700">Sim · {ult.cidade.modais.join(' e ')}</Pill> : <Pill cor="bg-gray-100 text-gray-600">Sem operação</Pill>}</Linha>}
            <Linha l="Já coletou">{coletou.length ? coletou.map((i) => i.l.toLowerCase()).join(', ') : '—'}</Linha>
            <Linha l="Falta">{falta.length ? falta.map((i) => i.l.toLowerCase()).join(', ') : 'nada'}</Linha>
            <Linha l="Mandou o link?">{linkJaFoi ? 'sim' : 'ainda não'}</Linha>
            <Linha l="Encaminharia?">{ult.encaminharia ? <Pill cor="bg-amber-50 text-amber-700">Sim · passaria para um atendente</Pill> : 'não'}</Linha>
            <Linha l="Conhecimentos">{ult.conhecimentos_ativos} valendo</Linha>
            <Linha l="Modelo">{ult.modelo} · {(ult.ms / 1000).toFixed(1)}s</Linha>
          </div>
        )}
        <div className={clsx('mt-3 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-xs text-purple-900')}>
          Usa exatamente as instruções, áreas e conhecimentos salvos. Nada vai para o WhatsApp, para o Kanban nem para a planilha.
        </div>
        {msgs.length > 0 && <button type="button" onClick={recomecar} className="mt-3 w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"><X className="w-3.5 h-3.5" />Limpar conversa</button>}
      </div>
    </div>
  );
}

function Linha({ l, children }: { l: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3 py-2"><span className="text-gray-500 flex-none">{l}</span><span className="text-right text-gray-900 min-w-0 break-words">{children}</span></div>;
}
