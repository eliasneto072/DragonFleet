// src/modules/investments/investments.math.test.ts
//
// As contas dos investimentos, com números feitos à mão. Se um destes falhar,
// alguém está a receber o valor errado.

import { describe, it, expect } from 'vitest';
import {
  accrualEnd, addDays, computePayout, dailyGain, daysBetween, lisbonDay,
  pendingAccruals, rateOn, round2,
} from './investments.math';

describe('dailyGain — juros simples', () => {
  it('1000 € a 3,65% rendem 0,10 € por dia', () => {
    expect(dailyGain(1000, 3.65)).toBe(0.1);
  });

  it('guarda seis casas e não arredonda ao cêntimo', () => {
    // 1000 × 2% ÷ 365 = 0,05479452…
    expect(dailyGain(1000, 2)).toBe(0.054795);
  });

  it('um ano de dias a 2% dá 2% (a menos do arredondamento de cada dia)', () => {
    const ano = dailyGain(1000, 2) * 365;
    expect(round2(ano)).toBe(20);
  });

  it('taxa zero rende zero', () => {
    expect(dailyGain(5000, 0)).toBe(0);
  });
});

describe('lisbonDay — o dia é o de Portugal, não o de UTC', () => {
  it('00:30 em Lisboa no verão ainda é 23:30 UTC do dia anterior', () => {
    // 2026-07-15T23:30Z = 2026-07-16 00:30 em Lisboa (UTC+1)
    expect(lisbonDay(new Date('2026-07-15T23:30:00Z'))).toBe('2026-07-16');
  });

  it('no inverno Lisboa coincide com UTC', () => {
    expect(lisbonDay(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-15');
  });
});

describe('addDays / daysBetween', () => {
  it('atravessa o fim do mês e do ano', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('atravessa a mudança de hora sem perder nem ganhar dias', () => {
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('nunca é negativo', () => {
    expect(daysBetween('2026-05-10', '2026-05-01')).toBe(0);
  });
});

describe('rateOn — a taxa de cada dia nos flexíveis', () => {
  const hist = [
    { effectiveFrom: '2026-09-01', annualRate: 2 },
    { effectiveFrom: '2026-09-10', annualRate: 3 },
    { effectiveFrom: '2026-09-20', annualRate: 1.5 },
  ];

  it('usa a última taxa com início até ao dia', () => {
    expect(rateOn(hist, '2026-09-05')).toBe(2);
    expect(rateOn(hist, '2026-09-10')).toBe(3);
    expect(rateOn(hist, '2026-09-19')).toBe(3);
    expect(rateOn(hist, '2026-09-25')).toBe(1.5);
  });

  it('não depende da ordem em que o histórico chega', () => {
    expect(rateOn([...hist].reverse(), '2026-09-15')).toBe(3);
  });
});

describe('pendingAccruals — que dias faltam pagar', () => {
  it('aplicar e resgatar no mesmo dia não rende nada', () => {
    const dias = pendingAccruals({
      principal: 1000, startDate: '2026-09-22', accruedThrough: null,
      untilExclusive: '2026-09-22', rateForDay: () => 2,
    });
    expect(dias).toEqual([]);
  });

  it('aplicado hoje, amanhã já rendeu o dia de hoje', () => {
    const dias = pendingAccruals({
      principal: 1000, startDate: '2026-09-22', accruedThrough: null,
      untilExclusive: '2026-09-23', rateForDay: () => 3.65,
    });
    expect(dias).toEqual([{ day: '2026-09-22', annualRate: 3.65, amount: 0.1 }]);
  });

  it('continua a partir do último dia pago, sem repetir', () => {
    const dias = pendingAccruals({
      principal: 1000, startDate: '2026-09-01', accruedThrough: '2026-09-20',
      untilExclusive: '2026-09-23', rateForDay: () => 2,
    });
    expect(dias.map((d) => d.day)).toEqual(['2026-09-21', '2026-09-22']);
  });

  it('se já está tudo pago, não devolve nada — correr o job duas vezes é inofensivo', () => {
    const dias = pendingAccruals({
      principal: 1000, startDate: '2026-09-01', accruedThrough: '2026-09-22',
      untilExclusive: '2026-09-23', rateForDay: () => 2,
    });
    expect(dias).toEqual([]);
  });

  it('nos flexíveis cada dia usa a taxa que estava em vigor nesse dia', () => {
    const hist = [
      { effectiveFrom: '2026-09-01', annualRate: 3.65 },
      { effectiveFrom: '2026-09-03', annualRate: 7.3 },
    ];
    const dias = pendingAccruals({
      principal: 1000, startDate: '2026-09-01', accruedThrough: null,
      untilExclusive: '2026-09-05', rateForDay: (d) => rateOn(hist, d),
    });
    expect(dias.map((d) => d.amount)).toEqual([0.1, 0.1, 0.2, 0.2]);
  });

  it('o servidor parado três dias recupera os três de uma vez', () => {
    const dias = pendingAccruals({
      principal: 1000, startDate: '2026-09-01', accruedThrough: '2026-09-18',
      untilExclusive: '2026-09-22', rateForDay: () => 2,
    });
    expect(dias).toHaveLength(3);
  });
});

describe('accrualEnd — os fixos não rendem depois do vencimento', () => {
  it('flexível rende até ontem', () => {
    expect(accrualEnd('2026-09-22', null)).toBe('2026-09-22');
  });

  it('fixo ainda no prazo rende até ontem', () => {
    expect(accrualEnd('2026-09-22', '2026-12-01')).toBe('2026-09-22');
  });

  it('fixo vencido pára no vencimento, mesmo que o job se atrase', () => {
    expect(accrualEnd('2026-09-25', '2026-09-20')).toBe('2026-09-20');
  });

  it('um fixo de 30 dias paga exatamente 30 dias', () => {
    const start = '2026-09-01';
    const maturity = addDays(start, 30);
    const dias = pendingAccruals({
      principal: 1000, startDate: start, accruedThrough: null,
      untilExclusive: accrualEnd('2026-12-31', maturity), rateForDay: () => 2,
    });
    expect(dias).toHaveLength(30);
  });
});

describe('computePayout — quanto volta ao saldo', () => {
  it('flexível: principal mais ganhos, sem penalização', () => {
    const r = computePayout({
      planType: 'FLEXIBLE', principal: 1000, accrued: 12.345678,
      penaltyRatePct: null, maturityDate: null, today: '2026-09-22',
    });
    expect(r).toEqual({ reason: 'WITHDRAWN', principal: 1000, gains: 12.35, penalty: 0, payout: 1012.35 });
  });

  it('fixo vencido: sem penalização', () => {
    const r = computePayout({
      planType: 'FIXED', principal: 1000, accrued: 16.44,
      penaltyRatePct: 5, maturityDate: '2026-09-22', today: '2026-09-22',
    });
    expect(r.reason).toBe('MATURED');
    expect(r.penalty).toBe(0);
    expect(r.payout).toBe(1016.44);
  });

  it('fixo antecipado: penalização sobre o valor aplicado', () => {
    const r = computePayout({
      planType: 'FIXED', principal: 1000, accrued: 8.2,
      penaltyRatePct: 2, maturityDate: '2026-12-01', today: '2026-09-22',
    });
    expect(r).toEqual({ reason: 'EARLY', principal: 1000, gains: 8.2, penalty: 20, payout: 988.2 });
  });

  it('fixo antecipado sem penalização definida devolve tudo', () => {
    const r = computePayout({
      planType: 'FIXED', principal: 500, accrued: 1,
      penaltyRatePct: null, maturityDate: '2026-12-01', today: '2026-09-22',
    });
    expect(r.payout).toBe(501);
  });

  it('arredonda os ganhos uma vez, no fim', () => {
    // 365 dias de 0,054795 = 19,999675 → 20,00
    const r = computePayout({
      planType: 'FLEXIBLE', principal: 1000, accrued: 0.054795 * 365,
      penaltyRatePct: null, maturityDate: null, today: '2026-09-22',
    });
    expect(r.gains).toBe(20);
  });
});
