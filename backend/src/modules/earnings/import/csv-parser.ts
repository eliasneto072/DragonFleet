// src/modules/earnings/import/csv-parser.ts
//
// Parses driver earnings CSV exports (Uber / Bolt / generic) into normalized
// earning rows ready to insert. This is the real "platform integration":
// drivers download their weekly statement from Uber/Bolt and upload it here.
//
// Design goals:
//  - Tolerant of column-name variations (PT + EN headers, different casings)
//  - Tolerant of "R$ 1.234,56" and "1234.56" number formats
//  - Never throws on a bad row — collects errors and keeps going
//
// No external dep required (tiny hand-rolled CSV splitter that handles quotes).

import { EarningPlatform } from '../../../shared/types/enums';

export interface ParsedEarningRow {
  amount: number;
  date: string;          // YYYY-MM-DD
  platform: EarningPlatform;
  raw: Record<string, string>;
}

export interface ParseResult {
  rows: ParsedEarningRow[];
  errors: { line: number; reason: string }[];
  detectedPlatform: EarningPlatform | null;
  totalAmount: number;
}

// ── Header aliases ──────────────────────────────────────────────────────────
// Map many possible source headers → our canonical fields.
// Order matters: net/payout columns are matched BEFORE gross "fare", so a file
// with both (e.g. Uber's "Fare" + "Net Earnings") imports what the driver is
// actually paid, not the gross fare.
const AMOUNT_HEADERS = [
  // Os nomes que identificam o líquido SEM ambiguidade vêm primeiro. Um extrato
  // português tem "Rendimentos brutos" e "Rendimentos líquidos", e ambos contêm
  // "rendimento" — sem estas entradas explícitas, o alias genérico apanhava o
  // bruto por estar numa coluna anterior.
  'net earnings', 'net_amount', 'net amount',
  'rendimentos líquidos', 'rendimentos liquidos',
  'valor líquido', 'valor liquido', 'payout',
  // A partir daqui são genéricos: só valem quando não há coluna líquida.
  'rendimento', 'ganhos', 'earnings', 'amount', 'valor', 'total', 'value', 'fare',
];

/**
 * Marcas de que uma coluna é o valor BRUTO, antes da comissão da plataforma.
 *
 * Servem de desempate: quando o mesmo alias casa com mais do que uma coluna,
 * fica a que não tem nenhuma destas marcas. É o que apanha as variantes de
 * cabeçalho que ainda não vimos, sem ser preciso listá-las uma a uma.
 */
const GROSS_MARKERS = ['bruto', 'brutos', 'gross', 'fare', 'tarifa'];

function looksGross(header: string): boolean {
  return GROSS_MARKERS.some((m) => header.includes(m));
}
const DATE_HEADERS = [
  'date', 'data', 'trip date', 'data da viagem', 'datetime', 'request_date',
  'request time', 'data/hora', 'período', 'periodo', 'day', 'dia',
];
const PLATFORM_HEADERS = ['platform', 'plataforma', 'source', 'app'];

// ── CSV line splitter (RFC-4180-ish: handles quoted fields w/ commas) ──────────
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = headerLine.split(d).length;
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim());
  // Scan aliases in priority order: an earlier alias (e.g. "net earnings")
  // wins even if a lower-priority one (e.g. "fare") sits in an earlier column.
  // Exact matches are preferred over substring matches within the same alias.
  for (const alias of aliases) {
    const exact = lower.findIndex((h) => h === alias);
    if (exact !== -1) return exact;
  }
  for (const alias of aliases) {
    // TODAS as colunas que casam, e não a primeira.
    //
    // Com "Rendimentos brutos" e "Rendimentos líquidos" no mesmo ficheiro, o
    // alias "rendimento" casa com as duas, e ficar pela primeira importava o
    // bruto — o valor antes da comissão da plataforma, sempre maior do que o
    // motorista recebeu. Ver o teste de regressão em csv-parser.test.ts.
    const matches = lower
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => h.includes(alias));

    if (matches.length === 0) continue;

    const liquid = matches.find(({ h }) => !looksGross(h));
    return (liquid ?? matches[0]).i;
  }
  return -1;
}

