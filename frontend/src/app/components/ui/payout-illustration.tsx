// src/app/components/ui/payout-illustration.tsx
//
// Ilustração do cofre — hero "Total sacado" da tela de Retiradas.
//
// Mesma gramática visual de vehicle-illustration.tsx e wallet-illustration.tsx.
// O acabamento vem da densidade de detalhe: rebites nos cantos da porta e
// entalhes no aro do mostrador. Os entalhes giram junto com o mostrador, o que
// torna a rotação legível — um círculo liso girando é invisível.
//
// Animação de entrada: o mostrador destrava girando até a posição final, a
// nota sobe por trás e a moeda cai. Depois só a moeda mantém uma flutuação
// lenta — o mostrador fica parado, porque algo girando em loop numa tela
// financeira lê como carregamento.
//
// Detalhes de implementação:
// - As keyframes moram aqui, não no tailwind.config.
// - Queda e flutuação da moeda ficam em grupos aninhados; duas animações de
//   transform no mesmo elemento se sobrescrevem.
// - O mostrador usa transform-box: fill-box para girar em torno do próprio
//   centro, sem depender das coordenadas do viewBox.
// - prefers-reduced-motion desliga tudo e mantém o estado final.
// - Decorativa: aria-hidden, já que o valor ao lado carrega o significado.

import {
  ILLUSTRATION_PALETTE,
  type IllustrationSurface,
  type IllustrationTone,
} from './illustration-palette';

const CSS = `
@keyframes df-pay-unlock {
  from { transform: rotate(-170deg); }
  to   { transform: rotate(0deg); }
}
@keyframes df-pay-rise {
  from { transform: translateY(18px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
@keyframes df-pay-drop {
  0%   { transform: translateY(-24px); opacity: 0; }
  65%  { transform: translateY(3px);   opacity: 1; }
  100% { transform: translateY(0);     opacity: 1; }
}
@keyframes df-pay-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-3px); }
}
.df-pay-dial {
  transform-box: fill-box;
  transform-origin: center;
  animation: df-pay-unlock 1.1s cubic-bezier(.22,1,.36,1) .1s both;
}
.df-pay-bill  { animation: df-pay-rise .70s cubic-bezier(.22,1,.36,1) both; }
.df-pay-drop  { animation: df-pay-drop .80s cubic-bezier(.34,1.28,.64,1) .45s both; }
.df-pay-float { animation: df-pay-float 4.5s ease-in-out 1.4s infinite; }
@media (prefers-reduced-motion: reduce) {
  .df-pay-dial, .df-pay-bill, .df-pay-drop, .df-pay-float { animation: none; opacity: 1; }
}
`;

interface Props {
  /** Família de cor. 'brand' = verde da marca, 'info' = azul. */
  tone?: IllustrationTone;
  /** Contraste do fundo onde a ilustração será colocada. */
  surface?: IllustrationSurface;
  className?: string;
}

export function PayoutIllustration({
  tone = 'info',
  surface = 'dark',
  className = '',
}: Props) {
  const c = ILLUSTRATION_PALETTE[tone][surface];

  return (
    <svg
      viewBox="28 0 148 152"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <style>{CSS}</style>

      <ellipse cx="100" cy="146" rx="70" ry="5" fill={c.shadow} />

      {/* nota saindo por trás do cofre */}
      <g className="df-pay-bill">
        <g transform="rotate(-7 100 22)">
          <rect x="68" y="6" width="64" height="30" rx="4" fill={c.paper} />
          <rect x="80" y="16" width="30" height="3" rx="1.5" fill={c.detail} opacity="0.4" />
          <rect x="80" y="24" width="20" height="3" rx="1.5" fill={c.detail} opacity="0.4" />
        </g>
      </g>

      {/* corpo do cofre */}
      <path
        d="M34 44 Q34 32 46 32 L154 32 Q166 32 166 44 L166 124
           Q166 136 154 136 L46 136 Q34 136 34 124 Z"
        fill={c.body}
      />

      {/* porta */}
      <rect x="48" y="46" width="104" height="76" rx="9" fill={c.bodyDark} />

      {/* rebites da porta */}
      <circle cx="57" cy="55" r="2.2" fill={c.detail} />
      <circle cx="143" cy="55" r="2.2" fill={c.detail} />
      <circle cx="57" cy="113" r="2.2" fill={c.detail} />
      <circle cx="143" cy="113" r="2.2" fill={c.detail} />

      {/* puxador */}
      <rect x="130" y="74" width="9" height="20" rx="4.5" fill={c.detail} />

      {/* pés */}
      <rect x="46" y="136" width="16" height="7" rx="2" fill={c.bodyDark} />
      <rect x="138" y="136" width="16" height="7" rx="2" fill={c.bodyDark} />

      {/* mostrador — destrava na entrada; os entalhes tornam o giro legível */}
      <g className="df-pay-dial">
        <circle cx="92" cy="84" r="20" fill={c.detail} />
        <rect x="90.5" y="66" width="3" height="5" rx="1.5" fill={c.paper} opacity="0.6" />
        <rect x="90.5" y="97" width="3" height="5" rx="1.5" fill={c.paper} opacity="0.6" />
        <rect x="74" y="82.5" width="5" height="3" rx="1.5" fill={c.paper} opacity="0.6" />
        <rect x="105" y="82.5" width="5" height="3" rx="1.5" fill={c.paper} opacity="0.6" />
        <circle cx="92" cy="84" r="13" fill={c.paper} />
        <rect x="79" y="82.25" width="26" height="3.5" rx="1.75" fill={c.detail} />
        <rect x="90.25" y="71" width="3.5" height="26" rx="1.75" fill={c.detail} />
      </g>

      {/* moeda — cai na entrada, depois flutua */}
      <g className="df-pay-drop">
        <g className="df-pay-float">
          <circle cx="152" cy="124" r="17" fill={c.coin} />
          <circle cx="152" cy="124" r="13" fill={c.coinFace} />
          <path
            d="M157.5 118 A 6.2 6.2 0 0 0 157.5 130"
            fill="none"
            stroke={c.coinInk}
            strokeWidth="2.7"
            strokeLinecap="round"
          />
          <rect x="144" y="121.4" width="12.5" height="2.4" rx="1.2" fill={c.coinInk} />
          <rect x="144" y="125.4" width="12.5" height="2.4" rx="1.2" fill={c.coinInk} />
        </g>
      </g>
    </svg>
  );
}
