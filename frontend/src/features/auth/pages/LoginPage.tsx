// src/features/auth/pages/LoginPage.tsx

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
  const [error, setError]           = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Se já estiver logado, redireciona direto sem mostrar o formulário
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
      // O AuthContext atualiza o user — o Navigate acima vai redirecionar
      // automaticamente na próxima renderização
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('E-mail ou senha inválidos.');
      } else if (err instanceof ApiError && err.status === 403) {
        setError('Sua conta está inativa ou bloqueada. Entre em contato com o suporte.');
      } else {
        setError('Não foi possível conectar ao servidor. Tente novamente.');
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#1D1D1D] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-6">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <DragonFleetLogo size={56} />
          <p className="text-sm text-gray-500">Entre na sua conta</p>
        </div>

        {/* Erro */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-center">
            {error}
          </p>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#108865] focus:ring-1 focus:ring-[#108865] transition"
              placeholder="seu@email.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#108865] focus:ring-1 focus:ring-[#108865] transition"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#108865] hover:bg-[#0d7557] disabled:opacity-60 text-white font-semibold rounded-lg py-2 text-sm transition"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}