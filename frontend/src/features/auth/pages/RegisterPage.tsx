// src/features/auth/pages/RegisterPage.tsx
//
// Criar conta — por convite, e só por convite.
//
// ─── PORQUE É QUE O REGISTO ABERTO DEIXOU DE EXISTIR ────────────────────────
//
// Porque esta página não sabe a que empresa pertence quem a abre, e não há
// forma de saber. Com uma frota só no sistema a resposta era óbvia; com
// várias, qualquer escolha automática punha um motorista dentro da conta de
// uma empresa que não é a dele, a ver dados que não são dele. O convite
// resolve isso levando a frota dentro do próprio link.
//
// Daí as três caras desta página:
//
//   - sem código     → diz que o registo é por convite, e mais nada;
//   - código a valer → mostra o NOME DA FROTA e o formulário. O nome não é
//                      decoração: é o que deixa a pessoa perceber, antes de
//                      escrever a palavra-passe, em que empresa está a entrar;
//   - código que não vale → diz o que se passa (expirou, esgotou, foi
//                      cancelado) e manda pedir um novo.
//
// ─── NOTAS DO DESENHO QUE SE MANTÊM ─────────────────────────────────────────
//
// - Inputs fixam bg-white + text-gray-900 (senão texto invisível no dark mode).
// - if (loading) só esconde a tela no boot inicial, não durante o cadastro
//   (o login() no fim seta loading e fazia a tela sumir / o erro piscar).
// - Erro estável, com ícone + animação (slide + shake), limpo só ao digitar.

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Navigate, Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, MailQuestion } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { usersService } from '@/features/admin/services/users.service';
import { invitesService } from '@/features/admin/services/invites.service';
import { ApiError } from '@/shared/lib/api-client';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';

export function RegisterPage() {
  const { isAuthenticated, user, loading, login } = useAuth();

  // O código chega de duas formas: /register/CODIGO (o link que o gestor
  // copia) e /register?convite=CODIGO (para quem o cole de uma mensagem onde
  // ficou como parâmetro). As duas, porque a que falhar é uma chamada.
  const { code: codeDaRota } = useParams<{ code?: string }>();
  const [params] = useSearchParams();
  const codigo = (codeDaRota ?? params.get('convite') ?? '').trim();

  // Sem `enabled`, isto corria também na página sem código — um pedido a
  // /auth/convite/ para nada, e um erro no painel de rede a cada visita.
  const conviteQ = useQuery({
    queryKey: ['convite', codigo],
    queryFn: () => invitesService.resolver(codigo),
    enabled: codigo.length > 0,
    retry: false,
  });

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

  // Um convite a valer é a ÚNICA condição para o formulário existir. Escrito
  // numa variável só, e não repetido em cada sítio onde é preciso: assim não
  // há forma de um dos sítios discordar do outro.
  const conviteValido = !!codigo && conviteQ.data?.estado === 'valido';
  const frota = conviteQ.data?.frota?.nome ?? null;

  if (isAuthenticated && user) {
    const dest = user.role === 'MECHANIC' ? '/app/oficina'
      : user.role === 'DRIVER' ? '/app/driver'
      : '/app/admin';
    return <Navigate to={dest} replace />;
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
      showError('As palavras-passe não coincidem.');
      return;
    }
    if (password.length < 6) {
      showError('A palavra-passe deve ter pelo menos 6 caracteres.');
      return;
    }

    setSubmitting(true);

    try {
      await usersService.create({ name, email, password, codigo });
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
              {/* O nome da frota no subtítulo, e não num aviso ao lado: é a
                  informação mais importante desta página. Quem se inscreve
                  tem de ver em que empresa está a entrar ANTES de escrever a
                  palavra-passe. */}
              <p className="text-sm text-gray-500 mt-1 text-center lg:text-left">
                {frota
                  ? <>Vai entrar como motorista em <strong className="text-gray-900">{frota}</strong></>
                  : 'Registe-se como motorista para começar'}
              </p>
            </div>
          </div>

          {/* ── Sem código: o registo é por convite ─────────────────────── */}
          {!codigo && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-5 space-y-2">
              <div className="flex items-center gap-2 text-gray-900">
                <MailQuestion className="h-5 w-5 shrink-0" />
                <span className="font-semibold text-sm">O registo é por convite</span>
              </div>
              <p className="text-sm text-gray-600">
                Peça o link de inscrição à frota com que vai trabalhar. É esse
                link que diz em que empresa a sua conta nasce.
              </p>
            </div>
          )}

          {/* ── A confirmar o convite ────────────────────────────────────── */}
          {codigo && conviteQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              A confirmar o convite…
            </div>
          )}

          {/* ── Um convite que não vale ──────────────────────────────────── */}
          {codigo && !conviteQ.isLoading && !conviteValido && (
            <div
              role="alert"
              className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {conviteQ.data?.mensagem
                  ?? 'Não foi possível confirmar este convite. Peça um novo à frota.'}
              </span>
            </div>
          )}

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

          {/* Formulário — só com um convite a valer.
              Escondido e não desactivado: um formulário cinzento convida a
              tentar, e o que se quer dizer aqui é "vá buscar um link", não
              "insista". */}
          {conviteValido && (
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
              <label className="text-sm font-medium text-gray-700" htmlFor="password">Palavra-passe</label>
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
              <label className="text-sm font-medium text-gray-700" htmlFor="confirm">Confirmar palavra-passe</label>
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
                placeholder="Repita a palavra-passe"
              />
              {confirm && confirm !== password && (
                <p className="text-xs text-red-500">As palavras-passe não coincidem</p>
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
          )}

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