// ── Number parsing: "R$ 1.234,56" | "1,234.56" | "1234.56" → 1234.56 ──────────
export function parseAmount(input: string): number | null {
  if (!input) return null;
  let s = input.replace(/[^\d.,-]/g, '').trim(); // strip R$, spaces, letters
  if (!s) return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // Last separator is the decimal one
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');   // pt-BR: 1.234,56
    } else {
      s = s.replace(/,/g, '');                       // en-US: 1,234.56
    }
  } else if (hasComma) {
    s = s.replace(',', '.');                          // 1234,56
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ── Date parsing: many formats → YYYY-MM-DD ──────────────────────────────────
export function parseDate(input: string): string | null {
  if (!input) return null;
  const s = input.trim().split(/[ T]/)[0]; // drop time portion

  // ISO already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD-MM-YYYY (pt-BR default)
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yy] = m;
    if (yy.length === 2) yy = '20' + yy;
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // YYYY/MM/DD
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (m) {
    const [, yy, mm, dd] = m;
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function platformFromValue(value: string): EarningPlatform | null {
  const v = value.toLowerCase();
  if (v.includes('uber')) return EarningPlatform.UBER;
  if (v.includes('bolt')) return EarningPlatform.BOLT;
  if (v.includes('free') || v.includes('freenow') || v.includes('free now')) return EarningPlatform.FREE_NOW;
  return null;
}

/**
 * Parse a CSV string into normalized earning rows.
 * @param csv         file contents (UTF-8)
 * @param fallback    platform to use when the file has no platform column
 */
export function parseEarningsCsv(csv: string, fallback?: EarningPlatform): ParseResult {
  const errors: ParseResult['errors'] = [];
  const rows: ParsedEarningRow[] = [];

  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) {
    return { rows, errors: [{ line: 0, reason: 'Ficheiro vazio ou sem linhas de dados.' }], detectedPlatform: null, totalAmount: 0 };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);

  const amountIdx = findHeaderIndex(headers, AMOUNT_HEADERS);
  const dateIdx = findHeaderIndex(headers, DATE_HEADERS);
  const platformIdx = findHeaderIndex(headers, PLATFORM_HEADERS);

  if (amountIdx === -1) errors.push({ line: 1, reason: 'Coluna de valor não encontrada (ex.: "valor", "amount", "total").' });
  if (dateIdx === -1) errors.push({ line: 1, reason: 'Coluna de data não encontrada (ex.: "data", "date").' });
  if (amountIdx === -1 || dateIdx === -1) {
    return { rows, errors, detectedPlatform: null, totalAmount: 0 };
  }

  let detectedPlatform: EarningPlatform | null = fallback ?? null;
  let total = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delimiter);
    const lineNo = i + 1;

    const amount = parseAmount(cols[amountIdx] ?? '');
    const date = parseDate(cols[dateIdx] ?? '');

    if (amount === null) { errors.push({ line: lineNo, reason: `Valor inválido: "${cols[amountIdx] ?? ''}"` }); continue; }
    if (amount <= 0) { continue; } // skip zero/negative (refunds, headers repeated) silently
    if (date === null) { errors.push({ line: lineNo, reason: `Data inválida: "${cols[dateIdx] ?? ''}"` }); continue; }

    let platform: EarningPlatform | null = null;
    if (platformIdx !== -1) platform = platformFromValue(cols[platformIdx] ?? '');
    if (!platform) platform = fallback ?? null;
    if (!platform) { errors.push({ line: lineNo, reason: 'Plataforma não identificada. Selecione a plataforma do ficheiro.' }); continue; }

    if (!detectedPlatform) detectedPlatform = platform;

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = cols[idx] ?? ''; });

    rows.push({ amount, date, platform, raw });
    total += amount;
  }

  return { rows, errors, detectedPlatform, totalAmount: Math.round(total * 100) / 100 };
}
