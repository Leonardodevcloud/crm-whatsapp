'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ShieldCheck, BookOpen } from 'lucide-react';
import clsx from 'clsx';

const SUB_TABS = [
  { href: '/dashboard', label: 'Visão geral', icon: Activity },
  { href: '/saude-tatiane/supervisao', label: 'Supervisão IA', icon: ShieldCheck },
  { href: '/saude-tatiane/licoes', label: 'Lições & Versões', icon: BookOpen },
];

export default function SaudeTatianeTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 mb-4 border-b border-gray-200 pb-1 flex-wrap">
      {SUB_TABS.map((t) => {
        const isActive = pathname === t.href || (t.href === '/dashboard' && pathname.startsWith('/dashboard'));
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-[1px] transition-colors',
              isActive
                ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
