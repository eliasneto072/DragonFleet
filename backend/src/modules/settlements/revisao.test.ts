// src/modules/settlements/revisao.test.ts
//
// O que mudou num fecho, e o que o motorista lê.
//
// Duas coisas são testadas aqui com mais cuidado do que o resto: não inventar
// alterações que não houve, e não esconder alterações que houve. A primeira
// enche a caixa do motorista de ruído até ele deixar de ler; a segunda mexe-lhe
// no dinheiro sem o dizer.

import { describe, it, expect } from 'vitest';
import { compararFecho, mensagemParaMotorista } from './revisao';

/**
 * O `Intl` português separa o número do € com um espaço NÃO SEPARÁVEL (U+00A0),
 * não com um espaço normal. Comparar "306,30 €" escrito à mão contra o que ele
 * produz falha, e falha por uma razão que não tem nada a ver com o que se está
 * a testar. Normaliza-se, e o teste volta a falar do que interessa.
 */
const semEspacosEstranhos = (t: string) => t.replace(/ /g, ' ');

const BASE = {
  weekStart: new Date('2026-08-17T00:00:00.000Z'),
  weekEnd: new Date('2026-08-23T00:00:00.000Z'),
  uberAmount: 400,
  boltAmount: 200,
  otherRevenue: 0,
  tollsAmount: 12.5,
  fuelAmount: 45.2,
  chargeAmount: 0,
  vehicleFee: 180,
  otherDeductions: 0,
  commissionRate: 15,
  taxRate: 6,
  odometerStart: 100000,
  odometerEnd: 101200,
  notes: null,
  vehicleId: 'v1',
};

describe('o que conta como alteração', () => {
  it('não inventa alterações quando nada muda', () => {
    expect(compararFecho(BASE, { ...BASE })).toEqual([]);
  });

  it('ignora os campos que o pedido não traz', () => {
    // Uma edição que só mexe no combustível não deve relatar os outros quinze.
    const a = compararFecho(BASE, { fuelAmount: 38.9 });
    expect(a).toHaveLength(1);
    expect(a[0].campo).toBe('fuelAmount');
  });

  it('apanha o campo que mudou, com o antes e o depois', () => {
    const a = compararFecho(BASE, { ...BASE, fuelAmount: 38.9 });
    expect(a).toHaveLength(1);
    expect(a[0].rotulo).toBe('Combustível');
    expect(a[0].antes).toBe(45.2);
    expect(a[0].depois).toBe(38.9);
  });

  it('trata 45.2 e "45.20" como o mesmo valor', () => {
    // Vêm da base como Decimal e do formulário como número. Sem isto, abrir e
    // gravar sem tocar em nada escrevia uma revisão a dizer que mudou tudo.
    expect(compararFecho(BASE, { ...BASE, fuelAmount: '45.20' })).toEqual([]);
    expect(compararFecho(BASE, { ...BASE, uberAmount: '400' })).toEqual([]);
  });

  it('distingue um cêntimo', () => {
    const a = compararFecho(BASE, { ...BASE, fuelAmount: 45.21 });
    expect(a).toHaveLength(1);
  });

  it('trata a data vinda como texto e como Date da mesma maneira', () => {
    expect(compararFecho(BASE, { ...BASE, weekStart: '2026-08-17' })).toEqual([]);
    const a = compararFecho(BASE, { ...BASE, weekStart: '2026-08-10' });
    expect(a).toHaveLength(1);
    expect(a[0].antes).toBe('2026-08-17');
    expect(a[0].depois).toBe('2026-08-10');
  });

  it('apanha passar a nulo e sair de nulo', () => {
    const limpou = compararFecho({ ...BASE, notes: 'olá' }, { ...BASE, notes: null });
    expect(limpou).toHaveLength(1);
    expect(limpou[0].depois).toBe(null);

    const pos = compararFecho(BASE, { ...BASE, notes: 'nova nota' });
    expect(pos).toHaveLength(1);
    expect(pos[0].antes).toBe(null);
  });

  it('mantém a ordem do ecrã e não a ordem do pedido', () => {
    const a = compararFecho(BASE, {
      ...BASE, fuelAmount: 1, uberAmount: 2, tollsAmount: 3,
    });
    expect(a.map((x) => x.campo)).toEqual(['uberAmount', 'tollsAmount', 'fuelAmount']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('a mensagem que o motorista lê', () => {
  const comum = {
    semanaInicio: new Date('2026-08-17T00:00:00.000Z'),
    semanaFim: new Date('2026-08-23T00:00:00.000Z'),
    motivo: 'A Prio tinha um abastecimento a mais, de outro carro.',
  };

  it('diz a semana no título, em português', () => {
    const { titulo } = mensagemParaMotorista({
      ...comum, alteracoes: [], liquidoAntes: 300, liquidoDepois: 300,
    });
    expect(titulo).toBe('O fecho de 17/08/2026 a 23/08/2026 foi corrigido');
  });

  it('começa pelo motivo', () => {
    const { mensagem } = mensagemParaMotorista({
      ...comum,
      alteracoes: compararFecho(BASE, { ...BASE, fuelAmount: 38.9 }),
      liquidoAntes: 300, liquidoDepois: 306.3,
    });
    expect(mensagem.startsWith('Motivo: A Prio tinha um abastecimento')).toBe(true);
  });

  it('mostra cada campo com os dois valores', () => {
    const { mensagem } = mensagemParaMotorista({
      ...comum,
      alteracoes: compararFecho(BASE, { ...BASE, fuelAmount: 38.9 }),
      liquidoAntes: 300, liquidoDepois: 306.3,
    });
    expect(mensagem).toContain('Combustível:');
    expect(mensagem).toContain('45,20');
    expect(mensagem).toContain('38,90');
  });

  it('acaba no que ele recebe, quando isso muda', () => {
    const { mensagem } = mensagemParaMotorista({
      ...comum,
      alteracoes: compararFecho(BASE, { ...BASE, fuelAmount: 38.9 }),
      liquidoAntes: 300, liquidoDepois: 306.3,
    });
    expect(mensagem).toContain('A receber:');
    expect(semEspacosEstranhos(mensagem).trim().endsWith('306,30 €')).toBe(true);
  });

  it('não fala do que ele recebe quando isso não mudou', () => {
    // Corrigir uma observação não lhe mexe no dinheiro, e dizer "A receber:
    // 300 € → 300 €" só o faz ir conferir uma coisa que está na mesma.
    const { mensagem } = mensagemParaMotorista({
      ...comum,
      alteracoes: compararFecho(BASE, { ...BASE, notes: 'corrigido' }),
      liquidoAntes: 300, liquidoDepois: 300,
    });
    expect(mensagem).not.toContain('A receber');
  });

  it('funciona quando só o líquido mudou', () => {
    // Acontece ao alterar a percentagem de comissão por fora do formulário.
    const { mensagem } = mensagemParaMotorista({
      ...comum, alteracoes: [], liquidoAntes: 300, liquidoDepois: 280,
    });
    expect(mensagem).toContain('Motivo:');
    expect(mensagem).toContain('A receber:');
  });
});
