'use client';

// ===========================================
// Hook useAuth - Gerenciamento de Auth no Cliente
// ===========================================

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import type { TuttsUser, AuthState } from '@/types';
import { decodeTokenUnsafe, isTokenExpired } from '@/lib/auth-client';

// Chave do localStorage
const TOKEN_KEY = 'tutts_crm_token';
const EMBED_KEY = 'tutts_crm_embed';

// Função para ler parâmetros da URL (sem useSearchParams)
function getUrlParams() {
  if (typeof window === 'undefined') return { token: null, embed: null };
  const params = new URLSearchParams(window.location.search);
  return {
    token: params.get('token'),
    embed: params.get('embed'),
  };
}

// Context
interface AuthContextType extends AuthState {
  login: (token: string) => boolean;
  logout: () => void;
  getToken: () => string | null;
  isEmbed: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Provider
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });
  const [isEmbed, setIsEmbed] = useState(false);

  const router = useRouter();

  // Inicializar auth ao montar
  useEffect(() => {
    // Ler parâmetros da URL
    const { token: urlToken, embed: urlEmbed } = getUrlParams();
    
    // Se tem embed=true na URL, salvar no localStorage
    if (urlEmbed === 'true') {
      localStorage.setItem(EMBED_KEY, 'true');
      setIsEmbed(true);
    } else {
      // Verificar se já estava em modo embed
      const savedEmbed = localStorage.getItem(EMBED_KEY);
      setIsEmbed(savedEmbed === 'true');
    }

    // Se tem token na URL, usar esse token
    if (urlToken && !isTokenExpired(urlToken)) {
      const user = decodeTokenUnsafe(urlToken);
      if (user) {
        localStorage.setItem(TOKEN_KEY, urlToken);
        setState({
          user,
          token: urlToken,
          isAuthenticated: true,
          isLoading: false,
        });
        
        // Limpar URL (remover token para não ficar visível)
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        return;
      }
    }

    // Se não tem token na URL, verificar localStorage
    const token = localStorage.getItem(TOKEN_KEY);
    
    if (token && !isTokenExpired(token)) {
      const user = decodeTokenUnsafe(token);
      setState({
        user,
        token,
        isAuthenticated: !!user,
        isLoading: false,
      });
    } else {
      // Token expirado ou não existe
      localStorage.removeItem(TOKEN_KEY);
      setState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, []);

  // Login
  const login = useCallback((token: string): boolean => {
    if (isTokenExpired(token)) {
      console.error('Token já expirado');
      return false;
    }

    const user = decodeTokenUnsafe(token);
    if (!user) {
      console.error('Token inválido');
      return false;
    }

    localStorage.setItem(TOKEN_KEY, token);
    setState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
    });

    return true;
  }, []);

  // Logout
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMBED_KEY);
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
    setIsEmbed(false);
    router.push('/login');
  }, [router]);

  // Get token
  const getToken = useCallback((): string | null => {
    return state.token;
  }, [state.token]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, getToken, isEmbed }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}

// ===========================================
// Hook useApi - Requisições autenticadas
// ===========================================

export function useApi() {
  const { token, logout } = useAuth();

  const fetchApi = useCallback(
    async <T = any>(
      url: string,
      options: RequestInit = {}
    ): Promise<{ data: T | null; error: string | null }> => {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : '',
            ...options.headers,
          },
        });

        const data = await response.json();

        if (response.status === 401) {
          logout();
          return { data: null, error: 'Sessão expirada' };
        }

        if (!response.ok) {
          return { data: null, error: data.error || 'Erro na requisição' };
        }

        return { data, error: null };
      } catch (error: any) {
        console.error('Erro na API:', error);
        return { data: null, error: error.message || 'Erro de conexão' };
      }
    },
    [token, logout]
  );

  return { fetchApi };
}
