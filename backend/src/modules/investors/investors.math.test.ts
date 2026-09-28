// src/modules/investors/investors.math.test.ts
//
// Números feitos à mão. Isto é dinheiro de gente de fora da empresa: se um
// destes falhar, alguém recebe menos do que lhe foi prometido — ou mais, que é
// igualmente mau.

import { describe, it, expect } from 'vitest';
import {
  capitalOn,
  checkWithdrawal,
  pendingInvestorAccruals,
  projectEarnings,
  withdrawalAvailableOn,
} from './investors.math';

const taxa5 = [{ effectiveFrom: '2026-01-01', annualRate: 5 }];

describe('capitalOn — o capital de um dia', () => {
  const moves = [
    { day: '2026-01-10', amount: 5000 },
    { day: '2026-03-01', amount: 3000 },
    { day: '2026-05-20', amount: -1000 },
  ];

  it('zero antes do primeiro depósito', () => {
    expect(capitalOn(moves, '2026-01-09')).toBe(0);
  });

  it('conta o próprio dia do depósito', () => {
    expect(capitalOn(moves, '2026-01-10')).toBe(5000);
  });

  it('soma os depósitos seguintes', () => {
    expect(capitalOn(moves, '2026-03-01')).toBe(8000);
  });

  it('desconta os resgates', () => {
    expect(capitalOn(moves, '2026-06-01')).toBe(7000);
  });

  it('nunca desce abaixo de zero', () => {
    expect(capitalOn([{ day: '2026-01-01', amount: -50 }], '2026-02-01')).toBe(0);
  });
});

describe('pendingInvestorAccruals — os dias por pagar', () => {
  it('paga do dia do início até ontem, exclusive o dia de hoje', () => {
    const dias = pendingInvestorAccruals({
      startDate: '2026-01-10',
      accruedThrough: null,
      untilExclusive: '2026-01-13',
      capitalMoves: [{ day: '2026-01-10', amount: 1000 }],
      rates: taxa5,
    });
    expect(dias.map((d) => d.day)).toEqual(['2026-01-10', '2026-01-11', '2026-01-12']);
  });

  it('recomeça no dia a seguir ao último pago', () => {
    const dias = pendingInvestorAccruals({
      startDate: '2026-01-10',
      accruedThrough: '2026-01-11',
      untilExclusive: '2026-01-13',
      capitalMoves: [{ day: '2026-01-10', amount: 1000 }],
      rates: taxa5,
    });
    expect(dias.map((d) => d.day)).toEqual(['2026-01-12']);
  });

  it('não devolve nada quando já está tudo pago', () => {
    expect(
      pendingInvestorAccruals({
        startDate: '2026-01-10',
        accruedThrough: '2026-01-12',
        untilExclusive: '2026-01-13',
        capitalMoves: [{ day: '2026-01-10', amount: 1000 }],
        rates: taxa5,
      }),
    ).toEqual([]);
  });

  it('1000 € a 5% rendem 0,136986 € por dia', () => {
    const [dia] = pendingInvestorAccruals({
      startDate: '2026-01-10',
      accruedThrough: null,
      untilExclusive: '2026-01-11',
      capitalMoves: [{ day: '2026-01-10', amount: 1000 }],
      rates: taxa5,
    });
    // 1000 × 5 ÷ 100 ÷ 365 = 0,13698630…
    expect(dia.amount).toBe(0.136986);
    expect(dia.capital).toBe(1000);
  });

  it('um reforço a meio muda o juro a partir do próprio dia', () => {
    const dias = pendingInvestorAccruals({
      startDate: '2026-01-10',
      accruedThrough: null,
      untilExclusive: '2026-01-13',
      capitalMoves: [
        { day: '2026-01-10', amount: 1000 },
        { day: '2026-01-12', amount: 1000 },
      ],
      rates: taxa5,
    });
    expect(dias.map((d) => d.capital)).toEqual([1000, 1000, 2000]);
    expect(dias[2].amount).toBe(0.273973);
  });

  it('um resgate a meio baixa o juro a partir do próprio dia', () => {
    const dias = pendingInvestorAccruals({
      startDate: '2026-01-10',
      accruedThrough: null,
      untilExclusive: '2026-01-12',
      capitalMoves: [
        { day: '2026-01-10', amount: 2000 },
        { day: '2026-01-11', amount: -1000 },
      ],
      rates: taxa5,
    });
    expect(dias.map((d) => d.capital)).toEqual([2000, 1000]);
  });

  it('usa a taxa em vigor em cada dia, não a de hoje', () => {
    const dias = pendingInvestorAccruals({
      startDate: '2026-01-10',
      accruedThrough: null,
      untilExclusive: '2026-01-13',
      capitalMoves: [{ day: '2026-01-10', amount: 1000 }],
      rates: [
        { effectiveFrom: '2026-01-01', annualRate: 5 },
        { effectiveFrom: '2026-01-12', annualRate: 10 },
      ],
    });
    expect(dias.map((d) => d.annualRate)).toEqual([5, 5, 10]);
  });

  it('dias sem capital rendem zero mas contam como pagos', () => {
    const dias = pendingInvestorAccruals({
      startDate: '2026-01-01',
      accruedThrough: null,
      untilExclusive: '2026-01-04',
      capitalMoves: [{ day: '2026-01-03', amount: 1000 }],
      rates: taxa5,
    });
    expect(dias.map((d) => d.amount)).toEqual([0, 0, 0.136986]);
  });

  it('um ano inteiro a 5% dá os 5%', () => {
    const dias = pendingInvestorAccruals({
      startDate: '2026-01-01',
      accruedThrough: null,
      untilExclusive: '2027-01-01',
      capitalMoves: [{ day: '2026-01-01', amount: 10000 }],
      rates: taxa5,
    });
    expect(dias).toHaveLength(365);
    const total = dias.reduce((s, d) => s + d.amount, 0);
    expect(Math.round(total * 100) / 100).toBe(500);
  });
});

