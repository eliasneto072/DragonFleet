// src/features/auth/context/AuthContext.tsx

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { authService, type AuthUser } from '../services/auth.service';
import { ApiError } from '@/shared/lib/api-client';
import { atLeast, type Access, type Area } from '@/shared/lib/areas';

// ---------- tipos ----------

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isDriver: boolean;
  /**
   * O que esta pessoa pode fazer numa área do painel.
   *
   * O ADMIN devolve sempre verdadeiro sem olhar para a lista: tem tudo por
   * definição, e é isso que o impede de se trancar fora do próprio sistema.
   *
   * Isto decide o que se MOSTRA. Quem recusa é o servidor — esconder um botão
   * nunca foi uma permissão.
   */
  can: (area: Area, nivel?: Access) => boolean;
}

// ---------- context ----------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------- provider ----------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,   // começa como true para verificar o token salvo
    error: null,
  });

  /** Tenta recuperar a sessão ao montar o provider. */
  useEffect(() => {
    const token = authService.getToken();

    if (!token) {
      setState({ user: null, loading: false, error: null });
      return;
    }

    authService
      .me()
      .then((user) => setState({ user, loading: false, error: null }))
      .catch(() => {
        // token inválido ou expirado — limpa e segue
        localStorage.removeItem('dragonfleet:token');
        setState({ user: null, loading: false, error: null });
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const user = await authService.login(email, password);
      setState({ user, loading: false, error: null });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Falha ao fazer login. Tente novamente.';

      setState({ user: null, loading: false, error: message });
      throw err; // permite que o formulário trate também
    }
  }, []);

  const logout = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    await authService.logout();
    setState({ user: null, loading: false, error: null });
  }, []);

  const can = useCallback((area: Area, nivel: Access = 'VIEW') => {
    if (!state.user) return false;
    if (state.user.role === 'ADMIN') return true;
    return atLeast(state.user.permissions?.[area], nivel);
  }, [state.user]);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    can,
    isAuthenticated: !!state.user,
    isAdmin:  state.user?.role === 'ADMIN',
    isDriver: state.user?.role === 'DRIVER',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------- hook ----------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  }
  return ctx;
}