// src/modules/personal/plano.test.ts
//
// Os créditos que não são de bancos: tramos de prestação, capital a devolver,
// e o estado contado pelos pagamentos a sério.
//
// ─── O QUE ISTO PROTEGE ─────────────────────────────────────────────────────
//
// Três números que, se saírem errados, saem errados de forma plausível — e por
// isso ninguém desconfia:
//
//   · a percentagem paga, que é a barra que ele olha primeiro;
//   · o atraso, que é a única razão de os pagamentos passarem a ser
//     registados em vez de contados pelo calendário;
//   · a soma das prestações, que tem de dar EXACTAMENTE o que se devolve.

import { describe, it, expect } from 'vitest';
import {
  tramosOrdenados, prestacaoNumero, planoDoCredito, totalDoPlano,
  juroTotal, custoEmPercentagem, estadoPorPagamentos, acumuladoPorMes,
  type CreditoPorPlano,
} from './plano';

const dia = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

/** 24 prestações: as 12 primeiras a 200, as 12 seguintes a 300. */
const CREDITO: CreditoPorPlano = {
  capital: 5000,
  totalAPagar: 6000,
  prestacoes: 24,
  inicio: dia('2026-01-10'),
  tramos: [
    { dePrestacao: 1, valor: 200 },
    { dePrestacao: 13, valor: 300 },
  ],
};

describe('os tramos', () => {
  it('ficam por ordem, mesmo escritos ao contrário', () => {
    expect(tramosOrdenados([
      { dePrestacao: 13, valor: 300 },
      { dePrestacao: 1, valor: 200 },
    ])).toEqual([
      { dePrestacao: 1, valor: 200 },
      { dePrestacao: 13, valor: 300 },
    ]);
  });

  it('um tramo que não começa na primeira prestação é puxado para ela', () => {
    // Senão não havia resposta para «quanto se paga na prestação 1», e o
    // plano inteiro ficava sem início.
    expect(tramosOrdenados([{ dePrestacao: 5, valor: 250 }]))
      .toEqual([{ dePrestacao: 1, valor: 250 }]);
  });

  it('dois tramos na mesma prestação: fica o último escrito', () => {
    expect(tramosOrdenados([
      { dePrestacao: 1, valor: 200 },
      { dePrestacao: 1, valor: 250 },
    ])).toEqual([{ dePrestacao: 1, valor: 250 }]);
  });

  it('valores impossíveis são deitados fora, não aceites a zero', () => {
    expect(tramosOrdenados([
      { dePrestacao: 1, valor: 200 },
      { dePrestacao: 5, valor: 0 },
      { dePrestacao: 9, valor: -50 },
    ])).toEqual([{ dePrestacao: 1, valor: 200 }]);
  });

  it('cada prestação cai no tramo certo', () => {
    const t = CREDITO.tramos;
    expect(prestacaoNumero(t, 1)).toBe(200);
    expect(prestacaoNumero(t, 12)).toBe(200);
    expect(prestacaoNumero(t, 13)).toBe(300);
    expect(prestacaoNumero(t, 24)).toBe(300);
  });
});

