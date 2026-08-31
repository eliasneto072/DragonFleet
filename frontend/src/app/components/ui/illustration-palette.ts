// src/app/components/ui/illustration-palette.ts
//
// Paleta compartilhada das ilustrações vetoriais planas do DragonFleet.
//
// Duas dimensões independentes:
//
//   tone     'brand' (verde da marca) | 'info' (azul)
//   surface  'light' (sobre card branco) | 'dark' (sobre hero saturado)
//
// O eixo de superfície existe porque a mesma ilustração precisa aparecer
// tanto num card branco quanto sobre um hero de fundo escuro. Em vez de
// manter dois desenhos, a rampa inverte: em 'dark' o corpo assume o tom
// claro e os detalhes o tom escuro.
//
// Os verdes são os stops de --brand-* definidos em styles/theme.css. Os azuis
// vêm da escala blue padrão do Tailwind, a mesma usada nos badges de status.
// Ficam duplicados em hex aqui porque atributos fill de SVG inline não
// resolvem var() de forma confiável em todos os navegadores. Se a escala de
// marca mudar no theme.css, este ficheiro precisa acompanhar — é o único lugar.

export type IllustrationTone = 'brand' | 'info';
export type IllustrationSurface = 'light' | 'dark';

export interface IllustrationPalette {
  /** Volume principal do objeto. */
  body: string;
  /** Faces em sombra e volumes secundários. */
  bodyDark: string;
  /** Detalhes pequenos: fechos, rebites, costuras, mostradores. */
  detail: string;
  /** Papel e superfícies claras (notas, cartões, mostradores). */
  paper: string;
  /** Segunda camada de papel, para dar profundidade na pilha. */
  paperAlt: string;
  /** Borda da moeda. */
  coin: string;
  /** Face da moeda. */
  coinFace: string;
  /** Símbolo gravado na moeda. */
  coinInk: string;
  /** Sombra projetada no chão. */
  shadow: string;
}

// A moeda é sempre âmbar: é o contraponto quente da composição e funciona
// tanto sobre verde quanto sobre azul.
const COIN_ON_LIGHT = { coin: '#d97706', coinFace: '#fbbf24', coinInk: '#78350f' };
const COIN_ON_DARK = { coin: '#f59e0b', coinFace: '#fcd34d', coinInk: '#78350f' };

export const ILLUSTRATION_PALETTE: Record<
  IllustrationTone,
  Record<IllustrationSurface, IllustrationPalette>
> = {
  brand: {
    light: {
      body: '#108865',      // brand-500
      bodyDark: '#0a5440',  // brand-700
      detail: '#073d2f',    // brand-800
      paper: '#c2e8d8',     // brand-100
      paperAlt: '#8fd4ba',  // brand-200
      ...COIN_ON_LIGHT,
      shadow: '#00000010',
    },
    dark: {
      body: '#5dbf9c',      // brand-300
      bodyDark: '#108865',  // brand-500
      detail: '#0a5440',    // brand-700
      paper: '#e6f5ef',     // brand-50
      paperAlt: '#c2e8d8',  // brand-100
      ...COIN_ON_DARK,
      shadow: '#00000028',
    },
  },
  info: {
    light: {
      body: '#2563eb',      // blue-600
      bodyDark: '#1d4ed8',  // blue-700
      detail: '#1e3a8a',    // blue-900
      paper: '#dbeafe',     // blue-100
      paperAlt: '#93c5fd',  // blue-300
      ...COIN_ON_LIGHT,
      shadow: '#00000010',
    },
    dark: {
      body: '#93c5fd',      // blue-300
      bodyDark: '#3b82f6',  // blue-500
      detail: '#1d4ed8',    // blue-700
      paper: '#eff6ff',     // blue-50
      paperAlt: '#dbeafe',  // blue-100
      ...COIN_ON_DARK,
      shadow: '#00000028',
    },
  },
};
