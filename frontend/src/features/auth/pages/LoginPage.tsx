// src/features/auth/pages/LoginPage.tsx
//
// Redesign visual (split-screen fintech). Toda a lógica de autenticação é
// idêntica à anterior — só mudou a apresentação.

import { useState, type FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { ApiError } from '@/shared/lib/api-client';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';

export function LoginPage() {
  const { login, isAuthenticated, user, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;

  if (isAuthenticated && user) {
    const dest = user.role === 'DRIVER' ? '/app/driver' : '/app/admin';
    return <Navigate to={dest} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('E-mail ou senha inválidos.');
      } else if (err instanceof ApiError && err.status === 403) {
        setError('A sua conta está inativa ou bloqueada. Contacte o suporte.');
      } else {
        setError('Não foi possível conectar ao servidor. Tente novamente.');
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-white">

      {/* ── Painel de marca (esquerda, escondido no mobile) ── */}
      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0d6b4f 0%, #108865 55%, #0a5440 100%)' }}
      >
        {/* Formas decorativas */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-10" style={{ background: '#fff' }} />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full opacity-10" style={{ background: '#fff' }} />

        <div className="relative flex items-center gap-2 text-white">
          <span className="text-xl font-bold tracking-tight">DragonFleet</span>
        </div>

        <div className="relative text-white">
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Gestão de frotas,<br />simples e poderosa.
          </h1>
          <p className="text-white/80 text-lg max-w-md">
            Controle ganhos, documentos e retiradas dos seus motoristas num só lugar.
          </p>
        </div>

        <div className="relative flex gap-8 text-white/90">
          <div>
            <div className="text-2xl font-bold">Uber · Bolt</div>
            <div className="text-sm text-white/60">Importação de ganhos</div>
          </div>
          <div>
            <div className="text-2xl font-bold">Tempo real</div>
            <div className="text-sm text-white/60">Painel analítico</div>
          </div>
        </div>
      </div>

      {/* ── Formulário (direita) ── */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-8">

          {/* Logo (aparece com destaque no mobile, discreto no desktop) */}
          <div className="flex flex-col items-center gap-3 lg:items-start">
            <div className="lg:hidden">
              <DragonFleetLogo size={56} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 text-center lg:text-left">Bem-vindo de volta</h2>
              <p className="text-sm text-gray-500 mt-1 text-center lg:text-left">Entre na sua conta para continuar</p>
            </div>
          </div>

          {/* Erro */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
              {error}
            </p>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-[#108865] focus:ring-2 focus:ring-[#108865]/20 transition"
                placeholder="seu@email.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="password">Senha</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-12 text-sm outline-none focus:border-[#108865] focus:ring-2 focus:ring-[#108865]/20 transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 hover:text-[#108865] transition"
                  tabIndex={-1}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#108865] hover:bg-[#0d7557] disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition shadow-sm"
            >
              {submitting ? 'A entrar…' : 'Entrar'}
            </button>
          </form>

          {/* Link para cadastro */}
          <p className="text-center text-sm text-gray-500">
            Não tem uma conta?{' '}
            <a href="/register" className="text-[#108865] font-semibold hover:underline">
              Registe-se
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
