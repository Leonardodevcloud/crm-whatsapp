'use client';

// ===========================================
// AuthLayout - Layout para páginas protegidas
// Executa automação e enriquecimento em background
// ===========================================

import { useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth, useApi } from '@/lib/hooks';
import Sidebar from '@/components/Sidebar';
import EmbedNav from '@/components/EmbedNav';
import { Loader2 } from 'lucide-react';

// Componente para executar processos em background
function BackgroundProcesses() {
  const { fetchApi } = useApi();
  const hasRun = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Evita execução dupla em StrictMode
    if (hasRun.current) return;
    hasRun.current = true;

    const executarProcessosBackground = async () => {
      console.log('[Background] Executando processos automáticos...');
      
      try {
        // 1. Enriquecer leads com dados da planilha
        const enriquecerResult = await fetchApi('/api/enriquecer', { method: 'POST' });
        if (enriquecerResult.data?.success) {
          const dados = enriquecerResult.data.data;
          if (dados.atualizados > 0) {
            console.log(`[Background] ✅ ${dados.atualizados} leads enriquecidos`);
          }
        }
      } catch (err) {
        console.log('[Background] Erro no enriquecimento:', err);
      }

      try {
        // 2. Rodar automação de follow-ups
        const automacaoResult = await fetchApi('/api/followups/automacao', { method: 'POST' });
        if (automacaoResult.data?.success) {
          console.log('[Background] ✅', automacaoResult.data.message);
        }
      } catch (err) {
        console.log('[Background] Erro na automação:', err);
      }
    };

    // Executar imediatamente após 1 segundo
    const initialTimer = setTimeout(executarProcessosBackground, 1000);

    // Executar a cada 2 minutos (120000ms)
    intervalRef.current = setInterval(executarProcessosBackground, 120000);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null; // Componente invisível
}

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
        <BackgroundProcesses />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    );
  }

  // Modo normal com sidebar
  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <BackgroundProcesses />
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
