// src/modules/personal/creditos.test.ts
//
// Um número plausível 2% errado leva alguém a decidir consolidar — ou a não
// consolidar — um crédito de setenta e cinco mil euros. Nenhum destes casos
// se encontra a clicar.

import { describe, it, expect } from 'vitest';
import {
  prestacaoMensal, quadroDeAmortizacao, estadoDoCredito, jurosPorAno,
  prestacaoBateCerto, type Credito,
} from './creditos';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Um crédito com números redondos, para as contas se poderem conferir à mão. */
const BASE: Credito = {
  capital: 10000, tan: 6, prestacoes: 12, inicio: d('2026-01-01'),
};

describe('a prestação', () => {
  it('a amortização francesa, conferida à mão', () => {
    // 10.000 € a 6% TAN em 12 meses: i = 0,005.
    // 10000 × 0,005 ÷ (1 − 1,005^−12) = 860,66 €
    expect(prestacaoMensal(10000, 6, 12)).toBe(860.66);
  });

  it('TAXA A ZERO é capital a dividir por prestações', () => {
    // O caso que parte a fórmula: com i = 0, o denominador é zero e o
    // resultado é infinito. Acontece a sério — acordos de família e dívidas
    // sem juro.
    expect(prestacaoMensal(12000, 0, 48)).toBe(250);
  });

  it('lixo nos campos dá zero e não NaN', () => {
    expect(prestacaoMensal(NaN, 5, 12)).toBe(0);
    expect(prestacaoMensal(10000, 5, 0)).toBe(0);
    expect(prestacaoMensal(-500, 5, 12)).toBe(0);
    expect(prestacaoMensal(10000, NaN, 12)).toBe(833.33); // taxa inválida = sem juro
  });
});

