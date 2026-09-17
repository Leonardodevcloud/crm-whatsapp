'use client';

// ===========================================
// Tela: /config-contato  (CONFIG_CONTATO_V1)
// Configura o contato automatico da Tatiane (primeiro contato por data
// de chegada): liga/desliga, leads por dia e dias apos a chegada (D-N).
// ===========================================

import { useState, useEffect, useCallback } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { useApi } from '@/lib/hooks';
import { Send, Loader2, Save, CheckCircle, AlertCircle, Info, Minus, Plus } from 'lucide-react';

interface OutboundConfig {
  ativo: boolean;
  leads_por_dia: number;
  dias_apos_chegada: number;
  updated_at?: string | null;
}

function formatarDia(diasAtras: number): string {
  const alvo = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Bahia', day: '2-digit', month: '2-digit',
  }).format(alvo);
}

function Stepper({
  valor, min, max, onChange,
}: { valor: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, valor - 1))}
        className="w-9 h-10 flex items-center justify-center rounded-lg border border-gray-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
      >
        <Minus className="w-4 h-4" />
      </button>
      <input
        type="number"
        value={valor}
        min={min}
        max={max}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min);
        }}
        className="w-20 text-center px-2 py-2 rounded-lg border border-gray-200 font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, valor + 1))}
        className="w-9 h-10 flex items-center justify-center rounded-lg border border-gray-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
      >
        <Plus className="w-4 h-4" />
      </button>
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

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const { data, error } = await fetchApi<{ success: boolean; data: OutboundConfig }>('/api/tatiane-outbound-config');
    if (error) {
      setErro(error);
    } else if (data?.data) {
      setCfg({
        ativo: !!data.data.ativo,
        leads_por_dia: Number(data.data.leads_por_dia) || 0,
        dias_apos_chegada: Number(data.data.dias_apos_chegada) || 2,
        updated_at: data.data.updated_at ?? null,
      });
    }
    setCarregando(false);
  }, [fetchApi]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    const { error } = await fetchApi('/api/tatiane-outbound-config', {
      method: 'PUT',
      body: JSON.stringify({
        ativo: cfg.ativo,
        leads_por_dia: cfg.leads_por_dia,
        dias_apos_chegada: cfg.dias_apos_chegada,
      }),
    });
    if (error) {
      setErro(error);
    } else {
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
    }
    setSalvando(false);
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando configuração...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center">
          <Send className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Contato automático da Tatiane</h1>
          <p className="text-sm text-gray-500">Primeiro contato com leads por data de chegada, com trava diária.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Toggle */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-sm font-medium text-gray-900">Ativar contato automático</div>
            <div className="text-xs text-gray-500 mt-0.5">Quando desligado, a Tati não inicia nenhum contato novo.</div>
          </div>
          <button
            type="button"
            onClick={() => setCfg(c => ({ ...c, ativo: !c.ativo }))}
            className={`relative w-12 h-7 rounded-full transition-colors ${cfg.ativo ? 'bg-purple-600' : 'bg-gray-300'}`}
            aria-pressed={cfg.ativo}
          >
            <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${cfg.ativo ? 'right-1' : 'left-1'}`} />
          </button>
        </div>

        {/* Leads por dia */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-sm font-medium text-gray-900">Leads por dia</div>
            <div className="text-xs text-gray-500 mt-0.5">Trava de quantos leads a Tati inicia por dia.</div>
          </div>
          <Stepper valor={cfg.leads_por_dia} min={0} max={500} onChange={(v) => setCfg(c => ({ ...c, leads_por_dia: v }))} />
        </div>

        {/* Dias apos chegada */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="text-sm font-medium text-gray-900">Dias após a chegada do lead</div>
            <div className="text-xs text-gray-500 mt-0.5">Ex.: 2 = contatar quem chegou há 2 dias (D-2).</div>
          </div>
          <Stepper valor={cfg.dias_apos_chegada} min={0} max={60} onChange={(v) => setCfg(c => ({ ...c, dias_apos_chegada: v }))} />
        </div>

        {/* Preview */}
        <div className="px-5 py-4">
          <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-purple-700 font-semibold">Preview de hoje</div>
            <div className="text-sm text-gray-700 mt-1.5 leading-relaxed">
              A Tati vai iniciar contato com leads que chegaram em{' '}
              <b>{formatarDia(cfg.dias_apos_chegada)}</b> — no máximo{' '}
              <span className="inline-block bg-purple-600 text-white font-semibold rounded-full px-2 py-0.5 text-xs">
                {cfg.leads_por_dia} leads
              </span>
              . O excedente do dia não é contatado (regra D-{cfg.dias_apos_chegada} exata).
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-gray-500 mt-3">
            <Info className="w-4 h-4 flex-none mt-0.5" />
            <span>Envios sempre na janela 8h–20h (Salvador). Cada lead é contatado uma única vez.</span>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-3 mt-5">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-2 bg-purple-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-purple-700 disabled:bg-gray-300"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {salvando ? 'Salvando...' : 'Salvar configuração'}
        </button>

        {salvo && (
          <span className="inline-flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle className="w-4 h-4" /> Salvo
          </span>
        )}
        {erro && (
          <span className="inline-flex items-center gap-1.5 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" /> {erro}
          </span>
        )}
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
