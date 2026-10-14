// src/features/landing/pages/LandingPage.tsx
//
// A porta de entrada. Uma pergunta e duas portas.
//
// ─── PORQUE É QUE ESTA PÁGINA NÃO VENDE NADA ────────────────────────────────
//
// Porque tem dois públicos que não querem a mesma coisa, e um deles sai se
// ler o texto do outro. Um motorista que procura trabalho não quer ler sobre
// fechos semanais e gestão de frota; um dono de frota não quer ler sobre
// ganhar dinheiro a conduzir.
//
// Então esta página faz uma coisa só: pergunta quem és e manda-te para o
// sítio onde se fala contigo. Tudo o que estiver aqui a mais empurra as duas
// portas para baixo da dobra, e uma porta que não se vê não se abre.
//
// ─── O ESCURO É DELIBERADO ──────────────────────────────────────────────────
//
// É o mesmo verde-escuro do painel. Quem se inscreve reconhece o sítio quando
// entra pela primeira vez, e para um gestor de frota lê-se como ferramenta a
// sério — não como panfleto.

import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Car } from 'lucide-react';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';
import { VERDE } from '../components/Chrome';

/**
 * Uma porta.
 *
 * Grande, clicável por inteiro, e com um verbo no fim. Dois cartões iguais ao
 * lado um do outro é uma escolha; dois cartões onde um é maior é uma
 * recomendação — e aqui não há recomendação a fazer, porque as duas são
 * públicos diferentes e não opções do mesmo.
 */
function Porta({
  to, icone: Icone, titulo, texto, verbo,
}: {
  to: string;
  icone: typeof Car;
  titulo: string;
  texto: string;
  verbo: string;
}) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col overflow-hidden rounded-2xl border
        border-white/10 bg-white/5 p-8 transition
        hover:border-[#108865]/60 hover:bg-white/[0.07]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#108865]"
    >
      {/* O brilho que acende ao passar. Decoração, e por isso escondido de
          quem usa leitor de ecrã. */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full
          opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-30"
        style={{ background: VERDE }}
        aria-hidden="true"
      />

      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: 'rgba(16,136,101,0.15)' }}
      >
        <Icone className="h-6 w-6" style={{ color: VERDE }} />
      </div>

      <h2 className="mt-5 text-2xl font-bold text-white">{titulo}</h2>
      <p className="mt-2 flex-1 text-white/60">{texto}</p>

      <span
        className="mt-6 inline-flex items-center gap-2 font-semibold transition group-hover:gap-3"
        style={{ color: VERDE }}
      >
        {verbo}
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#07100d]">
      {/* ── Topo mínimo ──
          Só o logótipo e o Entrar. Um menu de navegação numa página cuja
          única função é escolher entre duas portas é mais uma coisa para
          onde olhar antes de escolher. */}
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
        <DragonFleetLogo size={38} />
        <Link
          to="/login"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white/80
            transition hover:bg-white/10 hover:text-white"
        >
          Entrar
        </Link>
      </header>

      <main className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl
        flex-col justify-center px-4 pb-20 sm:px-6">

        {/* Os dois halos verdes do fundo. */}
        <div
          className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: VERDE }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full opacity-10 blur-3xl"
          style={{ background: VERDE }}
          aria-hidden="true"
        />

        <div className="relative">
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.1] text-white sm:text-6xl">
            A frota inteira,
            <br />
            <span style={{ color: VERDE }}>num sítio só.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg text-white/60 sm:text-xl">
            Motoristas, carros, fechos, documentos e oficina. Feito por quem
            gere uma frota TVDE todos os dias — e usa isto todos os dias.
          </p>

          {/* ── As duas portas ──
              A pergunta por cima delas, e não no título: o título diz o que
              isto é, a pergunta diz o que fazer a seguir. Juntas, nenhuma das
              duas se lê. */}
          <p className="mt-12 text-sm font-semibold uppercase tracking-wider text-white/40">
            Diga-nos quem é
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Porta
              to="/motoristas"
              icone={Car}
              titulo="Sou motorista"
              texto="Quer começar a trabalhar em TVDE, ou já conduz e está farto de
                papelada. Com carro ou sem carro."
              verbo="Ver como funciona"
            />
            <Porta
              to="/gestores"
              icone={Building2}
              titulo="Sou gestor de frota"
              // A oferta dita já aqui, e não só na página seguinte: quem lê
              // «primeiro mês grátis» antes de clicar entra decidido a
              // experimentar, e não a avaliar. Não há oferta equivalente do
              // lado do motorista, por isso a simetria quebra-se — de
              // propósito.
              texto="Tem motoristas e carros, e passa sábados a fechar contas no Excel.
                Primeiro mês grátis."
              verbo="Ver a plataforma"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
