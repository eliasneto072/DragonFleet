// src/modules/company/lucro.test.ts
//
// Estes números vão decidir se se vendem carros, se se consolidam créditos e
// se se compra um Tesla. Um erro aqui não dá um ecrã estranho — dá uma decisão
// errada com dezenas de milhares de euros em cima.

import { describe, it, expect } from 'vitest';
import {
  calcularLucro, lucroPorMes, calcularCaixa,
  type FechoParaLucro, type DespesaDaEmpresa,
} from './lucro';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function fecho(p: Partial<FechoParaLucro> = {}): FechoParaLucro {
  return {
    doDono: false,
    aluguer: 0,
    outrasDeducoes: 0,
    comissao: 0,
    liquidoDoMotorista: 0,
    quando: d('2026-10-05'),
    ...p,
  };
}

const despesa = (valor: number, quando = '2026-10-10'): DespesaDaEmpresa =>
  ({ valor, quando: d(quando), categoriaId: null });

describe('o que entra no lucro', () => {
  it('motorista com carro da frota: entra o aluguer, não o líquido dele', () => {
    // O ponto todo. Os 750 € do motorista NÃO são receita da empresa — nunca
    // foram dela. Contá-los dava um lucro quatro vezes maior do que o real.
    const l = calcularLucro([
      fecho({ aluguer: 250, liquidoDoMotorista: 750 }),
    ], []);
    expect(l.alugueres).toBe(250);
    expect(l.receita).toBe(250);
  });

  it('motorista com carro próprio: entra o slot e a comissão', () => {
    const l = calcularLucro([
      fecho({ outrasDeducoes: 50, comissao: 31.81, liquidoDoMotorista: 498.37 }),
    ], []);
    expect(l.slots).toBe(50);
    expect(l.comissoes).toBe(31.81);
    expect(l.receita).toBe(81.81);
  });

  it('QUANDO O MOTORISTA É O DONO, o aluguer não conta e o líquido entra por inteiro', () => {
    // A regra que o schema já escreve no `isCompany`: o aluguer lançado ao
    // dono é a empresa a cobrar a si própria — dinheiro a passar do bolso
    // esquerdo para o direito. Contá-lo inflacionava o lucro sem um cêntimo
    // ter entrado de fora.
    const l = calcularLucro([
      fecho({ doDono: true, aluguer: 275, liquidoDoMotorista: 900 }),
    ], []);
    expect(l.alugueres).toBe(0);
    expect(l.doDono).toBe(900);
    expect(l.receita).toBe(900);
  });

  it('os dois casos juntos somam certo', () => {
    const l = calcularLucro([
      fecho({ aluguer: 220, liquidoDoMotorista: 600 }),
      fecho({ outrasDeducoes: 50, comissao: 30, liquidoDoMotorista: 500 }),
      fecho({ doDono: true, aluguer: 275, liquidoDoMotorista: 900 }),
    ], []);
    expect(l.alugueres).toBe(220);
    expect(l.slots).toBe(50);
    expect(l.comissoes).toBe(30);
    expect(l.doDono).toBe(900);
    expect(l.receita).toBe(1200);
  });
});

describe('as despesas', () => {
  it('descontam ao lucro', () => {
    const l = calcularLucro([fecho({ aluguer: 1000 })], [despesa(300), despesa(200)]);
    expect(l.despesas).toBe(500);
    expect(l.lucro).toBe(500);
  });

  it('uma despesa escrita com menos continua a descontar', () => {
    // Campo aberto. Um menos à mão passaria a SOMAR ao lucro — o engano que
    // mais custa, porque melhora o número em vez de o piorar.
    expect(calcularLucro([fecho({ aluguer: 1000 })], [despesa(-300)]).lucro).toBe(700);
  });

  it('despesas maiores que a receita dão prejuízo, e diz-se assim', () => {
    const l = calcularLucro([fecho({ aluguer: 500 })], [despesa(800)]);
    expect(l.lucro).toBe(-300);
    expect(l.margem).toBe(-60);
  });
});

describe('os casos das pontas', () => {
  it('sem nada, tudo a zero e margem nula', () => {
    const l = calcularLucro([], []);
    expect(l.receita).toBe(0);
    expect(l.lucro).toBe(0);
    // `null` e não zero: zero lia-se como «margem nula», e o que se passa é
    // «ainda não há nada para medir».
    expect(l.margem).toBe(null);
  });

  it('só despesas, sem receita nenhuma', () => {
    const l = calcularLucro([], [despesa(400)]);
    expect(l.lucro).toBe(-400);
    expect(l.margem).toBe(null);
  });

  it('os cêntimos não se perdem em cem fechos pequenos', () => {
    const cem = Array.from({ length: 100 }, () => fecho({ aluguer: 0.1 }));
    expect(calcularLucro(cem, []).receita).toBe(10);
  });
});

describe('mês a mês', () => {
  it('agrupa e ordena', () => {
    const linhas = lucroPorMes(
      [fecho({ aluguer: 300, quando: d('2026-09-10') }), fecho({ aluguer: 500 })],
      [despesa(100, '2026-09-20')],
    );
    expect(linhas.map((l) => l.mes)).toEqual(['2026-09', '2026-10']);
    expect(linhas[0]).toEqual({ mes: '2026-09', receita: 300, despesas: 100, lucro: 200 });
    expect(linhas[1]).toEqual({ mes: '2026-10', receita: 500, despesas: 0, lucro: 500 });
  });

  it('um mês SÓ COM DESPESAS aparece na mesma', () => {
    // É precisamente o mês que interessa ver. Saltá-lo dava um gráfico que
    // escondia os meses maus.
    const linhas = lucroPorMes([], [despesa(250, '2026-08-03')]);
    expect(linhas).toEqual([{ mes: '2026-08', receita: 0, despesas: 250, lucro: -250 }]);
  });
});

describe('a caixa', () => {
  it('o exemplo que ele deu', () => {
    const c = calcularCaixa({ valor: 8400, quando: d('2026-10-14') }, 5200, d('2026-10-14'));
    expect(c.declarado).toBe(8400);
    expect(c.dosMotoristas).toBe(5200);
    expect(c.livre).toBe(3200);
    expect(c.diasDesdeADeclaracao).toBe(0);
  });

  it('conta os dias desde a declaração', () => {
    // Quanto mais velha a declaração, menos vale o «livre». A tela avisa, e
    // para avisar precisa deste número.
    const c = calcularCaixa({ valor: 8400, quando: d('2026-09-14') }, 5200, d('2026-10-14'));
    expect(c.diasDesdeADeclaracao).toBe(30);
  });

  it('dever mais do que se tem dá um livre NEGATIVO, e mostra-se', () => {
    // Não se trava a zero. Um negativo aqui quer dizer que o dinheiro dos
    // motoristas já não está todo na conta — e esconder isso atrás de um zero
    // era esconder exactamente o problema que isto existe para apanhar.
    const c = calcularCaixa({ valor: 3000, quando: d('2026-10-14') }, 5200, d('2026-10-14'));
    expect(c.livre).toBe(-2200);
  });

  it('sem saldo declarado não inventa nada', () => {
    const c = calcularCaixa(null, 5200, d('2026-10-14'));
    expect(c.declarado).toBe(0);
    expect(c.declaradoEm).toBe(null);
    expect(c.diasDesdeADeclaracao).toBe(null);
    expect(c.dosMotoristas).toBe(5200);
  });
});
