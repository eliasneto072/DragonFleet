// src/features/auth/pages/RegisterPage.tsx

import { useState, type FormEvent } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { usersService } from '@/features/admin/services/users.service';
import { ApiError } from '@/shared/lib/api-client';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';

export function RegisterPage() {
  const { isAuthenticated, user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [error, setError]             = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);

  // Se já logado, redireciona direto
  if (loading) return null;
  if (isAuthenticated && user) {
    return <Navigate to={user.role === 'DRIVER' ? '/app/driver' : '/app/admin'} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setSubmitting(true);

    try {
      // POST /users — rota pública, cria o motorista
      await usersService.create({ name, email, password });

      // Faz login automaticamente após o cadastro
      await login(email, password);

      // O AuthContext atualiza o user → o Navigate acima redireciona
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Este e-mail já está cadastrado.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Não foi possível criar a conta. Tente novamente.');
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
          <p className="text-sm text-gray-500">Crie sua conta de motorista</p>
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
            <label className="text-sm font-medium text-gray-700" htmlFor="name">
              Nome completo
            </label>
            <input
              id="name"
              type="text"
              required
              autoComplete="name"
              minLength={2}
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#108865] focus:ring-1 focus:ring-[#108865] transition"
              placeholder="João Silva"
            />
          </div>

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
              onChange={e => setEmail(e.target.value)}
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
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#108865] focus:ring-1 focus:ring-[#108865] transition"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="confirm">
              Confirmar senha
            </label>
            <input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-1 ${
                confirm && confirm !== password
                  ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                  : 'border-gray-300 focus:border-[#108865] focus:ring-[#108865]'
              }`}
              placeholder="Repita a senha"
            />
            {confirm && confirm !== password && (
              <p className="text-xs text-red-500">As senhas não coincidem</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#108865] hover:bg-[#0d7557] disabled:opacity-60 text-white font-semibold rounded-lg py-2 text-sm transition"
          >
            {submitting ? 'Criando conta…' : 'Criar conta'}
          </button>
        </form>

        {/* Link para login */}
        <p className="text-center text-sm text-gray-500">
          Já tem uma conta?{' '}
          <Link to="/login" className="text-[#108865] font-semibold hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}