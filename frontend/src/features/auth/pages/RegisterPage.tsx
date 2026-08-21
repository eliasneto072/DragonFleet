// src/features/auth/pages/RegisterPage.tsx
//
// Redesign visual (split-screen fintech, a condizer com o login).
//
// Mesmas correções aplicadas ao login:
// - Inputs fixam bg-white + text-gray-900 (senão texto invisível no dark mode).
// - if (loading) só esconde a tela no boot inicial, não durante o cadastro
//   (o login() no fim seta loading e fazia a tela sumir / o erro piscar).
// - Erro estável, com ícone + animação (slide + shake), limpo só ao digitar.

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { usersService } from '@/features/admin/services/users.service';
import { ApiError } from '@/shared/lib/api-client';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';

export function RegisterPage() {
  const { isAuthenticated, user, loading, login } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState(0);

  // Só esconde a tela no boot inicial (verificação do token), não durante o cadastro.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (!loading) bootedRef.current = true;
  }, [loading]);

  if (loading && !bootedRef.current) return null;

  if (isAuthenticated && user) {
    return <Navigate to={user.role === 'DRIVER' ? '/app/driver' : '/app/admin'} replace />;
  }

  function showError(message: string) {
    setError(message);
    setErrorKey((k) => k + 1);
  }

  function clearErrorOnEdit() {
    if (error) setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (password !== confirm) {
      showError('As senhas não coincidem.');
      return;
    }
    if (password.length < 6) {
      showError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setSubmitting(true);

    try {
      await usersService.create({ name, email, password });
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        showError('Este e-mail já está registado.');
      } else if (err instanceof ApiError) {
        showError(err.message);
      } else {
        showError('Não foi possível criar a conta. Tente novamente.');
      }
      setSubmitting(false);
    }
  }

  const inputBase =
    'w-full rounded-lg border bg-white text-gray-900 placeholder:text-gray-400 px-4 py-2.5 text-sm outline-none transition';
  const inputNormal = 'border-gray-300 focus:border-[#108865] focus:ring-2 focus:ring-[#108865]/20';

  return (
    <div className="min-h-screen flex bg-white">
      {/* Animações locais (não dependem do tailwind.config) */}
      <style>{`
        @keyframes df-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes df-slide-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .df-error-enter {
          animation: df-slide-in 0.2s ease-out, df-shake 0.4s ease-in-out 0.15s;
        }
      `}</style>

      {/* ── Painel de marca (esquerda, escondido no mobile) ── */}
      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0d6b4f 0%, #108865 55%, #0a5440 100%)' }}
      >
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-10" style={{ background: '#fff' }} />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full opacity-10" style={{ background: '#fff' }} />

        <div className="relative flex items-center gap-2 text-white">
          <span className="text-xl font-bold tracking-tight">DragonFleet</span>
        </div>

        <div className="relative text-white">
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Comece a gerir<br />a sua frota hoje.
          </h1>
          <p className="text-white/80 text-lg max-w-md">
            Crie a sua conta e tenha acesso a ganhos, documentos e retiradas num só lugar.
          </p>
        </div>

        <div className="relative flex gap-8 text-white/90">
          <div>
            <div className="text-2xl font-bold">Grátis</div>
            <div className="text-sm text-white/60">Para começar</div>
          </div>
          <div>
            <div className="text-2xl font-bold">Seguro</div>
            <div className="text-sm text-white/60">Dados protegidos</div>
          </div>
        </div>
      </div>

      {/* ── Formulário (direita) ── */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 bg-white">
        <div className="w-full max-w-sm space-y-8">

          {/* Logo (destaque no mobile) */}
          <div className="flex flex-col items-center gap-3 lg:items-start">
            <div className="lg:hidden">
              <DragonFleetLogo size={56} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 text-center lg:text-left">Criar conta</h2>
              <p className="text-sm text-gray-500 mt-1 text-center lg:text-left">Registe-se como motorista para começar</p>
            </div>
          </div>

          {/* Erro — estável, com ícone e animação de entrada + shake */}
          {error && (
            <div
              key={errorKey}
              role="alert"
              className="df-error-enter flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="name">Nome completo</label>
              <input
                id="name"
                type="text"
                required
                autoComplete="name"
                minLength={2}
                value={name}
                onChange={e => { setName(e.target.value); clearErrorOnEdit(); }}
                className={`${inputBase} ${inputNormal}`}
                placeholder="João Silva"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => { setEmail(e.target.value); clearErrorOnEdit(); }}
                className={`${inputBase} ${inputNormal}`}
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
                  autoComplete="new-password"
                  minLength={6}
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearErrorOnEdit(); }}
                  className={`${inputBase} pr-12 ${inputNormal}`}
                  placeholder="Mínimo 6 caracteres"
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

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="confirm">Confirmar senha</label>
              <input
                id="confirm"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirm}
                onChange={e => { setConfirm(e.target.value); clearErrorOnEdit(); }}
                className={`${inputBase} ${
                  confirm && confirm !== password
                    ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20'
                    : inputNormal
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
              className="w-full bg-[#108865] hover:bg-[#0d7557] disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 text-sm transition shadow-sm"
            >
              {submitting ? 'A criar conta…' : 'Criar conta'}
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
    </div>
  );
}