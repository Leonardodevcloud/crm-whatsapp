'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/hooks';
import { Columns3, ArrowLeft, BarChart3, Clock, ClipboardList, UserPlus } from 'lucide-react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/kanban', label: 'Kanban', icon: Columns3 },
  { href: '/followups', label: 'Follow-ups', icon: Clock },
  { href: '/leads-nao-iniciados', label: 'Cadastros', icon: ClipboardList },
  { href: '/alocacao', label: 'Alocação', icon: UserPlus },
];

export default function EmbedNav() {
  const { isEmbed } = useAuth();
  const pathname = usePathname();

  const voltarParaTutts = () => {
    try {
      // Enviar mensagem pro parent (Central Tutts) trocar o módulo sem recarregar
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'VOLTAR_TUTTS' }, '*');
      } else if (window.top && window.top !== window) {
        window.top.postMessage({ type: 'VOLTAR_TUTTS' }, '*');
      } else {
        // Não está em iframe — redirecionar
        window.location.href = 'https://www.centraltutts.online';
      }
    } catch (e) {
      // Erro de cross-origin — fallback
      window.open('https://www.centraltutts.online', '_top');
    }
  };

  if (!isEmbed) return null;

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={voltarParaTutts} className="flex items-center gap-1 px-2 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-sm transition-colors" title="Voltar para Central Tutts">
            <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Voltar</span>
          </button>
          <div className="h-5 w-px bg-gray-200"></div>
          <span className="font-semibold text-gray-800">CRM WhatsApp</span>
          <nav className="flex gap-1 ml-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}
                  className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100')}>
                  <item.icon className="w-4 h-4" />{item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
