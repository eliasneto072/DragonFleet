// src/app/components/ranks/rank-visuals.tsx
//
// A cara dos níveis: o emblema pequeno que anda ao lado do nome e o cartão
// grande do painel.
//
// ─── AS CORES VÊM DA BASE ───────────────────────────────────────────────────
//
// Cada nível guarda uma cor em #RRGGBB, editável no painel. Tudo aqui deriva
// dessa cor — o fundo, a borda, o texto — em vez de haver uma paleta escrita
// no código. Assim, mudar o Dragon Master de roxo para dourado é um campo no
// painel e não um pedido de alteração ao programador.
//
// ─── LEGIBILIDADE ───────────────────────────────────────────────────────────
//
// O texto sobre a cor é branco ou preto conforme a luminância da própria cor,
// calculada aqui. Uma cor clara escolhida no painel não pode deixar o nome do
// nível ilegível, e não é razoável pedir a quem escolhe a cor que pense nisso.

import type { CSSProperties } from 'react';
import { Crown, ShieldCheck } from 'lucide-react';
import type { RankConfig, Tier } from '@/shared/services/ranks.service';
import { tierIndex } from '@/shared/services/ranks.service';

// ── Cor ───────────────────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? h.split('').map((c) => parseInt(c + c, 16))
    : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)].map((p) => parseInt(p, 16));
  return [n[0] || 0, n[1] || 0, n[2] || 0];
}

/** Escurece (pct negativo) ou clareia (positivo) uma cor. */
export function shade(hex: string, pct: number): string {
  const [r, g, b] = parseHex(hex);
  const mix = (c: number) => Math.round(pct < 0 ? c * (1 + pct) : c + (255 - c) * pct);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Branco ou preto, conforme o que se lê melhor sobre a cor. */
export function readableOn(hex: string): string {
  const [r, g, b] = parseHex(hex);
  // Luminância relativa, fórmula do WCAG simplificada.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? '#111827' : '#FFFFFF';
}

/** O fundo do cartão: a cor da marca do nível, com profundidade. */
export function rankGradient(hex: string): string {
  return `linear-gradient(135deg, ${shade(hex, 0.12)} 0%, ${hex} 45%, ${shade(hex, -0.35)} 100%)`;
}

// ── Emblema ───────────────────────────────────────────────────────────────────

/**
 * O emblema que acompanha o nome, na barra lateral e nas listas.
 *
 * `size="sm"` é o das listas; o normal serve para cabeçalhos.
 */
export function RankBadge({ config, size = 'md', title }: {
  config: Pick<RankConfig, 'label' | 'color' | 'tier'> | undefined;
  size?: 'sm' | 'md';
  title?: string;
}) {
  if (!config) return null;
  const pequeno = size === 'sm';

  const style: CSSProperties = {
    background: rgba(config.color, 0.14),
    color: config.color,
    borderColor: rgba(config.color, 0.35),
  };

  return (
    <span
      title={title ?? config.label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold ${
        pequeno ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      }`}
      style={style}
    >
      <span
        className={`rounded-full ${pequeno ? 'h-1.5 w-1.5' : 'h-2 w-2'}`}
        style={{ background: config.color }}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}

// ── Peças do cartão ───────────────────────────────────────────────────────────

const pct = (n: number) => `${n.toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%`;

/** As vantagens de um nível, em linguagem de motorista. */
export function rankPerks(c: RankConfig): string[] {
  const out: string[] = [];
  if (c.fuelDiscount > 0) out.push(`${pct(c.fuelDiscount)} de desconto no combustível`);
  if (c.vehicleDiscount > 0) out.push(`${pct(c.vehicleDiscount)} de desconto na viatura`);
  if (c.tollsDiscount > 0) out.push(`${pct(c.tollsDiscount)} de desconto nas portagens`);
  if (c.investmentRateBonus > 0) out.push(`+${pct(c.investmentRateBonus)} nos investimentos`);
  if (c.perks?.trim()) out.push(...c.perks.split('\n').map((l) => l.trim()).filter(Boolean));
  return out;
}

/** As metas de um nível, em linguagem de motorista. */
export function rankGoals(c: RankConfig, fmt: (n: number) => string): string[] {
  const out: string[] = [];
  if (c.minSeasonRevenue > 0) out.push(`${fmt(c.minSeasonRevenue)} faturados na temporada`);
  if (c.minInvested > 0) out.push(`${fmt(c.minInvested)} aplicados em investimentos`);
  if (c.minBalance > 0) out.push(`${fmt(c.minBalance)} de saldo em conta`);
  if (c.minWeeks > 0) out.push(`${c.minWeeks} semanas com fecho`);
  if (c.requireValidDocuments) out.push('Documentos em dia');
  return out;
}

export function TierIcon({ tier, className }: { tier: Tier; className?: string }) {
  // O topo leva coroa; os restantes, escudo. Um símbolo diferente no último
  // nível faz mais pela vontade de lá chegar do que mais uma linha de texto.
  const Icon = tierIndex(tier) === 5 ? Crown : ShieldCheck;
  return <Icon className={className} aria-hidden="true" />;
}
