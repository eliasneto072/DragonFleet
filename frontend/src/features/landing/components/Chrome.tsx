// src/features/landing/components/Chrome.tsx
//
// A moldura das páginas públicas: topo, rodapé e as peças repetidas.
//
// ─── PORQUE É QUE ISTO NÃO USA O TEMA DA APLICAÇÃO ──────────────────────────
//
// Porque o painel tem modo claro e escuro, e o site não. Uma página de vendas
// desenhada em escuro e vista em claro por quem tem o telemóvel nesse modo é
// outra página — com contrastes que ninguém reviu. Aqui as cores são
// escritas, e são as mesmas em todo o lado.
//
// É também a razão por que estes ficheiros não usam os componentes de `ui/`
// nas partes com cor: aqueles seguem o tema, e aqui não há tema a seguir.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';
import { CONTACTO } from '../conteudo';

/** O verde da marca. O mesmo do painel e do logótipo. */
export const VERDE = '#108865';
export const VERDE_ESCURO = '#0d6b4f';
export const PRETO = '#07100d';

/** O link do WhatsApp, com a mensagem já escrita. */
export function linkWhatsApp(mensagem: string): string {
  return `https://wa.me/${CONTACTO.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}

export function TopoPublico({ voltar }: { voltar?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07100d]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <DragonFleetLogo size={34} />
        </Link>

        <div className="flex items-center gap-2">
          {voltar && (
            <Link
              to="/"
              className="hidden sm:block rounded-lg px-3 py-2 text-sm text-white/70 transition hover:text-white"
            >
              Voltar
            </Link>
          )}
          <Link
            to="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            Entrar
          </Link>
        </div>
      </div>
    </header>
  );
}

export function RodapePublico() {
  return (
    <footer className="border-t border-white/10 bg-[#07100d] py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <DragonFleetLogo size={32} />
            <p className="mt-2 text-sm text-white/50">
              Chromatic Dragon Unipessoal Lda
            </p>
          </div>

          <div className="text-sm text-white/60">
            <a href={`mailto:${CONTACTO.email}`} className="block transition hover:text-white">
              {CONTACTO.email}
            </a>
            <span className="block">{CONTACTO.telefoneVisivel}</span>
          </div>
        </div>

        <p className="mt-8 text-xs text-white/30">
          © {new Date().getFullYear()} DragonFleet
        </p>
      </div>
    </footer>
  );
}

/**
 * Uma secção com respiração.
 *
 * O espaçamento vertical é generoso de propósito: numa página de vendas lida
 * no telemóvel, o que separa duas ideias é o espaço entre elas. Apertado, o
 * olho lê tudo como um bloco só e não fica com nada.
 */
export function Seccao({
  children, fundo = 'escuro', id,
}: { children: ReactNode; fundo?: 'escuro' | 'menos-escuro'; id?: string }) {
  return (
    <section
      id={id}
      className={`py-16 sm:py-24 ${fundo === 'escuro' ? 'bg-[#07100d]' : 'bg-[#0b1a15]'}`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

export function TituloDaSeccao({
  sobretitulo, titulo, texto,
}: { sobretitulo?: string; titulo: string; texto?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      {sobretitulo && (
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: VERDE }}>
          {sobretitulo}
        </p>
      )}
      <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">{titulo}</h2>
      {texto && <p className="mt-4 text-lg text-white/60">{texto}</p>}
    </div>
  );
}

/**
 * Uma âncora na própria página (`#planos`) não é um link para fora.
 *
 * Os botões abaixo abriam TUDO com `target="_blank"`, incluindo o «Ver planos
 * e preços». Resultado: clicar nele abria uma aba nova da mesma página em vez
 * de descer até aos preços — num botão que é dos mais clicados da página, e
 * nas duas páginas públicas.
 */
function ehAncora(href?: string): boolean {
  return !!href && href.startsWith('#');
}

/** O botão principal. Verde cheio, e só há um por dobra. */
export function BotaoPrincipal({
  href, to, children, className = '',
}: { href?: string; to?: string; children: ReactNode; className?: string }) {
  const classes = 'inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 '
    + 'text-base font-semibold text-white shadow-lg transition hover:brightness-110 '
    + `active:scale-[0.98] ${className}`;
  const estilo = { background: `linear-gradient(135deg, ${VERDE} 0%, ${VERDE_ESCURO} 100%)` };

  if (to) return <Link to={to} className={classes} style={estilo}>{children}</Link>;

  const fora = ehAncora(href) ? {} : { target: '_blank', rel: 'noreferrer' };
  return (
    <a href={href} {...fora} className={classes} style={estilo}>
      {children}
    </a>
  );
}

/** O secundário. Contorno, para não competir com o de cima. */
export function BotaoSecundario({
  href, to, children,
}: { href?: string; to?: string; children: ReactNode }) {
  const classes = 'inline-flex items-center justify-center gap-2 rounded-xl border '
    + 'border-white/20 px-6 py-3.5 text-base font-medium text-white transition '
    + 'hover:border-white/40 hover:bg-white/5 active:scale-[0.98]';

  if (to) return <Link to={to} className={classes}>{children}</Link>;

  const fora = ehAncora(href) ? {} : { target: '_blank', rel: 'noreferrer' };
  return <a href={href} {...fora} className={classes}>{children}</a>;
}

/**
 * O selo da oferta.
 *
 * Verde cheio e em cima do título, porque «primeiro mês grátis» é a frase que
 * tira o risco de cima do comprador — e um argumento desses escondido no meio
 * de um parágrafo não faz o trabalho que tem para fazer.
 */
export function Selo({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-4 py-1.5
        text-sm font-semibold text-white"
      style={{ background: VERDE }}
    >
      {children}
    </span>
  );
}
