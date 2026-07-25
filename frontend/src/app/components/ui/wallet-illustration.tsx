// src/app/components/ui/wallet-illustration.tsx
//
// Ilustração da carteira — hero "Saldo disponível para retirada".
//
// Mesma gramática visual de vehicle-illustration.tsx: silhueta construída com
// paths curvos (não retângulos empilhados), sem gradiente, sem sombra difusa,
// três tons por objeto mais um acento quente. A aresta superior do bolso é
// curva e acompanhada de uma linha de costura pontilhada — é esse tipo de
// detalhe que dá à peça o mesmo acabamento do carro.
//
// Animação de entrada: os cartões sobem de trás da carteira e a moeda cai e
// assenta. Depois a moeda mantém uma flutuação lenta de 3px, o suficiente
// para a tela não parecer congelada sem competir com a leitura do saldo.
//
// Detalhes de implementação que não são óbvios:
// - As keyframes moram aqui, não no tailwind.config. O componente é
//   autocontido e não depende de configuração externa.
// - Não é possível empilhar duas animações de transform no mesmo elemento
//   (a segunda sobrescreve a primeira), então queda e flutuação da moeda
//   ficam em grupos aninhados. Mesma razão para os cartões: a rotação
//   estática fica num <g> interno, abaixo do <g> animado.
// - prefers-reduced-motion desliga tudo e mantém o estado final.
// - A ilustração é decorativa: o valor em euros ao lado já comunica o
//   significado, então ela é aria-hidden em vez de ter um rótulo redundante.

import {
  ILLUSTRATION_PALETTE,
  type IllustrationSurface,
  type IllustrationTone,
} from './illustration-palette';

const CSS = `
@keyframes df-wal-rise {
  from { transform: translateY(20px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
@keyframes df-wal-drop {
  0%   { transform: translateY(-26px); opacity: 0; }
  65%  { transform: translateY(3px);   opacity: 1; }
  100% { transform: translateY(0);     opacity: 1; }
}
@keyframes df-wal-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-3px); }
}
.df-wal-card  { animation: df-wal-rise .70s cubic-bezier(.22,1,.36,1) both; }
.df-wal-card2 { animation-delay: .12s; }
.df-wal-drop  { animation: df-wal-drop .80s cubic-bezier(.34,1.28,.64,1) .34s both; }
.df-wal-float { animation: df-wal-float 4.5s ease-in-out 1.3s infinite; }
@media (prefers-reduced-motion: reduce) {
  .df-wal-card, .df-wal-drop, .df-wal-float { animation: none; opacity: 1; }
}
`;

interface Props {
  /** Família de cor. 'brand' = verde da marca, 'info' = azul. */
  tone?: IllustrationTone;
  /** Contraste do fundo onde a ilustração será colocada. */
  surface?: IllustrationSurface;
  className?: string;
}

export function WalletIllustration({
  tone = 'brand',
  surface = 'dark',
  className = '',
}: Props) {
  const c = ILLUSTRATION_PALETTE[tone][surface];

  return (
    <svg
      viewBox="24 4 152 142"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <style>{CSS}</style>

      <ellipse cx="100" cy="134" rx="76" ry="5" fill={c.shadow} />

      {/* cartões em leque, saindo por trás da carteira */}
      <g className="df-wal-card">
        <g transform="rotate(-13 102 42)">
          <rect x="64" y="18" width="76" height="48" rx="6" fill={c.paper} />
          <circle cx="102" cy="42" r="8" fill={c.paperAlt} />
        </g>
      </g>
      <g className="df-wal-card df-wal-card2">
        <g transform="rotate(-3 112 50)">
          <rect x="74" y="26" width="76" height="48" rx="6" fill={c.paperAlt} />
          <rect x="86" y="42" width="34" height="3.5" rx="1.75" fill={c.detail} opacity="0.4" />
          <rect x="86" y="51" width="22" height="3.5" rx="1.75" fill={c.detail} opacity="0.4" />
        </g>
      </g>

      {/* corpo da carteira */}
      <path
        d="M30 60 Q30 52 39 52 L161 52 Q170 52 170 60 L170 116
           Q170 126 159 126 L41 126 Q30 126 30 116 Z"
        fill={c.body}
      />

      {/* bolso da frente — aresta superior curva, não reta */}
      <path
        d="M30 84 Q100 74 170 84 L170 116 Q170 126 159 126 L41 126 Q30 126 30 116 Z"
        fill={c.bodyDark}
      />

      {/* costura acompanhando a curva do bolso */}
      <path
        d="M35 84.6 Q100 74.8 165 84.6"
        fill="none"
        stroke={c.paper}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="3 4"
        opacity="0.5"
      />

      {/* fecho elástico */}
      <rect x="118" y="92" width="44" height="20" rx="10" fill={c.detail} />
      <circle cx="140" cy="102" r="5.5" fill={c.paper} />

      {/* moeda — cai na entrada, depois flutua */}
      <g className="df-wal-drop">
        <g className="df-wal-float">
          <circle cx="56" cy="116" r="18" fill={c.coin} />
          <circle cx="56" cy="116" r="13.5" fill={c.coinFace} />
          <path
            d="M61.5 110 A 6.2 6.2 0 0 0 61.5 122"
            fill="none"
            stroke={c.coinInk}
            strokeWidth="2.7"
            strokeLinecap="round"
          />
          <rect x="49" y="113.4" width="12.5" height="2.4" rx="1.2" fill={c.coinInk} />
          <rect x="49" y="117.4" width="12.5" height="2.4" rx="1.2" fill={c.coinInk} />
        </g>
      </g>
    </svg>
  );
}
