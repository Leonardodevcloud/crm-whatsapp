'use client';

// ===========================================
// AuthLayout - Layout para páginas protegidas
// ===========================================

import { useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/hooks';
import Sidebar from '@/components/Sidebar';
import EmbedNav from '@/components/EmbedNav';
import { Loader2 } from 'lucide-react';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isEmbed } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Se está em modo embed (iframe), mostra navegação simples no topo
  if (isEmbed) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <EmbedNav />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    );
  }

  // Modo normal com sidebar
  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

function AuthLayoutInner({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>{children}</AuthGuard>
    </AuthProvider>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    }>
      <AuthLayoutInner>{children}</AuthLayoutInner>
    </Suspense>
  );
}
