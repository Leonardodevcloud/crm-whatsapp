'use client';

// ===========================================
// Página de Login - CRM WhatsApp Tutts
// ===========================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/hooks';
import { MessageCircle, AlertCircle, Loader2 } from 'lucide-react';

// Função para ler token da URL
function getUrlToken() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

// Componente interno que usa useAuth
function LoginForm() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Redirecionar se já autenticado
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push('/inbox');
    }
  }, [isAuthenticated, authLoading, router]);

  // Verificar token na URL (para integração com Tutts)
  useEffect(() => {
    const urlToken = getUrlToken();
    if (urlToken) {
      handleLogin(urlToken);
    }
  }, []);

  const handleLogin = async (tokenToUse?: string) => {
    const tokenValue = tokenToUse || token;
    setError('');
    setIsLoading(true);

    if (!tokenValue.trim()) {
      setError('Informe o token de acesso');
      setIsLoading(false);
      return;
    }

    const success = login(tokenValue.trim());
    
    if (success) {
      router.push('/inbox');
    } else {
      setError('Token inválido ou expirado');
    }
    
    setIsLoading(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        <div className="card p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">CRM WhatsApp</h1>
            <p className="text-gray-600 mt-1">Tutts - Módulo de Atendimento</p>
          </div>

          {/* Formulário */}
          <div className="space-y-4">
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
                Token de Acesso
              </label>
              <input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Cole seu token JWT do Tutts"
                className={`input ${error ? 'input-error' : ''}`}
                disabled={isLoading}
              />
            </div>

            {/* Erro */}
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            {/* Botão */}
            <button
              onClick={() => handleLogin()}
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Entrando...</span>
                </>
              ) : (
                <span>Entrar no CRM</span>
              )}
            </button>
          </div>

          {/* Info */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">
              Use o mesmo token de autenticação do sistema Tutts.
              <br />
              <span className="text-xs">
                O token pode ser obtido após login no sistema principal.
              </span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-4">
          © {new Date().getFullYear()} Tutts - Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}

// Componente principal com AuthProvider
export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}
