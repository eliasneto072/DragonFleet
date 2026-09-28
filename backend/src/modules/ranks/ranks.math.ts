// src/modules/ranks/ranks.math.ts
//
// As regras dos ranks, sem base de dados: temporadas, metas e proteção.
//
// ─── TEMPORADAS ─────────────────────────────────────────────────────────────
//
// Dois meses do calendário: janeiro–fevereiro, março–abril, maio–junho,
// julho–agosto, setembro–outubro, novembro–dezembro. Ficam presas ao
// calendário de propósito: "a temporada acaba a 28 de fevereiro" é uma frase
// que toda a gente percebe, e dois motoristas que entrem em meses diferentes
// competem no mesmo período.
//
// ─── SUBIR E DESCER ─────────────────────────────────────────────────────────
//
// Dentro da temporada o rank segue as metas em tempo real, nos dois sentidos:
// atinge o Dragon Master e tem os benefícios do Dragon Master nesse momento;
// deixa de cumprir e desce, com os benefícios a acompanhar.
//
// ─── A PROTEÇÃO DE 30 DIAS ──────────────────────────────────────────────────
//
// No fim da temporada, o rank alcançado passa a MÍNIMO GARANTIDO durante 30
// dias. A temporada nova começa do zero — a faturação recomeça a contar — e
// sem esta regra toda a gente caía a 1 de março. Com ela, ninguém desce
// durante esse mês, e quem subir sobe na mesma: a proteção é só para baixo.

import { addDays, assertDay, type Day } from '../investments/investments.math';

export { addDays, dateToDay, dayToDate, lisbonDay, type Day } from '../investments/investments.math';

export const TIERS = ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5'] as const;
export type Tier = (typeof TIERS)[number];

/** Posição do nível: 1 é o mais baixo, 5 o mais alto. */
export function tierIndex(t: Tier): number {
  return TIERS.indexOf(t) + 1;
}

/** O mais alto de dois níveis. */
export function maxTier(a: Tier, b: Tier): Tier {
  return tierIndex(a) >= tierIndex(b) ? a : b;
}

// ─── Temporadas ─────────────────────────────────────────────────────────────

