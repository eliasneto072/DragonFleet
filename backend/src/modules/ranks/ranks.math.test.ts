// src/modules/ranks/ranks.math.test.ts

import { describe, it, expect } from 'vitest';
import {
  earnedTier, effectiveTier, floorActive, floorUntilFor, hasGoals, maxTier, meets,
  nextReachable, previousSeason, progressTo, seasonOf, tierIndex,
  type DriverMetrics, type TierRequirements,
} from './ranks.math';

const req = (tier: TierRequirements['tier'], o: Partial<TierRequirements> = {}): TierRequirements => ({
  tier,
  minSeasonRevenue: 0,
  minInvested: 0,
  minBalance: 0,
  minWeeks: 0,
  requireValidDocuments: false,
  ...o,
});

const metrics = (o: Partial<DriverMetrics> = {}): DriverMetrics => ({
  seasonRevenue: 0, invested: 0, balance: 0, weeks: 0, documentsOk: true, ...o,
});

// As metas dos testes: 5000/10000/20000/40000 de faturação.
const ESCADA = [
  req('TIER_1'),
  req('TIER_2', { minSeasonRevenue: 5000 }),
  req('TIER_3', { minSeasonRevenue: 10000 }),
  req('TIER_4', { minSeasonRevenue: 20000 }),
  req('TIER_5', { minSeasonRevenue: 40000 }),
];

describe('temporadas de dois meses', () => {
  it('janeiro e fevereiro são a mesma temporada', () => {
    expect(seasonOf('2026-01-01')).toEqual({ start: '2026-01-01', end: '2026-02-28' });
    expect(seasonOf('2026-02-28')).toEqual({ start: '2026-01-01', end: '2026-02-28' });
  });

  it('conta com os anos bissextos', () => {
    expect(seasonOf('2028-02-10').end).toBe('2028-02-29');
  });

  it('as seis temporadas do ano', () => {
    const inicios = ['2026-01-15', '2026-03-15', '2026-05-15', '2026-07-15', '2026-09-15', '2026-11-15']
      .map((d) => seasonOf(d).start);
    expect(inicios).toEqual([
      '2026-01-01', '2026-03-01', '2026-05-01', '2026-07-01', '2026-09-01', '2026-11-01',
    ]);
  });

  it('a temporada anterior a janeiro é novembro–dezembro do ano passado', () => {
    expect(previousSeason(seasonOf('2026-01-10'))).toEqual({ start: '2025-11-01', end: '2025-12-31' });
  });

  it('a proteção vale 30 dias depois do fim da temporada', () => {
    expect(floorUntilFor(seasonOf('2026-02-10'))).toBe('2026-03-30');
  });
});

describe('metas', () => {
  it('uma meta a zero não conta', () => {
    expect(meets(metrics(), req('TIER_3'))).toBe(true);
  });

  it('exige TODAS as metas definidas', () => {
    const r = req('TIER_3', { minSeasonRevenue: 10000, minInvested: 2000 });
    expect(meets(metrics({ seasonRevenue: 12000, invested: 1000 }), r)).toBe(false);
    expect(meets(metrics({ seasonRevenue: 12000, invested: 2000 }), r)).toBe(true);
  });

  it('documentos expirados travam a subida quando o nível o exige', () => {
    const r = req('TIER_4', { minSeasonRevenue: 100, requireValidDocuments: true });
    expect(meets(metrics({ seasonRevenue: 999, documentsOk: false }), r)).toBe(false);
    expect(meets(metrics({ seasonRevenue: 999, documentsOk: true }), r)).toBe(true);
  });

  it('o valor exato da meta já conta', () => {
    expect(meets(metrics({ seasonRevenue: 5000 }), req('TIER_2', { minSeasonRevenue: 5000 }))).toBe(true);
  });
});

