// src/features/driver/periodo.test.ts
//
// Datas são o sítio onde o software mente com mais confiança. Nenhum destes
// casos se encontra a clicar — encontram-se meses depois, quando um total não
// bate certo e já ninguém se lembra porquê.

import { describe, it, expect } from 'vitest';
import {
  periodoDe, dentroDoPeriodo, filtrarPorPeriodo, descreverPeriodo, paraDia,
} from './periodo';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('a semana', () => {
  it('vai de segunda a domingo', () => {
    // 2026-10-14 é uma quarta-feira.
    const p = periodoDe('semana', d('2026-10-14'));
    expect(p).toEqual({ de: '2026-10-12', ate: '2026-10-18' });
  });

  it('ao DOMINGO ainda é a semana que acaba nesse dia', () => {
    // O caso que parte quem usa o domingo como primeiro dia: a «semana
    // atual» começava no dia seguinte, e o período ficava vazio precisamente
    // no dia em que alguém se senta a fazer contas.
    const p = periodoDe('semana', d('2026-10-18'));
    expect(p).toEqual({ de: '2026-10-12', ate: '2026-10-18' });
  });

  it('à segunda começa nesse próprio dia', () => {
    const p = periodoDe('semana', d('2026-10-12'));
    expect(p.de).toBe('2026-10-12');
  });

  it('atravessa a mudança de mês sem partir', () => {
    // 2026-11-01 é um domingo: a semana dele começa em Outubro.
    expect(periodoDe('semana', d('2026-11-01'))).toEqual({
      de: '2026-10-26', ate: '2026-11-01',
    });
  });
});

describe('o mês', () => {
  it('acaba no último dia, seja ele qual for', () => {
    expect(periodoDe('mes', d('2026-10-14')).ate).toBe('2026-10-31');
    expect(periodoDe('mes', d('2026-11-14')).ate).toBe('2026-11-30');
  });

  it('Fevereiro de um ano normal acaba a 28', () => {
    expect(periodoDe('mes', d('2026-02-10')).ate).toBe('2026-02-28');
  });

  it('Fevereiro de um ano bissexto acaba a 29', () => {
    // 2028 é bissexto. Escrever 28 à mão dava uma conta errada de quatro em
    // quatro anos — o erro perfeito: raro, e invisível quando acontece.
    expect(periodoDe('mes', d('2028-02-10')).ate).toBe('2028-02-29');
  });

  it('o primeiro e o último dia do mês dão o mesmo período', () => {
    expect(periodoDe('mes', d('2026-10-01'))).toEqual(periodoDe('mes', d('2026-10-31')));
  });
});

describe('o ano e o «tudo»', () => {
  it('o ano vai de 1 de Janeiro a 31 de Dezembro', () => {
    expect(periodoDe('ano', d('2026-06-15'))).toEqual({
      de: '2026-01-01', ate: '2026-12-31',
    });
  });

  it('«tudo» não tem limites', () => {
    expect(periodoDe('tudo', d('2026-06-15'))).toEqual({ de: null, ate: null });
  });
});

describe('o que entra e o que fica de fora', () => {
  const p = { de: '2026-10-01', ate: '2026-10-31' };

  it('os dois extremos ENTRAM', () => {
    // O fim exclusivo é o engano clássico: «este mês» acabava a 30 e as
    // despesas do dia 31 desapareciam da conta.
    expect(dentroDoPeriodo('2026-10-01', p)).toBe(true);
    expect(dentroDoPeriodo('2026-10-31', p)).toBe(true);
  });

  it('o dia antes e o dia depois ficam de fora', () => {
    expect(dentroDoPeriodo('2026-09-30', p)).toBe(false);
    expect(dentroDoPeriodo('2026-11-01', p)).toBe(false);
  });

  it('uma data com hora é comparada só pelo dia', () => {
    // O servidor devolve datas completas; o filtro trabalha com dias. Sem
    // cortar a hora, uma despesa de dia 31 às 23h caía fora do mês dela.
    expect(dentroDoPeriodo('2026-10-31T23:30:00.000Z', p)).toBe(true);
  });

  it('sem limites, passa tudo', () => {
    expect(dentroDoPeriodo('1999-01-01', { de: null, ate: null })).toBe(true);
  });
});

describe('filtrar uma lista', () => {
  const linhas = [
    { id: 'a', quando: '2026-09-30' },
    { id: 'b', quando: '2026-10-01' },
    { id: 'c', quando: '2026-10-31T10:00:00.000Z' },
    { id: 'd', quando: '2026-11-01' },
  ];

  it('deixa passar só o mês pedido', () => {
    const r = filtrarPorPeriodo(linhas, (l) => l.quando, { de: '2026-10-01', ate: '2026-10-31' });
    expect(r.map((l) => l.id)).toEqual(['b', 'c']);
  });

  it('sem período, devolve tudo', () => {
    expect(filtrarPorPeriodo(linhas, (l) => l.quando, { de: null, ate: null }))
      .toHaveLength(4);
  });

  it('não mexe na lista que recebeu', () => {
    const copia = [...linhas];
    filtrarPorPeriodo(linhas, (l) => l.quando, { de: '2026-10-01', ate: null });
    expect(linhas).toEqual(copia);
  });
});

describe('como se escreve', () => {
  it('em português, com o dia à frente', () => {
    expect(descreverPeriodo({ de: '2026-10-01', ate: '2026-10-31' }))
      .toBe('01/10/2026 a 31/10/2026');
    expect(descreverPeriodo({ de: null, ate: null })).toBe('Desde sempre');
    expect(descreverPeriodo({ de: '2026-10-01', ate: null })).toBe('Desde 01/10/2026');
  });
});

describe('paraDia', () => {
  it('devolve o dia em UTC', () => {
    expect(paraDia(d('2026-01-05'))).toBe('2026-01-05');
  });
});
