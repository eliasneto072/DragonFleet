// src/app/components/ui/wallet-illustration.tsx
//
// Ilustração da carteira — hero "Saldo disponível para retirada".
// Vetor plano, mesma linguagem de vehicle-illustration.tsx: sem gradiente,
// sem sombra difusa, três tons por objeto.
//
// Animação de entrada: as notas sobem de trás da carteira e a moeda cai e
// assenta. Depois a moeda mantém uma flutuação lenta de 3px, o suficiente
// para a tela não parecer congelada sem competir com a leitura do saldo.
//
// Detalhes de implementação que não são óbvios:
// - As keyframes moram aqui, não no tailwind.config. O componente é
//   autocontido e não depende de configuração externa.
// - Não é possível empilhar duas animações de transform no mesmo elemento
//   (a segunda sobrescreve a primeira), então queda e flutuação da moeda
//   ficam em grupos aninhados. Mesma razão para as notas: a rotação estática
//   fica num <g> interno, abaixo do <g> animado.
// - prefers-reduced-motion desliga tudo e mantém o estado final.
// - A ilustração é decorativa: o valor em euros ao lado já comunica o
//   significado, então ela é aria-hidden em vez de ter um rótulo redundante.

import { ILLUSTRATION_PALETTE, type IllustrationSurface } from './illustration-palette';

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
.df-wal-bill  { animation: df-wal-rise .70s cubic-bezier(.22,1,.36,1) both; }
.df-wal-bill2 { animation-delay: .12s; }
.df-wal-drop  { animation: df-wal-drop .80s cubic-bezier(.34,1.28,.64,1) .34s both; }
.df-wal-float { animation: df-wal-float 4.5s ease-in-out 1.3s infinite; }
@media (prefers-reduced-motion: reduce) {
  .df-wal-bill, .df-wal-drop, .df-wal-float { animation: none; opacity: 1; }
}
`;

interface Props {
  /** Contraste do fundo onde a ilustração será colocada. */
  surface?: IllustrationSurface;
  className?: string;
}

export function WalletIllustration({ surface = 'dark', className = '' }: Props) {
  const c = ILLUSTRATION_PALETTE[surface];

  return (
    <svg
      viewBox="20 4 168 144"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <style>{CSS}</style>

      <ellipse cx="100" cy="138" rx="76" ry="5" fill={c.shadow} />

      {/* notas — sobem de trás da carteira */}
      <g className="df-wal-bill">
        <g transform="rotate(-9 102 40)">
          <rect x="62" y="14" width="80" height="52" rx="5" fill={c.paper} />
          <circle cx="102" cy="40" r="9" fill={c.paperAlt} />
        </g>
      </g>
      <g className="df-wal-bill df-wal-bill2">
        <g transform="rotate(6 112 48)">
          <rect x="72" y="22" width="80" height="52" rx="5" fill={c.paperAlt} />
          <rect x="86" y="40" width="38" height="3" rx="1.5" fill={c.detail} opacity="0.45" />
          <rect x="86" y="49" width="26" height="3" rx="1.5" fill={c.detail} opacity="0.45" />
        </g>
      </g>

      {/* corpo da carteira */}
      <rect x="26" y="52" width="148" height="80" rx="12" fill={c.body} />
      <path d="M26 78 L174 78 L174 120 Q174 132 162 132 L38 132 Q26 132 26 120 Z" fill={c.bodyDark} />
      <rect x="112" y="88" width="48" height="26" rx="8" fill={c.detail} />
      <circle cx="136" cy="101" r="6" fill={c.paper} />

      {/* moeda — cai na entrada, depois flutua */}
      <g className="df-wal-drop">
        <g className="df-wal-float">
          <circle cx="164" cy="112" r="19" fill={c.coin} />
          <circle cx="164" cy="112" r="14.5" fill={c.coinFace} />
          <path
            d="M170 105 A 7 7 0 0 0 170 119"
            fill="none"
            stroke={c.coinInk}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect x="155" y="110" width="14" height="2.6" rx="1.3" fill={c.coinInk} />
          <rect x="155" y="114.5" width="14" height="2.6" rx="1.3" fill={c.coinInk} />
        </g>
      </g>
    </svg>
  );
}