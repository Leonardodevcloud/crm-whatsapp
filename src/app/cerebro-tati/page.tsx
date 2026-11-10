'use client';

// ===========================================
// Página: /cerebro-tati  (CEREBRO_TATI_V1)
// Tudo o que a Tatiane sabe e fala: áreas de atendimento, instruções (com versão),
// conhecimentos ensinados pela equipe e um chat de teste.
// ===========================================

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Brain, MapPin, BookOpen, GraduationCap, MessageCircle } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import Areas from '@/components/cerebro/Areas';
import Instrucoes from '@/components/cerebro/Instrucoes';
import Ensinar from '@/components/cerebro/Ensinar';
import ChatTeste from '@/components/cerebro/ChatTeste';
import type { RascunhoConhecimento } from '@/components/cerebro/comum';

type Aba = 'areas' | 'instrucoes' | 'ensinar' | 'chat';
const ABAS: { id: Aba; label: string; icon: any }[] = [
  { id: 'areas', label: 'Áreas de atendimento', icon: MapPin },
  { id: 'instrucoes', label: 'Conhecimento atual', icon: BookOpen },
  { id: 'ensinar', label: 'Ensinar algo novo', icon: GraduationCap },
  { id: 'chat', label: 'Chat de teste', icon: MessageCircle },
];
const CHAVE = 'tutts_crm_cerebro_aba';

function CerebroContent() {
  const [aba, setAba] = useState<Aba>('areas');
  const [rascunho, setRascunho] = useState<RascunhoConhecimento | null>(null);
  // a aba de Ensinar remonta ao trocar de aba; o rascunho fica aqui em cima

  useEffect(() => {
    try { const a = localStorage.getItem(CHAVE) as Aba | null; if (a && ABAS.some((x) => x.id === a)) setAba(a); } catch (_) { /* sem storage */ }
  }, []);
  const ir = (a: Aba) => { setAba(a); try { localStorage.setItem(CHAVE, a); } catch (_) { /* sem storage */ } };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto min-w-0">
      <div className="mb-4 pl-12 lg:pl-0">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Brain className="w-7 h-7 text-purple-600" />
          Cérebro da Tati
        </h1>
        <p className="text-sm text-gray-600 mt-1">Tudo o que a Tatiane sabe e fala, num lugar só. O que muda aqui vale na próxima mensagem dela, sem deploy.</p>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200 pb-1 overflow-x-auto" role="tablist">
        {ABAS.map((t) => {
          const on = aba === t.id;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => ir(t.id)}
              className={clsx('flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-[1px] whitespace-nowrap transition-colors',
                on ? 'border-purple-600 text-purple-700 bg-purple-50/50' : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>
              <t.icon className="w-4 h-4" />{t.label}
              {t.id === 'chat' && rascunho && rascunho.conteudo.trim() ? <span className="w-2 h-2 rounded-full bg-purple-500" title="Com rascunho" /> : null}
            </button>
          );
        })}
      </div>

      {aba === 'areas' && <Areas />}
      {aba === 'instrucoes' && <Instrucoes irPara={(a) => ir(a)} />}
      {aba === 'ensinar' && <Ensinar rascunho={rascunho} setRascunho={setRascunho} testarNoChat={(r) => { setRascunho(r); ir('chat'); }} />}
      {aba === 'chat' && (
        <ChatTeste rascunho={rascunho} limparRascunho={() => setRascunho(null)}
          corrigir={(leadMsg, resposta) => {
            setRascunho({
              tipo: 'regra', titulo: '', valido_ate: '',
              conteudo: (leadMsg ? `Quando o lead disser algo como "${leadMsg.slice(0, 200)}", ` : '') + 'responda assim: ',
            });
            void resposta;
            ir('ensinar');
          }} />
      )}
    </div>
  );
}

export default function CerebroTatiPage() {
  return (
    <AuthLayout>
      <CerebroContent />
    </AuthLayout>
  );
}
