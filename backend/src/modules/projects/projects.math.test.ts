// src/modules/projects/projects.math.test.ts
//
// Números feitos à mão. O teste que mais importa deste ficheiro é o da soma
// das partes: se a repartição perder ou inventar um cêntimo, a empresa fica a
// dever dinheiro a quem não sabe, todos os meses.

import { describe, it, expect } from 'vitest';
import {
  allocate, checkSubscription, computeLiquidation, computePeriod,
  dateToMonth, monthStart, monthsBetween, nextMonthStart, toCents,
} from './projects.math';

const soma = (xs: { amount: number }[]) =>
  Math.round(xs.reduce((s, x) => s + x.amount, 0) * 100) / 100;

describe('allocate — repartir sem perder cêntimos', () => {
  it('reparte na proporção do que cada um pôs', () => {
    const r = allocate(1000, [
      { id: 'a', amount: 10000 },
      { id: 'b', amount: 5000 },
      { id: 'c', amount: 5000 },
    ]);
    expect(r.find((x) => x.id === 'a')!.amount).toBe(500);
    expect(r.find((x) => x.id === 'b')!.amount).toBe(250);
    expect(r.find((x) => x.id === 'c')!.amount).toBe(250);
  });

  it('a soma das partes é EXATAMENTE o total, mesmo quando não divide', () => {
    // 100 € por três: 33,333… cada. Arredondar cada um daria 99,99 €.
    const r = allocate(100, [
      { id: 'a', amount: 1000 },
      { id: 'b', amount: 1000 },
      { id: 'c', amount: 1000 },
    ]);
    expect(soma(r)).toBe(100);
    expect(r.map((x) => x.amount).sort()).toEqual([33.33, 33.33, 33.34]);
  });

  it('não perde cêntimos em nenhuma das mil repartições seguintes', () => {
    // O que interessa não é um caso: é a propriedade valer sempre.
    for (let total = 1; total <= 1000; total += 1) {
      const r = allocate(total / 7, [
        { id: 'a', amount: 3333 },
        { id: 'b', amount: 1111 },
        { id: 'c', amount: 2222 },
        { id: 'd', amount: 7 },
      ]);
      expect(soma(r)).toBe(Math.round((total / 7) * 100) / 100);
    }
  });

  it('o cêntimo que sobra vai para o maior resto', () => {
    // 10,00 € entre 2/3 e 1/3: 6,666… e 3,333…
    const r = allocate(10, [
      { id: 'a', amount: 2000 },
      { id: 'b', amount: 1000 },
    ]);
    expect(r.find((x) => x.id === 'a')!.amount).toBe(6.67);
    expect(r.find((x) => x.id === 'b')!.amount).toBe(3.33);
  });

  it('o resultado não depende da ordem das participações', () => {
    const partes = [
      { id: 'a', amount: 1000 },
      { id: 'b', amount: 1000 },
      { id: 'c', amount: 1000 },
    ];
    const r1 = allocate(100, partes);
    const r2 = allocate(100, [...partes].reverse());
    const porId = (r: typeof r1) =>
      Object.fromEntries(r.map((x) => [x.id, x.amount]));
    expect(porId(r1)).toEqual(porId(r2));
  });

  it('um mês de prejuízo não distribui nada', () => {
    const r = allocate(-50, [{ id: 'a', amount: 1000 }]);
    expect(soma(r)).toBe(0);
  });

  it('sem participações devolve lista vazia', () => {
    expect(allocate(100, [])).toEqual([]);
  });
});

describe('computePeriod — o lucro do mês', () => {
  const base = {
    commissionTotal: 600,
    vehicleFeeTotal: 400,
    expensesTotal: 200,
    profitSharePct: 50,
    includeCommission: true,
    includeVehicleFee: true,
  };

  it('comissão mais aluguer menos despesas', () => {
    const r = computePeriod(base);
    expect(r.profit).toBe(800);
    expect(r.investorsAmount).toBe(400);
  });

  it('respeita as parcelas desligadas', () => {
    expect(computePeriod({ ...base, includeVehicleFee: false }).profit).toBe(400);
    expect(computePeriod({ ...base, includeCommission: false }).profit).toBe(200);
  });

  it('um mês de prejuízo dá zero aos investidores, não um valor negativo', () => {
    const r = computePeriod({ ...base, expensesTotal: 1500 });
    expect(r.profit).toBe(-500);
    expect(r.investorsAmount).toBe(0);
  });

  it('a percentagem aplica-se ao lucro e não à receita', () => {
    const r = computePeriod({ ...base, profitSharePct: 25 });
    expect(r.investorsAmount).toBe(200);
  });
});

