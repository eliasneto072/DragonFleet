// src/app/components/ui/illustration-palette.ts
//
// Paleta compartilhada das ilustrações vetoriais planas do DragonFleet.
//
// Os verdes são exatamente os stops da escala de marca definida em
// styles/theme.css (--brand-50 … --brand-800). Ficam duplicados aqui em hex
// porque atributos fill de SVG inline não resolvem var() de forma confiável
// em todos os navegadores. Se a escala mudar no theme.css, este arquivo
// precisa acompanhar — mas é o único lugar.
//
// As ilustrações aparecem em dois contextos de contraste oposto: cards
// brancos (surface="light") e os heros de fundo brand-600/700
// (surface="dark"). Em vez de manter dois desenhos, a paleta inverte.

export type IllustrationSurface = 'light' | 'dark';

export interface IllustrationPalette {
  /** Volume principal do objeto. */
  body: string;
  /** Faces em sombra e volumes secundários. */
  bodyDark: string;
  /** Detalhes pequenos: fechos, dobradiças, vincos. */
  detail: string;
  /** Papel/superfícies claras (notas, mostradores). */
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

export const ILLUSTRATION_PALETTE: Record<IllustrationSurface, IllustrationPalette> = {
  // Sobre card branco: o objeto é mais escuro que o fundo.
  light: {
    body: '#108865',      // brand-500
    bodyDark: '#0a5440',  // brand-700
    detail: '#073d2f',    // brand-800
    paper: '#c2e8d8',     // brand-100
    paperAlt: '#8fd4ba',  // brand-200
    coin: '#d97706',
    coinFace: '#fbbf24',
    coinInk: '#78350f',
    shadow: '#00000010',
  },
  // Sobre hero brand-600/700: o objeto é mais claro que o fundo.
  dark: {
    body: '#5dbf9c',      // brand-300
    bodyDark: '#108865',  // brand-500
    detail: '#0a5440',    // brand-700
    paper: '#e6f5ef',     // brand-50
    paperAlt: '#c2e8d8',  // brand-100
    coin: '#f59e0b',      // --warning
    coinFace: '#fcd34d',
    coinInk: '#78350f',
    shadow: '#00000028',
  },
};
