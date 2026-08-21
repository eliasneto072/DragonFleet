// src/features/auth/pages/LoginPage.tsx
//
// Redesign visual (split-screen fintech).
//
// CORREÇÃO DO "FLASH": o AuthContext seta loading=true durante o login. Antes
// o `if (loading) return null` fazia a TELA INTEIRA sumir e voltar a cada
// tentativa — por isso o erro "piscava". Agora só escondemos a tela no boot
// inicial (verificação do token); durante o login a tela permanece visível e
// o feedback vem do estado local `submitting` (botão "A entrar…").
//
// Esta tela é sempre clara por design; inputs fixam bg-white + text-gray-900
// para não herdarem cor clara no dark mode.

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { ApiError } from '@/shared/lib/api-client';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';

export function LoginPage() {
  const { login, isAuthenticated, user, loading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState(0);

  const passwordRef = useRef<HTMLInputElement>(null);

  // Uma vez que o boot inicial termina (loading=false pela primeira vez),
  // marcamos que a app já "acordou". A partir daí, o loading global do login
  // NÃO deve mais esconder esta tela.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (!loading) bootedRef.current = true;
  }, [loading]);

  // Só escondemos a tela na verificação inicial do token (antes de acordar).
  if (loading && !bootedRef.current) return null;

  if (isAuthenticated && user) {
    const dest = user.role === 'DRIVER' ? '/app/driver' : '/app/admin';
    return <Navigate to={dest} replace />;
  }

  function showError(message: string) {
    setError(message);
    setErrorKey((k) => k + 1);
    setTimeout(() => passwordRef.current?.focus(), 50);
  }

  function clearErrorOnEdit() {
    if (error) setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        showError('E-mail ou senha inválidos.');
      } else if (err instanceof ApiError && err.status === 403) {
        showError('A sua conta está inativa ou bloqueada. Contacte o suporte.');
      } else {
        showError('Não foi possível conectar ao servidor. Tente novamente.');
      }
      setSubmitting(false);
    }
  }

  const inputBase =
    'w-full rounded-lg border bg-white text-gray-900 placeholder:text-gray-400 px-4 py-2.5 text-sm outline-none transition';
  const inputNormal = 'border-gray-300 focus:border-[#108865] focus:ring-2 focus:ring-[#108865]/20';
  const inputError = 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20';

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
      <div className="flex-1 flex items-center justify-center px-4 py-12 bg-white">
        <div className="w-full max-w-sm space-y-8">

          <div className="flex flex-col items-center gap-3 lg:items-start">
            <div className="lg:hidden">
              <DragonFleetLogo size={56} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 text-center lg:text-left">Bem-vindo de volta</h2>
              <p className="text-sm text-gray-500 mt-1 text-center lg:text-left">Entre na sua conta para continuar</p>
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

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearErrorOnEdit(); }}
                className={`${inputBase} ${error ? inputError : inputNormal}`}
                placeholder="seu@email.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="password">Senha</label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearErrorOnEdit(); }}
                  className={`${inputBase} pr-12 ${error ? inputError : inputNormal}`}
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