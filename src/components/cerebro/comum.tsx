'use client';

// ===========================================
// Cérebro da Tati — tipos e pecinhas visuais compartilhadas (CEREBRO_TATI_V1)
// ===========================================

import clsx from 'clsx';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

export type Modal = 'moto' | 'carro';

export interface Cidade {
  id?: number;
  uf: string;
  cidade: string;
  termos: string[];
  modais: string[];
  ambigua: boolean;
  ddds: string[];
  ibge_id?: number | null;
  ativo: boolean;
}

export interface Area {
  uf: string;
  nome: string;
  atende: boolean;
  todas_cidades: boolean;
  modais_padrao: string[];
  atualizado_em: string | null;
  atualizado_por: string | null;
  cidades: Cidade[];
  total_cidades: number;
  municipios_ibge: number;
}

export interface Secao { indice: number; titulo: string | null; texto: string; automatica: 'cobertura' | 'conhecimento' | null; }
export interface PromptInfo {
  fonte: 'banco' | 'codigo';
  versao: number;
  criado_por: string | null;
  criado_em: string | null;
  resumo: string | null;
  secoes: Secao[];
  cobertura_dinamica: boolean;
  cobertura_texto?: string; // CEREBRO_TATI_V2
  cobertura_como?: 'marcador' | 'secao' | 'bloco' | 'fim';
  contradicoes?: { linha: number; texto: string }[];
  texto_final: string;
  tamanho: number;
  conhecimentos_ativos: number;
  versoes: { versao: number; ativa: boolean; criado_por: string | null; criado_em: string | null; resumo_mudancas: string | null }[];
}

export type TipoConhecimento = 'informacao' | 'regra' | 'nao_falar' | 'aviso';
export interface Conhecimento {
  id: number;
  tipo: TipoConhecimento;
  titulo: string;
  conteudo: string;
  ativo: boolean;
  valido_ate: string | null;
  vencido?: boolean;
  criado_por?: string | null;
  criado_em?: string | null;
  atualizado_por?: string | null;
  atualizado_em?: string | null;
}
export interface RascunhoConhecimento { tipo: TipoConhecimento; titulo: string; conteudo: string; valido_ate: string; }

export const TIPOS: Record<TipoConhecimento, { label: string; cor: string; ajuda: string }> = {
  informacao: { label: 'Informação', cor: 'bg-blue-50 text-blue-700', ajuda: 'Algo que ela precisa saber e pode contar ao lead.' },
  regra: { label: 'Regra', cor: 'bg-purple-50 text-purple-700', ajuda: 'Como ela deve agir numa situação.' },
  nao_falar: { label: 'Não falar', cor: 'bg-red-50 text-red-700', ajuda: 'Assunto que ela não comenta, mesmo se perguntarem.' },
  aviso: { label: 'Aviso com prazo', cor: 'bg-amber-50 text-amber-700', ajuda: 'Vale até a data escolhida e depois some sozinho.' },
};

export function normalizar(s: string): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function fmtData(iso: string | null | undefined, comHora = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }
  return new Intl.DateTimeFormat('pt-BR', Object.assign({ timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', year: 'numeric' } as Intl.DateTimeFormatOptions,
    comHora ? { hour: '2-digit', minute: '2-digit' } : {})).format(d);
}

export function fmtDia(isoDia: string | null | undefined): string {
  const m = String(isoDia || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : '';
}

export function Pill({ children, cor }: { children: React.ReactNode; cor: string }) {
  return <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap', cor)}>{children}</span>;
}

export function Chips({ opcoes, valor, onChange, multi = true, disabled }: {
  opcoes: { v: string; l: string }[]; valor: string[]; onChange: (v: string[]) => void; multi?: boolean; disabled?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1">
      {opcoes.map((o) => {
        const on = valor.includes(o.v);
        return (
          <button key={o.v} type="button" disabled={disabled} aria-pressed={on}
            onClick={() => onChange(multi ? (on ? valor.filter((x) => x !== o.v) : valor.concat(o.v)) : [o.v])}
            className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50',
              on ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400')}>
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={clsx('relative w-10 h-6 rounded-full flex-none transition-colors disabled:opacity-50', on ? 'bg-purple-600' : 'bg-gray-300')}>
      <span className={clsx('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

export function Aviso({ tipo, children }: { tipo: 'erro' | 'ok' | 'info' | 'atencao'; children: React.ReactNode }) {
  const cfg = {
    erro: { c: 'bg-red-50 border-red-200 text-red-800', I: AlertCircle },
    ok: { c: 'bg-green-50 border-green-200 text-green-800', I: CheckCircle },
    info: { c: 'bg-purple-50 border-purple-200 text-purple-900', I: Info },
    atencao: { c: 'bg-amber-50 border-amber-200 text-amber-900', I: AlertCircle },
  }[tipo];
  return (
    <div className={clsx('flex gap-2 items-start border rounded-lg px-3 py-2.5 text-sm', cfg.c)}>
      <cfg.I className="w-4 h-4 mt-0.5 flex-none" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export const MODAIS_OPCOES = [{ v: 'moto', l: 'Moto' }, { v: 'carro', l: 'Carro' }];