describe('earnedTier', () => {
  it('quem não cumpre nada fica no primeiro nível', () => {
    expect(earnedTier(metrics(), ESCADA)).toBe('TIER_1');
  });

  it('sobe conforme a faturação', () => {
    expect(earnedTier(metrics({ seasonRevenue: 5000 }), ESCADA)).toBe('TIER_2');
    expect(earnedTier(metrics({ seasonRevenue: 19999 }), ESCADA)).toBe('TIER_3');
    expect(earnedTier(metrics({ seasonRevenue: 100000 }), ESCADA)).toBe('TIER_5');
  });

  it('uma meta intermédia impossível não prende quem cumpre a de cima', () => {
    // O nível 3 pede 50 semanas (impossível numa temporada); o 4 pede só
    // faturação. Quem factura muito fica no 4.
    const escada = [
      req('TIER_1'),
      req('TIER_2', { minSeasonRevenue: 5000 }),
      req('TIER_3', { minWeeks: 50 }),
      req('TIER_4', { minSeasonRevenue: 20000 }),
      req('TIER_5', { minSeasonRevenue: 40000 }),
    ];
    expect(earnedTier(metrics({ seasonRevenue: 25000, weeks: 8 }), escada)).toBe('TIER_4');
  });

  it('documentos expirados fazem descer ao nível que não os exige', () => {
    const escada = [
      req('TIER_1'),
      req('TIER_2', { minSeasonRevenue: 5000 }),
      req('TIER_3', { minSeasonRevenue: 10000, requireValidDocuments: true }),
    ];
    expect(earnedTier(metrics({ seasonRevenue: 50000, documentsOk: false }), escada)).toBe('TIER_2');
  });
});

describe('a proteção de 30 dias', () => {
  const base = { earned: 'TIER_2' as const, floorTier: 'TIER_4' as const, floorUntil: '2026-03-30' };

  it('segura o rank em baixo enquanto dura', () => {
    expect(effectiveTier({ ...base, today: '2026-03-01' })).toBe('TIER_4');
    expect(effectiveTier({ ...base, today: '2026-03-30' })).toBe('TIER_4');
  });

  it('deixa de valer no dia seguinte', () => {
    expect(effectiveTier({ ...base, today: '2026-03-31' })).toBe('TIER_2');
  });

  it('não trava a subida: quem conquista mais, sobe logo', () => {
    expect(effectiveTier({ ...base, earned: 'TIER_5', today: '2026-03-10' })).toBe('TIER_5');
  });

  it('sem proteção, vale o que foi conquistado', () => {
    expect(effectiveTier({ earned: 'TIER_3', floorTier: null, floorUntil: null, today: '2026-05-05' }))
      .toBe('TIER_3');
  });

  it('floorActive acompanha a data', () => {
    expect(floorActive('2026-03-30', '2026-03-30')).toBe(true);
    expect(floorActive('2026-03-30', '2026-03-31')).toBe(false);
    expect(floorActive(null, '2026-03-31')).toBe(false);
  });

  it('dentro da temporada a descida é imediata — a proteção é só depois do fim', () => {
    // Sem floor (estamos a meio da temporada): desce de TIER_5 para TIER_2 no
    // momento em que deixa de cumprir.
    expect(earnedTier(metrics({ seasonRevenue: 6000 }), ESCADA)).toBe('TIER_2');
  });
});

describe('progresso', () => {
  it('diz quanto falta de cada meta', () => {
    const p = progressTo(
      metrics({ seasonRevenue: 8000, invested: 500 }),
      req('TIER_3', { minSeasonRevenue: 10000, minInvested: 2000 }),
    );
    expect(p.missing.seasonRevenue).toBe(2000);
    expect(p.missing.invested).toBe(1500);
  });

  it('a barra mostra a meta mais atrasada, não a média', () => {
    const p = progressTo(
      metrics({ seasonRevenue: 9500, invested: 200 }),
      req('TIER_3', { minSeasonRevenue: 10000, minInvested: 2000 }),
    );
    expect(p.ratio).toBeCloseTo(0.1, 3);
  });

  it('cumprido dá barra cheia e nada em falta', () => {
    const p = progressTo(metrics({ seasonRevenue: 20000 }), req('TIER_2', { minSeasonRevenue: 5000 }));
    expect(p.ratio).toBe(1);
    expect(p.missing.seasonRevenue).toBe(0);
  });
});

