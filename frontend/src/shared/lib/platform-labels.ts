// src/shared/lib/platform-labels.ts
//
// Rótulos e cores das plataformas de ganho, centralizados no mesmo padrão de
// document-labels.ts.
//
// As cores são uma paleta categórica de matizes distintos, não tons da mesma
// família. O esquema anterior (preto + três verdes) funcionava em barras
// separadas mas some quando as plataformas são empilhadas numa barra só.
//
// A cor segue a ENTIDADE, nunca a posição no ranking: se a Bolt passar a Uber,
// cada uma mantém a sua cor. Cor que muda com a ordenação obriga o utilizador
// a reaprender o gráfico a cada semana.

import type { EarningPlatform } from '@/shared/types/api';

export const PLATFORM_LABELS: Record<string, string> = {
  UBER: 'Uber',
  BOLT: 'Bolt',
  FREE_NOW: 'Free Now',
  OTHER: 'Outro',
};

export const PLATFORM_COLORS: Record<string, string> = {
  UBER: '#2a78d6',
  BOLT: '#eb6834',
  FREE_NOW: '#1baf7a',
  OTHER: '#eda100',
};

/** Cor do segmento de ajustes de saldo no gráfico de origem dos ganhos. */
export const ADJUSTMENT_COLOR = '#888780';

export const PLATFORM_OPTIONS: { value: EarningPlatform; label: string }[] = [
  { value: 'UBER', label: 'Uber' },
  { value: 'BOLT', label: 'Bolt' },
  { value: 'FREE_NOW', label: 'Free Now' },
  { value: 'OTHER', label: 'Outro' },
];

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

export function platformColor(platform: string): string {
  return PLATFORM_COLORS[platform] ?? PLATFORM_COLORS.OTHER;
}
