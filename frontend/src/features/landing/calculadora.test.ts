// src/features/landing/calculadora.test.ts
//
// É dinheiro mostrado a alguém que ainda não assinou nada. Um cêntimo a mais
// é uma promessa que não se cumpre na primeira semana.

import { describe, it, expect } from 'vitest';
import {
  contaCarroProprio, contaCarroDaFrota, porMes,
  CARRO_PROPRIO, SEMANAS_POR_MES,
} from './calculadora';

describe('as condições', () => {
  it('são as que ele pratica: 6% de imposto e 50 € de slot', () => {
    // Se isto mudar, muda aqui E no site. O teste existe para a alteração ser
    // deliberada e não um engano de dedo.
    //
    // O nome do campo importa: chamou-se `comissao` e a tela dizia «Comissão
    // DragonFleet». São 6% de IMPOSTO sobre o bruto — os mesmos que o fecho
    // semanal aplica. A comissão da empresa é um campo à parte, que cada
    // frota define, e nestes motoristas está a zero.
    expect(CARRO_PROPRIO.imposto).toBe(6);
    expect(CARRO_PROPRIO.slotSemanal).toBe(50);
  });
});

describe('carro próprio', () => {
  it('o caso normal', () => {
    const c = contaCarroProprio(1000);
    expect(c.imposto).toBe(60);
    expect(c.slot).toBe(50);
    expect(c.totalDescontado).toBe(110);
    expect(c.liquido).toBe(890);
    expect(c.abaixoDoMinimo).toBe(false);
  });

  it('os cêntimos não se perdem', () => {
    // 6% de 1234,56 são 74,0736 — tem de ficar 74,07, e não 74,08 nem
    // 74,07360000000001.
    const c = contaCarroProprio(1234.56);
    expect(c.imposto).toBe(74.07);
    expect(c.liquido).toBe(1110.49);
  });

  it('faturação zero não cobra nada nem deve nada', () => {
    const c = contaCarroProprio(0);
    expect(c.liquido).toBe(0);
    // Sem trabalho, a tela não deve acender o aviso: ainda não começou.
    expect(c.abaixoDoMinimo).toBe(false);
  });

  it('abaixo do slot, avisa em vez de mostrar um negativo', () => {
    // Uma semana de 40 € não paga os 50 do slot. O que acontece de facto é
    // que a diferença fica em dívida — isso explica-se ao telefone, não com
    // um número a vermelho numa página de vendas.
    const c = contaCarroProprio(40);
    expect(c.liquido).toBe(0);
    expect(c.abaixoDoMinimo).toBe(true);
  });

  it('exactamente no ponto de equilíbrio não avisa', () => {
    // 53,20 de bruto: 6% são 3,19(2) → 3,19, mais 50 = 53,19. Sobra 1 cêntimo.
    const c = contaCarroProprio(53.2);
    expect(c.abaixoDoMinimo).toBe(false);
    expect(c.liquido).toBe(0.01);
  });

  it('lixo no campo conta como zero, e não como NaN', () => {
    // É um campo aberto numa página pública. Um NaN propagava-se e a tela
    // inteira ficava a dizer "NaN €".
    for (const v of [NaN, Infinity, -500]) {
      const c = contaCarroProprio(v);
      expect(c.liquido).toBe(0);
      expect(Number.isFinite(c.totalDescontado)).toBe(true);
    }
  });
});

describe('carro da frota', () => {
  it('só o aluguer, sem percentagem', () => {
    const c = contaCarroDaFrota(1000, 250);
    expect(c.imposto).toBe(0);
    expect(c.totalDescontado).toBe(250);
    expect(c.liquido).toBe(750);
  });

  it('sem aluguer escrito, mostra o bruto inteiro', () => {
    // O campo começa vazio porque o valor depende do carro e dizemo-lo ao
    // telefone. Vazio, não inventa um desconto.
    const c = contaCarroDaFrota(1000, 0);
    expect(c.liquido).toBe(1000);
  });

  it('aluguer maior que o bruto avisa', () => {
    const c = contaCarroDaFrota(100, 250);
    expect(c.liquido).toBe(0);
    expect(c.abaixoDoMinimo).toBe(true);
  });
});

describe('porMes', () => {
  it('usa 52 semanas por ano, e não 4 por mês', () => {
    // Com 4, um ano dava 48 semanas e o mensal ficava sempre abaixo do real
    // — o erro que joga a nosso favor, e por isso o mais fácil de deixar
    // passar.
    expect(SEMANAS_POR_MES).toBeGreaterThan(4.33);
    expect(porMes(100)).toBe(433.33);
  });

  it('zero é zero', () => {
    expect(porMes(0)).toBe(0);
  });
});
