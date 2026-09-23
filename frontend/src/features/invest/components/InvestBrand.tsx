// src/features/invest/components/InvestBrand.tsx
//
// A marca do portal: DragonFleet Capital.
//
// É a mesma empresa, com outro nome de fachada. "Capital" em vez de "Fleet"
// porque quem entra aqui não vem tratar de carros — e porque o mesmo logótipo
// nos dois sítios faria o investidor sentir que entrou na porta das traseiras
// de um sistema de gestão de frota, que é literalmente o que se quer evitar.
//
// O desenho é um losango com um D inscrito, em traço fino de ouro. Traço fino
// e não sólido: um símbolo cheio pesa, e isto tem de ficar bem a 24px ao lado
// de um nome e a 96px numa página de entrada.

export function InvestMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* O gradiente é o que faz o traço parecer metal em vez de linha
            amarela. Três pontos: sombra, brilho, sombra. */}
        <linearGradient id="inv-mark-gold" x1="6" y1="4" x2="42" y2="44">
          <stop offset="0%" stopColor="#8C6F18" />
          <stop offset="42%" stopColor="#E8D9A0" />
          <stop offset="70%" stopColor="#C9A227" />
          <stop offset="100%" stopColor="#8C6F18" />
        </linearGradient>
      </defs>

      {/* Losango exterior */}
      <path
        d="M24 3 L45 24 L24 45 L3 24 Z"
        stroke="url(#inv-mark-gold)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Losango interior, mais apagado: dá profundidade sem acrescentar peso */}
      <path
        d="M24 10.5 L37.5 24 L24 37.5 L10.5 24 Z"
        stroke="url(#inv-mark-gold)"
        strokeWidth="0.7"
        strokeLinejoin="round"
        opacity="0.45"
      />
      {/* O D */}
      <path
        d="M20 17.5 h4.2 c3.9 0 6.4 2.6 6.4 6.5 s-2.5 6.5 -6.4 6.5 H20 Z"
        stroke="url(#inv-mark-gold)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function InvestWordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const marca = size === 'lg' ? 56 : size === 'sm' ? 26 : 36;
  const texto = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-base' : 'text-xl';
  const sub = size === 'lg' ? 'text-[11px]' : 'text-[9px]';

  return (
    <div className="flex items-center gap-3">
      <InvestMark size={marca} />
      <div className="leading-none">
        <p className={`inv-display inv-gold-text ${texto} font-medium tracking-wide`}>
          DragonFleet
        </p>
        <p className={`inv-label mt-1 ${sub}`} style={{ letterSpacing: '0.34em' }}>
          Capital
        </p>
      </div>
    </div>
  );
}
