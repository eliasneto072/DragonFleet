// src/modules/personal/financas.test.ts
//
// São os números do dinheiro dele, mostrados só a ele. Não há cliente a
// reclamar quando um está errado — e por isso um erro aqui podia viver anos.

import { describe, it, expect } from 'vitest';
import {
  resumirTrading, trandingPorMes, despesasPorCategoria, despesasPorMes,
  chaveDoMes, retornoPercentual,
} from './financas';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const op = (result: number, fees: number, data = '2026-10-01') =>
  ({ result, fees, openedAt: d(data) });

describe('resumo do trading', () => {
  it('o caso normal', () => {
    const r = resumirTrading([op(100, 5), op(-40, 2), op(250, 10)]);
    expect(r.total).toBe(3);
    expect(r.bruto).toBe(310);
    expect(r.comissoes).toBe(17);
    expect(r.liquido).toBe(293);
    expect(r.ganhas).toBe(2);
    expect(r.perdidas).toBe(1);
    expect(r.taxaDeAcerto).toBe(66.7);
  });

  it('sem operações não inventa zeros', () => {
    // Zero numa taxa de acerto lê-se como "nunca ganhaste". O que se passa é
    // "ainda não há dados", e são coisas diferentes.
    const r = resumirTrading([]);
    expect(r.total).toBe(0);
    expect(r.liquido).toBe(0);
    expect(r.taxaDeAcerto).toBe(null);
    expect(r.melhor).toBe(null);
    expect(r.media).toBe(null);
  });

  it('os cêntimos não se perdem em cem lançamentos pequenos', () => {
    // 100 × 0,10 € tem de dar exactamente 10,00 €. Em vírgula flutuante crua
    // dá 9,999999999999998, e é esse número que aparecia na tela.
    const cem = Array.from({ length: 100 }, () => op(0.1, 0));
    expect(resumirTrading(cem).liquido).toBe(10);
  });

  it('uma operação que fica a zero não conta como ganha nem como perdida', () => {
    // Ganhou 10 e pagou 10 de comissão. Atirá-la para as ganhas inflacionava
    // a taxa de acerto; para as perdidas, baixava-a. É nula.
    const r = resumirTrading([op(10, 10), op(50, 0)]);
    expect(r.nulas).toBe(1);
    expect(r.ganhas).toBe(1);
    expect(r.perdidas).toBe(0);
    // A taxa conta sobre as que tiveram resultado: 1 em 1.
    expect(r.taxaDeAcerto).toBe(100);
  });

  it('comissões maiores do que o lucro viram a operação ao contrário', () => {
    const r = resumirTrading([op(30, 45)]);
    expect(r.liquido).toBe(-15);
    expect(r.perdidas).toBe(1);
    expect(r.taxaDeAcerto).toBe(0);
  });

  it('uma comissão escrita com menos continua a descontar', () => {
    // É um campo aberto. Um menos escrito à mão passaria a somar ao lucro,
    // que é o engano que mais custa: dava um resultado melhor do que o real.
    expect(resumirTrading([op(100, -20)]).liquido).toBe(80);
  });

  it('melhor, pior e média usam o líquido e não o bruto', () => {
    const r = resumirTrading([op(100, 90), op(50, 0), op(-20, 5)]);
    expect(r.melhor).toBe(50);
    expect(r.pior).toBe(-25);
    expect(r.media).toBe(11.67); // (10 + 50 − 25) / 3
  });

  it('uma série toda negativa não dá uma taxa de acerto positiva', () => {
    const r = resumirTrading([op(-10, 0), op(-20, 0)]);
    expect(r.taxaDeAcerto).toBe(0);
    expect(r.melhor).toBe(-10);
  });
});

describe('o mês a mês', () => {
  it('agrupa e ordena do mais antigo para o mais recente', () => {
    const linhas = trandingPorMes([
      op(100, 0, '2026-10-05'),
      op(-50, 0, '2026-09-20'),
      op(30, 0, '2026-10-28'),
    ]);
    expect(linhas.map((l) => l.mes)).toEqual(['2026-09', '2026-10']);
    expect(linhas[1].liquido).toBe(130);
    expect(linhas[1].total).toBe(2);
  });

  it('não inventa meses vazios pelo meio', () => {
    // Uma linha a zero num mês em que ninguém negociou diz, num gráfico, que
    // se perdeu o lucro todo nesse mês. Não se fez nada, é diferente.
    const linhas = trandingPorMes([op(10, 0, '2026-01-10'), op(10, 0, '2026-06-10')]);
    expect(linhas.map((l) => l.mes)).toEqual(['2026-01', '2026-06']);
  });

  it('o mês vem em UTC e com dois dígitos', () => {
    expect(chaveDoMes(d('2026-01-31'))).toBe('2026-01');
    expect(chaveDoMes(d('2026-12-01'))).toBe('2026-12');
  });
});

describe('despesas', () => {
  const g = (amount: number, categoryId: string | null, data = '2026-10-02') =>
    ({ amount, categoryId, spentOn: d(data) });

  it('soma por categoria, da maior para a menor', () => {
    const t = despesasPorCategoria([g(50, 'a'), g(120, 'b'), g(30, 'a')]);
    expect(t).toEqual([
      { categoriaId: 'b', total: 120 },
      { categoriaId: 'a', total: 80 },
    ]);
  });

  it('as despesas sem gaveta não desaparecem da tabela', () => {
    // Se sumissem, o total por categoria deixava de bater certo com o total
    // geral — uma tabela que mente por omissão.
    const t = despesasPorCategoria([g(40, null), g(60, 'a')]);
    expect(t.find((x) => x.categoriaId === null)?.total).toBe(40);
    expect(t.reduce((s, x) => s + x.total, 0)).toBe(100);
  });

  it('um valor negativo conta como despesa e não como entrada de dinheiro', () => {
    expect(despesasPorCategoria([g(-80, 'a')])[0].total).toBe(80);
  });

  it('o mês a mês das despesas', () => {
    const linhas = despesasPorMes([g(10, null, '2026-09-01'), g(25, null, '2026-10-03')]);
    expect(linhas).toEqual([
      { mes: '2026-09', total: 1, liquido: 10 },
      { mes: '2026-10', total: 1, liquido: 25 },
    ]);
  });
});

describe('retorno percentual', () => {
  it('um longo que subiu', () => {
    expect(retornoPercentual(100, 110, 'LONG')).toBe(10);
  });

  it('um curto que desceu ganhou', () => {
    // O sinal ao contrário é o engano clássico, e aqui dava a um ganho o ar
    // de uma perda no histórico todo.
    expect(retornoPercentual(100, 90, 'SHORT')).toBe(10);
    expect(retornoPercentual(100, 110, 'SHORT')).toBe(-10);
  });

  it('sem um dos preços não inventa nada', () => {
    expect(retornoPercentual(100, null, 'LONG')).toBe(null);
    expect(retornoPercentual(null, 110, 'LONG')).toBe(null);
    expect(retornoPercentual(undefined, undefined, 'LONG')).toBe(null);
  });

  it('entrada a zero não dá infinito', () => {
    expect(retornoPercentual(0, 50, 'LONG')).toBe(null);
  });
});