describe('withdrawalAvailableOn — o aviso prévio', () => {
  it('o rendimento é sempre imediato', () => {
    expect(withdrawalAvailableOn({ today: '2026-05-10', bucket: 'EARNINGS', noticeDays: 30 }))
      .toBe('2026-05-10');
  });

  it('o capital cumpre o aviso da conta', () => {
    expect(withdrawalAvailableOn({ today: '2026-05-10', bucket: 'CAPITAL', noticeDays: 30 }))
      .toBe('2026-06-09');
  });

  it('sem aviso configurado, o capital também é imediato', () => {
    expect(withdrawalAvailableOn({ today: '2026-05-10', bucket: 'CAPITAL', noticeDays: 0 }))
      .toBe('2026-05-10');
  });
});

describe('checkWithdrawal — o que pode sair', () => {
  it('aceita o que cabe no disponível', () => {
    expect(checkWithdrawal({ amount: 100, available: 250 })).toEqual({ ok: true });
  });

  it('aceita o saldo exato', () => {
    expect(checkWithdrawal({ amount: 250.5, available: 250.5 })).toEqual({ ok: true });
  });

  it('recusa acima do disponível', () => {
    expect(checkWithdrawal({ amount: 300, available: 250 }))
      .toEqual({ ok: false, reason: 'INSUFFICIENT' });
  });

  it('recusa zero e negativos', () => {
    expect(checkWithdrawal({ amount: 0, available: 250 }))
      .toEqual({ ok: false, reason: 'NOT_POSITIVE' });
    expect(checkWithdrawal({ amount: -10, available: 250 }))
      .toEqual({ ok: false, reason: 'NOT_POSITIVE' });
  });

  it('não tropeça na vírgula flutuante', () => {
    // 0,1 + 0,2 = 0,30000000000000004 em JavaScript. Um pedido de 0,30 € com
    // 0,30 € disponível tem de passar.
    expect(checkWithdrawal({ amount: 0.1 + 0.2, available: 0.3 })).toEqual({ ok: true });
  });
});

describe('projectEarnings — a projeção do portal', () => {
  it('10 000 € a 5% rendem cerca de 41,10 € em 30 dias', () => {
    expect(projectEarnings(10000, 5, 30)).toBe(41.1);
  });

  it('zero dias rendem zero', () => {
    expect(projectEarnings(10000, 5, 0)).toBe(0);
  });
});