describe('utilitários', () => {
  it('a ordem dos níveis', () => {
    expect(tierIndex('TIER_1')).toBe(1);
    expect(tierIndex('TIER_5')).toBe(5);
    expect(maxTier('TIER_2', 'TIER_4')).toBe('TIER_4');
  });
});

describe('niveis por configurar', () => {
  // ─── O CASO QUE NENHUM TESTE COBRIA ──────────────────────────────────────
  //
  // Todos os testes do earnedTier usavam a ESCADA, onde cada nivel de 2 a 5 tem
  // meta. Nenhum tinha os niveis a zero — que e exatamente o estado no dia do
  // deploy, porque "nasce tudo a zero de proposito". Com o codigo anterior,
  // nesse dia TODOS os motoristas subiam direto ao nivel 5.
  const tudoAZero = [req('TIER_1'), req('TIER_2'), req('TIER_3'), req('TIER_4'), req('TIER_5')];

  it('no dia do deploy, com tudo a zero, ninguem sobe', () => {
    expect(earnedTier(metrics(), tudoAZero)).toBe('TIER_1');
  });

  it('nem quem factura muito sobe para um nivel por configurar', () => {
    expect(earnedTier(metrics({ seasonRevenue: 1_000_000, invested: 50_000 }), tudoAZero))
      .toBe('TIER_1');
  });

  it('configurando so o nivel 2, os de cima continuam fechados', () => {
    // O administrador configura um de cada vez. Com o codigo anterior, deixar o
    // 5 por configurar mantinha toda a gente no 5.
    const soODois = [req('TIER_1'), req('TIER_2', { minSeasonRevenue: 5000 }), req('TIER_3'), req('TIER_4'), req('TIER_5')];
    expect(earnedTier(metrics({ seasonRevenue: 100_000 }), soODois)).toBe('TIER_2');
  });

  it('um nivel so com o travao dos documentos continua por configurar', () => {
    // O requireValidDocuments impede subir; nao e algo que se cumpra para subir.
    const soDocs = [req('TIER_1'), req('TIER_2', { requireValidDocuments: true })];
    expect(earnedTier(metrics({ documentsOk: true }), soDocs)).toBe('TIER_1');
  });

  it('hasGoals distingue configurado de por configurar', () => {
    expect(hasGoals(req('TIER_3'))).toBe(false);
    expect(hasGoals(req('TIER_3', { requireValidDocuments: true }))).toBe(false);
    expect(hasGoals(req('TIER_3', { minWeeks: 1 }))).toBe(true);
  });
});

describe('o proximo nivel da barra de progresso', () => {
  it('salta os niveis por configurar', () => {
    // Sem isto, um nivel sem metas dava barra cheia e "nada em falta" num nivel
    // onde o motorista nunca ia subir.
    const buraco = [req('TIER_1'), req('TIER_2'), req('TIER_3', { minSeasonRevenue: 10_000 })];
    expect(nextReachable('TIER_1', buraco)?.tier).toBe('TIER_3');
  });

  it('sem nenhum configurado acima, e como estar no topo', () => {
    const nada = [req('TIER_1'), req('TIER_2'), req('TIER_3')];
    expect(nextReachable('TIER_1', nada)).toBeUndefined();
  });

  it('com a escada completa, e simplesmente o seguinte', () => {
    expect(nextReachable('TIER_2', ESCADA)?.tier).toBe('TIER_3');
  });

  it('no topo nao ha seguinte', () => {
    expect(nextReachable('TIER_5', ESCADA)).toBeUndefined();
  });
});
