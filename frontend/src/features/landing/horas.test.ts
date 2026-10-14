// src/features/landing/horas.test.ts
//
// Não há corredor de testes no frontend (o vitest está no backend), por isso
// estes correm só do meu lado. Se um dia quiseres correr `npm test` aqui,
// instala-se o vitest neste projeto e passam a correr contigo também.
//
// Vale a pena testá-los mesmo assim: é um número mostrado numa página de
// vendas, e um número errado ali é uma discussão no primeiro telefonema.

import { describe, it, expect } from 'vitest';
import {
  contaDeHoras, SEMANAS_POR_ANO, HORAS_POR_DIA, MAX_HORAS, MAX_VALOR_HORA,
} from './horas';

describe('as constantes', () => {
  it('o ano tem 52 semanas, e não 48', () => {
    // Com 4 semanas por mês dava 48, e a conta ficava sempre a favor do
    // argumento ao contrário: menos horas perdidas do que a realidade.
    expect(SEMANAS_POR_ANO).toBe(52);
    expect(HORAS_POR_DIA).toBe(8);
  });
});

describe('as horas', () => {
  it('o caso normal: 4 horas por semana', () => {
    const c = contaDeHoras(4);
    expect(c.horasPorAno).toBe(208);
    expect(c.diasPorAno).toBe(26);
  });

  it('meias horas contam', () => {
    const c = contaDeHoras(2.5);
    expect(c.horasPorAno).toBe(130);
    expect(c.diasPorAno).toBe(16.3); // 16,25 arredondado a uma casa
  });

  it('zero horas é zero, e não mostra custo', () => {
    const c = contaDeHoras(0, 15);
    expect(c.horasPorAno).toBe(0);
    expect(c.diasPorAno).toBe(0);
    expect(c.temCusto).toBe(false);
  });

  it('não passa do teto das horas', () => {
    const c = contaDeHoras(1000);
    expect(c.horasPorSemana).toBe(MAX_HORAS);
    expect(c.horasPorAno).toBe(MAX_HORAS * SEMANAS_POR_ANO);
  });
});

describe('o custo', () => {
  it('só aparece quando ele escreve quanto vale a hora', () => {
    // É o ponto todo desta calculadora: sem o valor dele, não há euros
    // nenhuns na tela. Um valor por hora assumido por nós era um número
    // nosso a fingir que era dele.
    const sem = contaDeHoras(4);
    expect(sem.temCusto).toBe(false);
    expect(sem.custoPorAno).toBe(0);

    const com = contaDeHoras(4, 12.5);
    expect(com.temCusto).toBe(true);
    expect(com.custoPorAno).toBe(2600);
  });

  it('os cêntimos não se perdem', () => {
    // 2,5 × 52 × 7,35 = 955,5 — e em vírgula flutuante crua dá
    // 955,5000000000001, que apareceria na página tal e qual.
    const c = contaDeHoras(2.5, 7.35);
    expect(c.custoPorAno).toBe(955.5);
  });

  it('não passa do teto do valor por hora', () => {
    const c = contaDeHoras(1, 999999);
    expect(c.custoPorAno).toBe(MAX_VALOR_HORA * SEMANAS_POR_ANO);
  });

  it('lixo nos campos conta como zero, e não como NaN', () => {
    // São dois campos abertos numa página pública. Um NaN propagava-se e a
    // secção inteira ficava a dizer "NaN horas".
    for (const v of [NaN, Infinity, -10]) {
      const c = contaDeHoras(v, v);
      expect(c.horasPorAno).toBe(0);
      expect(c.custoPorAno).toBe(0);
      expect(c.temCusto).toBe(false);
      expect(Number.isFinite(c.diasPorAno)).toBe(true);
    }
  });
});