describe('o quadro de amortização', () => {
  it('a primeira prestação é quase toda juro, a última quase toda capital', () => {
    const q = quadroDeAmortizacao(BASE);
    expect(q[0].juro).toBe(50);      // 10000 × 0,005
    expect(q[0].capital).toBe(810.66);
    expect(q[11].juro).toBeLessThan(q[0].juro);
    expect(q[11].capital).toBeGreaterThan(q[0].capital);
  });

  it('a dívida acaba EXACTAMENTE a zero', () => {
    // O teste que importa. Arredondar a prestação a cêntimos faz o saldo
    // acabar alguns cêntimos ao lado, e num crédito de 84 meses isso dá
    // quase um euro — «faltam 0,87 €» lê-se como uma avaria.
    for (const c of [
      BASE,
      { capital: 75000, tan: 5.4, prestacoes: 84, inicio: d('2026-01-01') },
      { capital: 12000, tan: 0, prestacoes: 48, inicio: d('2026-01-01') },
      { capital: 1234.56, tan: 7.77, prestacoes: 37, inicio: d('2026-03-15') },
    ]) {
      const q = quadroDeAmortizacao(c);
      expect(q[q.length - 1].saldo).toBe(0);
    }
  });

  it('o capital amortizado soma exactamente o capital emprestado', () => {
    const q = quadroDeAmortizacao({ capital: 75000, tan: 5.4, prestacoes: 84, inicio: d('2026-01-01') });
    const somaCapital = Math.round(q.reduce((s, l) => s + l.capital * 100, 0)) / 100;
    expect(somaCapital).toBe(75000);
  });

  it('as prestações andam de mês a mês', () => {
    const q = quadroDeAmortizacao(BASE);
    expect(q[0].quando.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(q[1].quando.toISOString().slice(0, 10)).toBe('2026-02-01');
    expect(q[11].quando.toISOString().slice(0, 10)).toBe('2026-12-01');
  });

  it('sem capital ou sem prestações, o quadro é vazio e não rebenta', () => {
    expect(quadroDeAmortizacao({ ...BASE, capital: 0 })).toEqual([]);
    expect(quadroDeAmortizacao({ ...BASE, prestacoes: 0 })).toEqual([]);
  });
});

describe('o estado do crédito', () => {
  it('a meio', () => {
    // A 1 de Julho de 2026 venceram sete das doze (Janeiro a Julho).
    const e = estadoDoCredito(BASE, d('2026-07-01'));
    expect(e.pagas).toBe(7);
    expect(e.prestacoes).toBe(12);
    expect(e.percentagemPaga).toBe(58.3);
    expect(e.terminado).toBe(false);
    expect(e.ultimoPagamento?.n).toBe(7);
    expect(e.proximoPagamento?.n).toBe(8);
  });

  it('ANTES de começar não tem nada pago e não rebenta', () => {
    // O crédito que ainda não arrancou: `vencidas` é uma lista vazia, e
    // `vencidas[length - 1]` é indefinido. É aqui que uma versão ingénua
    // explode.
    const e = estadoDoCredito(BASE, d('2025-06-01'));
    expect(e.pagas).toBe(0);
    expect(e.percentagemPaga).toBe(0);
    expect(e.ultimoPagamento).toBe(null);
    expect(e.proximoPagamento?.n).toBe(1);
    expect(e.emDivida).toBe(10000);
    expect(e.jurosPagos).toBe(0);
  });

  it('DEPOIS de acabar fica a 100% e sem próxima prestação', () => {
    const e = estadoDoCredito(BASE, d('2030-01-01'));
    expect(e.pagas).toBe(12);
    expect(e.percentagemPaga).toBe(100);
    expect(e.terminado).toBe(true);
    expect(e.proximoPagamento).toBe(null);
    expect(e.emDivida).toBe(0);
    expect(e.jurosPorPagar).toBe(0);
  });

  it('os juros pagos mais os que faltam dão os juros totais', () => {
    const e = estadoDoCredito(BASE, d('2026-07-01'));
    expect(Math.round((e.jurosPagos + e.jurosPorPagar) * 100) / 100)
      .toBe(e.jurosTotais);
  });

  it('o total a pagar é capital mais juros', () => {
    const e = estadoDoCredito(BASE, d('2026-07-01'));
    expect(e.totalAPagar).toBe(Math.round((10000 + e.jurosTotais) * 100) / 100);
  });

  it('um crédito sem juro nenhum tem juros a zero', () => {
    const e = estadoDoCredito(
      { capital: 12000, tan: 0, prestacoes: 48, inicio: d('2026-01-01') },
      d('2027-01-01'),
    );
    expect(e.jurosTotais).toBe(0);
    expect(e.totalAPagar).toBe(12000);
    expect(e.pagas).toBe(13);
  });
});

describe('os juros ano a ano', () => {
  it('o primeiro ano é o que leva mais juro', () => {
    const anos = jurosPorAno({ capital: 75000, tan: 5.4, prestacoes: 84, inicio: d('2026-01-01') });
    expect(anos[0].ano).toBe(2026);
    expect(anos).toHaveLength(7);
    // A razão por que amortizar cedo vale mais: a percentagem em juros desce
    // todos os anos.
    expect(anos[0].percentagemEmJuros).toBeGreaterThan(anos[6].percentagemEmJuros);
  });

  it('em cada ano, juro mais capital dá o que se pagou', () => {
    const anos = jurosPorAno({ capital: 75000, tan: 5.4, prestacoes: 84, inicio: d('2026-01-01') });
    for (const a of anos) {
      expect(Math.round((a.juro + a.capital) * 100) / 100).toBe(a.pago);
    }
  });

  it('com um limite, só conta até essa data', () => {
    const anos = jurosPorAno(BASE, d('2026-03-31'));
    expect(anos).toHaveLength(1);
    expect(anos[0].pago).toBe(Math.round(860.66 * 3 * 100) / 100);
  });
});

describe('a prestação bate certo com o contrato?', () => {
  it('bate quando os números estão certos', () => {
    const r = prestacaoBateCerto(BASE, 860.66);
    expect(r.bate).toBe(true);
    expect(r.diferenca).toBe(0);
  });

  it('tolera diferenças pequenas — seguros e comissões na prestação', () => {
    expect(prestacaoBateCerto(BASE, 864).bate).toBe(true);
  });

  it('NÃO tolera um dígito trocado', () => {
    // O engano que isto existe para apanhar: um zero a mais no capital dá um
    // quadro inteiro errado, bonito e coerente consigo próprio.
    const r = prestacaoBateCerto(BASE, 1860.66);
    expect(r.bate).toBe(false);
    expect(r.calculada).toBe(860.66);
  });

  it('num crédito pequeno, um euro de diferença ainda passa', () => {
    // Sem o mínimo de 1 €, 1% de uma prestação de 50 € eram 50 cêntimos, e
    // qualquer arredondamento acendia o aviso.
    const pequeno = { capital: 600, tan: 0, prestacoes: 12, inicio: d('2026-01-01') };
    expect(prestacaoBateCerto(pequeno, 50.9).bate).toBe(true);
  });
});