describe('computeLiquidation — o que volta no fim', () => {
  const partes = [
    { id: 'a', amount: 10000 },
    { id: 'b', amount: 5000 },
    { id: 'c', amount: 5000 },
  ];

  it('com o carro todo financiado, reparte o valor da venda inteiro', () => {
    const r = computeLiquidation({
      targetAmount: 20000, raisedAmount: 20000, saleAmount: 12000, shares: partes,
    });
    expect(r.ownership).toBe(1);
    expect(r.investorsTotal).toBe(12000);
    expect(r.perShare.find((x) => x.id === 'a')!.amount).toBe(6000);
    expect(soma(r.perShare)).toBe(12000);
  });

  it('financiado em parte, reparte só a fração que financiaram', () => {
    const r = computeLiquidation({
      targetAmount: 20000, raisedAmount: 15000, saleAmount: 12000,
      shares: [{ id: 'a', amount: 10000 }, { id: 'b', amount: 5000 }],
    });
    expect(r.ownership).toBe(0.75);
    expect(r.investorsTotal).toBe(9000);
  });

  it('o carro valorizou: devolve mais do que entrou', () => {
    const r = computeLiquidation({
      targetAmount: 20000, raisedAmount: 20000, saleAmount: 26000, shares: partes,
    });
    expect(r.perShare.find((x) => x.id === 'a')!.amount).toBe(13000);
  });

  it('sem venda, devolve o capital tal como entrou', () => {
    const r = computeLiquidation({
      targetAmount: 20000, raisedAmount: 20000, saleAmount: null, shares: partes,
    });
    expect(r.investorsTotal).toBe(20000);
    expect(r.perShare.find((x) => x.id === 'b')!.amount).toBe(5000);
  });
});

describe('checkSubscription', () => {
  const base = { minTicket: 500, targetAmount: 20000, raisedAmount: 15000, available: 10000 };

  it('aceita o que cabe', () => {
    expect(checkSubscription({ ...base, amount: 3000 })).toEqual({ ok: true, amount: 3000 });
  });

  it('aceita exatamente o que falta angariar', () => {
    expect(checkSubscription({ ...base, amount: 5000 })).toEqual({ ok: true, amount: 5000 });
  });

  it('recusa acima do que falta, e diz quanto falta', () => {
    const r = checkSubscription({ ...base, amount: 6000 });
    expect(r).toEqual({ ok: false, reason: 'EXCEEDS_TARGET', falta: 5000 });
  });

  it('recusa abaixo do mínimo', () => {
    expect(checkSubscription({ ...base, amount: 100 }))
      .toEqual({ ok: false, reason: 'BELOW_MIN' });
  });

  it('recusa sem saldo disponível', () => {
    expect(checkSubscription({ ...base, amount: 4000, available: 1000 }))
      .toEqual({ ok: false, reason: 'INSUFFICIENT' });
  });

  it('recusa zero e negativos', () => {
    expect(checkSubscription({ ...base, amount: 0 }))
      .toEqual({ ok: false, reason: 'NOT_POSITIVE' });
  });
});

describe('meses', () => {
  it('monthStart e nextMonthStart', () => {
    expect(monthStart('2026-03').toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(nextMonthStart('2026-12').toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('dateToMonth', () => {
    expect(dateToMonth(new Date('2026-07-01T00:00:00.000Z'))).toBe('2026-07');
  });

  it('monthsBetween inclui as duas pontas e atravessa o ano', () => {
    expect(monthsBetween('2026-11', '2027-02'))
      .toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('monthsBetween com o mesmo mês devolve um', () => {
    expect(monthsBetween('2026-05', '2026-05')).toEqual(['2026-05']);
  });

  it('monthsBetween ao contrário devolve vazio', () => {
    expect(monthsBetween('2026-05', '2026-01')).toEqual([]);
  });
});

describe('toCents', () => {
  it('não tropeça na vírgula flutuante', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBe(101);
  });
});
