// src/app/components/ui/payout-illustration.tsx
//
// Ilustração do cofre — hero "Total sacado" da tela de Retiradas.
// Mesma linguagem de vehicle-illustration.tsx e wallet-illustration.tsx.
//
// O objeto é deliberadamente diferente da carteira: como os dois heros usam
// o mesmo verde de marca, a distinção entre as telas vem da forma, não da cor.
// (Usar azul num hero e verde no outro faria o azul significar "retiradas" e
// "em análise" ao mesmo tempo, já que o badge de status também é azul.)
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

import { ILLUSTRATION_PALETTE, type IllustrationSurface } from './illustration-palette';

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
  /** Contraste do fundo onde a ilustração será colocada. */
  surface?: IllustrationSurface;
  className?: string;
}

export function PayoutIllustration({ surface = 'dark', className = '' }: Props) {
  const c = ILLUSTRATION_PALETTE[surface];

  return (
    <svg
      viewBox="28 2 146 150"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <style>{CSS}</style>

      <ellipse cx="100" cy="142" rx="68" ry="5" fill={c.shadow} />

      {/* nota saindo por trás do cofre */}
      <g className="df-pay-bill">
        <g transform="rotate(-7 102 26)">
          <rect x="68" y="10" width="68" height="32" rx="4" fill={c.paper} />
          <rect x="80" y="21" width="32" height="3" rx="1.5" fill={c.detail} opacity="0.4" />
          <rect x="80" y="29" width="22" height="3" rx="1.5" fill={c.detail} opacity="0.4" />
        </g>
      </g>

      {/* corpo do cofre */}
      <rect x="34" y="30" width="132" height="104" rx="14" fill={c.body} />
      <rect x="48" y="42" width="104" height="80" rx="10" fill={c.bodyDark} />
      <rect x="38" y="48" width="6" height="12" rx="2" fill={c.detail} />
      <rect x="38" y="104" width="6" height="12" rx="2" fill={c.detail} />
      <rect x="132" y="72" width="9" height="20" rx="4.5" fill={c.detail} />
      <rect x="46" y="134" width="16" height="8" rx="2" fill={c.bodyDark} />
      <rect x="138" y="134" width="16" height="8" rx="2" fill={c.bodyDark} />

      {/* mostrador — destrava na entrada */}
      <g className="df-pay-dial">
        <circle cx="94" cy="82" r="19" fill={c.detail} />
        <circle cx="94" cy="82" r="12" fill={c.paper} />
        <rect x="80" y="80.25" width="28" height="3.5" rx="1.75" fill={c.detail} />
        <rect x="92.25" y="68" width="3.5" height="28" rx="1.75" fill={c.detail} />
      </g>

      {/* moeda — cai na entrada, depois flutua */}
      <g className="df-pay-drop">
        <g className="df-pay-float">
          <circle cx="150" cy="120" r="17" fill={c.coin} />
          <circle cx="150" cy="120" r="13" fill={c.coinFace} />
          <path
            d="M155.5 114 A 6.2 6.2 0 0 0 155.5 126"
            fill="none"
            stroke={c.coinInk}
            strokeWidth="2.7"
            strokeLinecap="round"
          />
          <rect x="142" y="118.2" width="12.5" height="2.4" rx="1.2" fill={c.coinInk} />
          <rect x="142" y="122.2" width="12.5" height="2.4" rx="1.2" fill={c.coinInk} />
        </g>
      </g>
    </svg>
  );
}