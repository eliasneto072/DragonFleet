// src/shared/lib/format.ts
//
// Centralized formatting helpers.
//
// WHY THIS FILE EXISTS:
// The codebase was mixing "€" (euro) and "R$" (real) in different components
// (e.g. driver-dashboard stats showed €, but the chart axis showed R$).
// All currency rendering should go through `formatCurrency` so the symbol,
// thousands separators and decimals are consistent everywhere. Change the
// locale/currency in ONE place here if the client ever switches markets.

const CURRENCY_LOCALE = 'pt-PT';
const CURRENCY_CODE = 'EUR'; // €  — Portugal

const currencyFmt = new Intl.NumberFormat(CURRENCY_LOCALE, {
  style: 'currency',
  currency: CURRENCY_CODE,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrencyFmt = new Intl.NumberFormat(CURRENCY_LOCALE, {
  style: 'currency',
  currency: CURRENCY_CODE,
  notation: 'compact',
  maximumFractionDigits: 1,
});

const numberFmt = new Intl.NumberFormat(CURRENCY_LOCALE);

/** "R$ 2.847,50" — use for all money shown to users. */
export function formatCurrency(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return currencyFmt.format(0);
  return currencyFmt.format(n);
}

/** "R$ 2,8 mil" — use for chart axes / tight spaces. */
export function formatCurrencyCompact(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return compactCurrencyFmt.format(0);
  return compactCurrencyFmt.format(n);
}

/** "1.234" — plain grouped integer. */
export function formatNumber(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '0';
  return numberFmt.format(n);
}

/** "+12,4%" / "-3,0%" — signed percentage with one decimal. */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '0%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals).replace('.', ',')}%`;
}

/** "20 mar 2026" — short localized date. */
export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
