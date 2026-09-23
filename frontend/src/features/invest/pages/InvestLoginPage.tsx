// src/features/invest/pages/InvestLoginPage.tsx
//
// A porta de entrada do portal. É o primeiro ecrã que um investidor vê e,
// muitas vezes, o único que vê antes de decidir se confia nisto.
//
// Duas colunas em ecrã grande: à esquerda a marca e uma frase; à direita o
// formulário, sozinho, com ar de cofre. Em telemóvel fica só o formulário — a
// coluna da esquerda seria uma imagem a ocupar meio ecrã antes do que interessa.
//
// ─── NÃO HÁ REGISTO ─────────────────────────────────────────────────────────
//
// De propósito, e está escrito no ecrã. Contas de investidor são abertas pela
// administração depois de haver conversa e contrato. Um botão "criar conta"
// aqui seria mentira e traria pedidos de gente que não pode entrar.

import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { InvestWordmark } from '../components/InvestBrand';
import { Loader2, Lock } from 'lucide-react';

export function InvestLoginPage() {
  const { login, isAuthenticated, user, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aEntrar, setAEntrar] = useState(false);

  // Uma conta da frota que faça login aqui fica fora, com a explicação. Sem
  // isto entrava e via um portal vazio, porque a API recusa-lhe tudo — e o
  // sintoma seria "o site não funciona".
  if (isAuthenticated && user && user.role !== 'INVESTOR') {
    return (
      <Entrada>
        <div className="inv-surface inv-enter w-full max-w-md p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-[var(--gold-400)]" aria-hidden="true" />
          <h1 className="inv-display mt-4 text-2xl">Esta área é de investidores</h1>
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            A conta <strong className="text-[var(--foreground)]">{user.email}</strong> pertence
            ao portal da frota. Para gerir motoristas e fechos, entre em dragonfleet.pt.
          </p>
          <button
            type="button"
            onClick={() => { void logout(); }}
            className="inv-btn-ghost mt-6 w-full rounded-md px-4 py-2.5 text-sm"
          >
            Entrar com outra conta
          </button>
        </div>
      </Entrada>
    );
  }

  if (isAuthenticated) return <Navigate to="/painel" replace />;

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAEntrar(true);
    try {
      await login(email.trim(), password);
    } catch {
      // Mensagem única para email errado e palavra-passe errada: dizer qual dos
      // dois falhou confirma a quem tenta à sorte que o email existe.
      setErro('Credenciais inválidas.');
    } finally {
      setAEntrar(false);
    }
  }

  return (
    <Entrada>
      <div className="grid w-full max-w-5xl items-center gap-16 lg:grid-cols-2">
        {/* Coluna da marca — escondida em telemóvel */}
        <div className="inv-enter hidden lg:block">
          <InvestWordmark size="lg" />
          <h1 className="inv-display mt-10 text-[2.75rem] leading-[1.15] font-light">
            O seu capital,
            <br />
            <span className="inv-gold-text">a render todos os dias.</span>
          </h1>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
            Acompanhe o rendimento ao dia, consulte o extrato completo e peça
            resgates a qualquer momento. Sem intermediários e sem esperar pelo
            fim do mês para saber onde está.
          </p>
          <hr className="inv-rule my-8 max-w-md" />
          <p className="inv-label">Chromatic Dragon Unipessoal Lda</p>
        </div>

        {/* Coluna do formulário */}
        <div className="inv-surface inv-enter w-full p-8 sm:p-10">
          <div className="lg:hidden">
            <InvestWordmark />
            <hr className="inv-rule my-7" />
          </div>

          <p className="inv-label">Acesso reservado</p>
          <h2 className="inv-display mt-2 text-2xl">Entrar na sua conta</h2>

          <form onSubmit={submeter} className="mt-7 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="inv-label mb-2 block">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="inv-field"
                placeholder="nome@exemplo.pt"
              />
            </div>

            <div>
              <label htmlFor="password" className="inv-label mb-2 block">Palavra-passe</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="inv-field"
                placeholder="••••••••"
              />
            </div>

            {erro && (
              <p
                role="alert"
                className="rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: 'rgba(180, 84, 74, 0.4)',
                  background: 'rgba(180, 84, 74, 0.08)',
                  color: '#e0a49c',
                }}
              >
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={aEntrar}
              className="inv-btn-gold flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm"
            >
              {aEntrar && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {aEntrar ? 'A entrar…' : 'Entrar'}
            </button>
          </form>

          <hr className="inv-rule my-7" />

          <p className="text-center text-xs leading-relaxed text-[var(--muted-foreground)]">
            As contas são abertas pela administração.
            <br />
            Para investir connosco, fale primeiro connosco.
          </p>
        </div>
      </div>
    </Entrada>
  );
}

function Entrada({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      {children}
    </main>
  );
}