describe('o plano', () => {
  const plano = planoDoCredito(CREDITO);

  it('tem uma linha por prestação', () => {
    expect(plano).toHaveLength(24);
  });

  it('anda de mês a mês a partir da primeira', () => {
    expect(plano[0].quando.toISOString().slice(0, 10)).toBe('2026-01-10');
    expect(plano[1].quando.toISOString().slice(0, 10)).toBe('2026-02-10');
    expect(plano[23].quando.toISOString().slice(0, 10)).toBe('2027-12-10');
  });

  it('o dia 31 cai no último dia dos meses que não o têm', () => {
    const p = planoDoCredito({ ...CREDITO, inicio: dia('2026-01-31'), prestacoes: 2 });
    expect(p[1].quando.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('a soma dá EXACTAMENTE o que se devolve', () => {
    // 12×200 + 12×300 = 6.000, que é o total. Aqui bate sem ajuste.
    expect(totalDoPlano(CREDITO)).toBe(6000);
  });

  it('quando os tramos não dão certo, a última prestação leva o resto', () => {
    // 24 × 200 = 4.800, mas devolve-se 5.000. Os 200 que faltam vão para a
    // última. Sem isto, a barra parava nos 96% e nunca fechava.
    const c = { ...CREDITO, totalAPagar: 5000, tramos: [{ dePrestacao: 1, valor: 200 }] };
    const p = planoDoCredito(c);
    expect(p[23].valor).toBe(400);
    expect(totalDoPlano(c)).toBe(5000);
  });

  it('sem total a pagar, as prestações mandam e não se ajusta nada', () => {
    const c = { ...CREDITO, totalAPagar: null };
    expect(totalDoPlano(c)).toBe(6000);
    expect(planoDoCredito(c)[23].valor).toBe(300);
  });

  it('um total mal escrito não produz uma última prestação negativa', () => {
    // 6.000 em prestações e um total de 1.000: o resto daria −4.700. Em vez
    // disso mantém-se o valor do tramo, e os números continuam a ser dinheiro.
    const c = { ...CREDITO, totalAPagar: 1000 };
    expect(planoDoCredito(c)[23].valor).toBe(300);
  });

  it('sem tramos nenhuns não há plano, e não um plano a zero', () => {
    expect(planoDoCredito({ ...CREDITO, tramos: [] })).toEqual([]);
  });
});

describe('o juro, sem taxa nenhuma', () => {
  it('é a diferença entre o que se devolve e o que se pediu', () => {
    expect(juroTotal(CREDITO)).toBe(1000);
  });

  it('um empréstimo sem juros dá zero, e zero é um facto', () => {
    expect(juroTotal({ ...CREDITO, totalAPagar: 5000 })).toBe(0);
  });

  it('sem total escrito, o juro é DESCONHECIDO e não zero', () => {
    // Mostrar zero seria afirmar que o crédito não tem juros.
    expect(juroTotal({ ...CREDITO, totalAPagar: null })).toBeNull();
  });

  it('a percentagem é o custo do dinheiro, e nunca se chama TAN', () => {
    const c = custoEmPercentagem(CREDITO);
    expect(c?.total).toBe(20);   // 1.000 sobre 5.000
    expect(c?.porAno).toBe(10);  // em dois anos
  });

  it('sem total não há percentagem', () => {
    expect(custoEmPercentagem({ ...CREDITO, totalAPagar: null })).toBeNull();
  });
});

describe('o estado, contado pelos pagamentos', () => {
  const hoje = dia('2026-04-15'); // já venceram as prestações 1, 2, 3 e 4

  it('em dia: quatro pagas, nenhuma em atraso', () => {
    const p = [1, 2, 3, 4].map((n) => ({
      quando: dia(`2026-0${n}-10`), valor: 200,
    }));
    const e = estadoPorPagamentos(CREDITO, p, hoje);
    expect(e.pago).toBe(800);
    expect(e.porPagar).toBe(5200);
    expect(e.prestacoesPagas).toBe(4);
    expect(e.prestacoesDevidas).toBe(4);
    expect(e.emAtraso).toBe(0);
    expect(e.valorEmAtraso).toBe(0);
  });

  it('uma prestação em atraso APARECE como atraso', () => {
    // É a razão de tudo isto. Contado pelo calendário, este crédito aparecia
    // em dia — e é o caso real de um dos créditos dele.
    const p = [1, 2, 3].map((n) => ({ quando: dia(`2026-0${n}-10`), valor: 200 }));
    const e = estadoPorPagamentos(CREDITO, p, hoje);
    expect(e.emAtraso).toBe(1);
    expect(e.valorEmAtraso).toBe(200);
  });

  it('pagar adiantado não cria atraso negativo', () => {
    const p = Array.from({ length: 8 }, (_, i) => ({
      quando: dia('2026-01-10'), valor: 200,
    }));
    const e = estadoPorPagamentos(CREDITO, p, hoje);
    expect(e.prestacoesPagas).toBe(8);
    expect(e.emAtraso).toBe(0);
    expect(e.valorEmAtraso).toBe(0);
  });

  it('a percentagem vai de 0 a 100 e fecha em 100', () => {
    expect(estadoPorPagamentos(CREDITO, [], hoje).percentagem).toBe(0);
    expect(estadoPorPagamentos(CREDITO, [{ quando: hoje, valor: 3000 }], hoje).percentagem)
      .toBe(50);
    const tudo = estadoPorPagamentos(CREDITO, [{ quando: hoje, valor: 6000 }], hoje);
    expect(tudo.percentagem).toBe(100);
    expect(tudo.liquidado).toBe(true);
    expect(tudo.porPagar).toBe(0);
  });

  it('pagar a mais não passa dos 100% nem dá um «por pagar» negativo', () => {
    const e = estadoPorPagamentos(CREDITO, [{ quando: hoje, valor: 9999 }], hoje);
    expect(e.percentagem).toBe(100);
    expect(e.porPagar).toBe(0);
  });

  it('cem pagamentos de 0,10 € dão exactamente 10,00 €', () => {
    // Somar em vírgula flutuante deixa resíduo; ao cêntimo não.
    const p = Array.from({ length: 100 }, () => ({ quando: hoje, valor: 0.1 }));
    expect(estadoPorPagamentos(CREDITO, p, hoje).pago).toBe(10);
  });
});

describe('a reta dos pagamentos acumulados', () => {
  const hoje = dia('2026-03-20');
  const pagos = [
    { quando: dia('2026-01-10'), valor: 200 },
    { quando: dia('2026-02-10'), valor: 200 },
  ];

  it('tem um ponto por prestação, com o previsto a subir', () => {
    const r = acumuladoPorMes(CREDITO, pagos, hoje);
    expect(r).toHaveLength(24);
    expect(r[0]).toEqual({ mes: '2026-01', previsto: 200, pago: 200 });
    expect(r[1]).toEqual({ mes: '2026-02', previsto: 400, pago: 400 });
  });

  it('o mês corrente mostra o que já foi pago, mesmo que falte', () => {
    const r = acumuladoPorMes(CREDITO, pagos, hoje);
    expect(r[2]).toEqual({ mes: '2026-03', previsto: 600, pago: 400 });
  });

  it('depois de hoje o pago é NULO, e não zero', () => {
    // Zero no futuro faz a linha mergulhar a pique e lê-se como «parou de
    // pagar» em vez de «ainda não chegou lá».
    const r = acumuladoPorMes(CREDITO, pagos, hoje);
    expect(r[3].pago).toBeNull();
    expect(r[23].pago).toBeNull();
    expect(r[23].previsto).toBe(6000);
  });

  it('sem plano não há reta', () => {
    expect(acumuladoPorMes({ ...CREDITO, tramos: [] }, pagos, hoje)).toEqual([]);
  });
});