export interface Season {
  /** Primeiro dia, inclusive. */
  start: Day;
  /** Último dia, inclusive. */
  end: Day;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Último dia do mês (1-12) de um ano. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** A temporada a que um dia pertence. */
export function seasonOf(day: Day): Season {
  assertDay(day);
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  // Meses 1-2 → começa em 1; 3-4 → 3; e assim por diante.
  const startMonth = month - ((month - 1) % 2);
  const endMonth = startMonth + 1;
  return {
    start: `${year}-${pad(startMonth)}-01`,
    end: `${year}-${pad(endMonth)}-${pad(lastDayOfMonth(year, endMonth))}`,
  };
}

/** A temporada anterior a uma dada. */
export function previousSeason(s: Season): Season {
  return seasonOf(addDays(s.start, -1));
}

/** Até quando vale a proteção do rank conquistado numa temporada. */
export function floorUntilFor(season: Season): Day {
  return addDays(season.end, 30);
}

// ─── As metas ───────────────────────────────────────────────────────────────

export interface TierRequirements {
  tier: Tier;
  minSeasonRevenue: number;
  minInvested: number;
  minBalance: number;
  minWeeks: number;
  requireValidDocuments: boolean;
}

export interface DriverMetrics {
  seasonRevenue: number;
  invested: number;
  balance: number;
  weeks: number;
  documentsOk: boolean;
}

/**
 * Cumpre TODAS as metas definidas para este nível?
 *
 * Uma meta a zero não conta — é assim que o painel desliga um critério sem
 * precisar de um interruptor por critério. E é por isso que o nível 1 é sempre
 * cumprido enquanto ninguém lhe puser metas: é o ponto de partida de toda a
 * gente.
 */
export function meets(m: DriverMetrics, r: TierRequirements): boolean {
  if (r.requireValidDocuments && !m.documentsOk) return false;
  if (r.minSeasonRevenue > 0 && m.seasonRevenue < r.minSeasonRevenue) return false;
  if (r.minInvested > 0 && m.invested < r.minInvested) return false;
  if (r.minBalance > 0 && m.balance < r.minBalance) return false;
  if (r.minWeeks > 0 && m.weeks < r.minWeeks) return false;
  return true;
}

/**
 * Este nível tem alguma meta configurada?
 *
 * ─── PORQUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * O `meets` responde "as metas DEFINIDAS estão cumpridas?", e para um nível
 * sem metas nenhumas a resposta honesta é "sim" — não há nada por cumprir.
 * Isso está certo para o `meets` e o teste unitário dele afirma-o.
 *
 * O erro era o `earnedTier` tomar essa resposta como "este nível está ganho".
 * Um nível sem metas não é um nível GRATUITO: é um nível POR CONFIGURAR. Como
 * tudo "nasce a zero de propósito", no dia do deploy todos os motoristas subiam
 * direto ao nível 5 — o contrário exato do que a decisão pretendia. E como o
 * administrador configura os níveis um de cada vez, bastava deixar o 5 por
 * configurar para toda a gente continuar lá.
 *
 * O `requireValidDocuments` NÃO conta como meta. É um travão — impede a subida
 * de quem tem documentos expirados — e não algo que se cumpra para subir. Um
 * nível só com esse travão continua por configurar.
 */
export function hasGoals(r: TierRequirements): boolean {
  return r.minSeasonRevenue > 0
      || r.minInvested > 0
      || r.minBalance > 0
      || r.minWeeks > 0;
}

/**
 * O nível mais alto cujas metas estão cumpridas.
 *
 * Percorre de cima para baixo e pára no primeiro que passa — não exige que os
 * níveis de baixo também passem. Isso importa: se o nível 3 pedir 10 semanas e
 * o nível 4 pedir só faturação, quem cumpre o 4 fica no 4, e não preso no 2 por
 * causa de uma meta intermédia. Cabe a quem define as metas mantê-las
 * crescentes; o painel avisa quando não estão.
 *
 * O nível 1 é o chão: quem não cumpre nada fica nele.
 */
export function earnedTier(m: DriverMetrics, reqs: TierRequirements[]): Tier {
  const ordenados = [...reqs].sort((a, b) => tierIndex(b.tier) - tierIndex(a.tier));
  for (const r of ordenados) {
    if (tierIndex(r.tier) === 1) continue;
    // Por configurar não é ganho. Ver `hasGoals`.
    if (!hasGoals(r)) continue;
    if (meets(m, r)) return r.tier;
  }
  return 'TIER_1';
}

/**
 * O rank que vale hoje: o conquistado, ou o garantido se ainda estiver dentro
 * dos 30 dias e for mais alto.
 */
export function effectiveTier(args: {
  earned: Tier;
  floorTier: Tier | null;
  floorUntil: Day | null;
  today: Day;
}): Tier {
  if (args.floorTier && args.floorUntil && args.today <= args.floorUntil) {
    return maxTier(args.earned, args.floorTier);
  }
  return args.earned;
}

/** A proteção ainda está a valer? */
export function floorActive(floorUntil: Day | null, today: Day): boolean {
  return !!floorUntil && today <= floorUntil;
}

// ─── O que falta para o próximo ─────────────────────────────────────────────

export interface Progress {
  /** Quanto falta de cada meta; zero quando já está cumprida ou não conta. */
  missing: {
    seasonRevenue: number;
    invested: number;
    balance: number;
    weeks: number;
    documents: boolean;
  };
  /** 0 a 1: a meta menos cumprida, que é a que trava a subida. */
  ratio: number;
}

/**
 * O próximo nível que se pode de facto alcançar acima de `atual`.
 *
 * Não é simplesmente o seguinte: um nível por configurar mostraria uma barra
 * cheia — `progressTo` devolve 1 quando não há metas — e o motorista veria
 * "nada em falta" num nível onde nunca vai subir. Salta os que não têm metas e
 * devolve o primeiro que tem; se nenhum acima tiver, é como estar no topo.
 */
export function nextReachable<T extends TierRequirements>(
  atual: Tier,
  configs: T[],
): T | undefined {
  return [...configs]
    .filter((c) => tierIndex(c.tier) > tierIndex(atual) && hasGoals(c))
    .sort((a, b) => tierIndex(a.tier) - tierIndex(b.tier))[0];
}

/** Quanto falta a um motorista para chegar a um nível. */
export function progressTo(m: DriverMetrics, r: TierRequirements): Progress {
  const partes: number[] = [];
  const falta = (atual: number, meta: number) => {
    if (meta <= 0) return 0;
    partes.push(Math.min(1, Math.max(0, atual) / meta));
    return Math.max(0, Math.round((meta - atual) * 100) / 100);
  };

  const missing = {
    seasonRevenue: falta(m.seasonRevenue, r.minSeasonRevenue),
    invested: falta(m.invested, r.minInvested),
    balance: falta(m.balance, r.minBalance),
    weeks: r.minWeeks > 0 ? Math.max(0, r.minWeeks - m.weeks) : 0,
    documents: r.requireValidDocuments && !m.documentsOk,
  };
  if (r.minWeeks > 0) partes.push(Math.min(1, m.weeks / r.minWeeks));

  return {
    missing,
    // A barra mostra a meta mais atrasada, e não a média: uma média de 90% com
    // uma meta a 20% dizia ao motorista que estava quase, e não estava.
    ratio: partes.length ? Math.min(...partes) : 1,
  };
}
