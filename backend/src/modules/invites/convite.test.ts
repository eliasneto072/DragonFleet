// src/modules/invites/convite.test.ts
//
// Esta é a trave que decide quem entra numa frota. Um convite que devia estar
// esgotado e aceita mais uma pessoa não dá erro — dá um motorista dentro da
// conta de um cliente sem ninguém o ter convidado.

import { describe, it, expect } from 'vitest';
import {
  ALFABETO, COMPRIMENTO, gerarCodigo, normalizarCodigo,
  estadoDoConvite, validoAte,
} from './convite';

const HOJE = new Date('2026-10-10T15:30:00.000Z');
const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

const convite = (p: Partial<Parameters<typeof estadoDoConvite>[0]> = {}) => ({
  expiresOn: null, remaining: null, revokedAt: null, ...p,
});

describe('o alfabeto', () => {
  it('não tem I, O, 0 nem 1', () => {
    // O código é ditado ao telefone mais vezes do que se pensa. Um "I" que o
    // outro escreve "1" dá "convite inválido" e uma chamada para saber porquê.
    expect(ALFABETO).not.toContain('I');
    expect(ALFABETO).not.toContain('O');
    expect(ALFABETO).not.toContain('0');
    expect(ALFABETO).not.toContain('1');
  });

  it('são 24 letras, e não há repetidas', () => {
    expect(ALFABETO.length).toBe(24);
    expect(new Set(ALFABETO).size).toBe(24);
  });
});

describe('gerarCodigo', () => {
  it('dá o comprimento pedido, só com letras do alfabeto', () => {
    const c = gerarCodigo();
    expect(c.length).toBe(COMPRIMENTO);
    for (const letra of c) expect(ALFABETO).toContain(letra);
  });

  it('não repete — vinte seguidos são vinte diferentes', () => {
    // Não prova que é imprevisível (isso é do `crypto`), prova que não há aqui
    // um gerador preso num valor.
    const vistos = new Set<string>();
    for (let i = 0; i < 20; i += 1) vistos.add(gerarCodigo());
    expect(vistos.size).toBe(20);
  });
});

describe('normalizarCodigo', () => {
  it('aceita minúsculas, espaços e hífenes', () => {
    // É assim que um código colado de uma mensagem costuma chegar.
    expect(normalizarCodigo('abcdefghjk')).toBe('ABCDEFGHJK');
    expect(normalizarCodigo('ABCDE-FGHJK')).toBe('ABCDEFGHJK');
    expect(normalizarCodigo('  abcde fghjk  ')).toBe('ABCDEFGHJK');
  });

  it('recusa um caracter de fora em vez de o deitar fora', () => {
    // Apagado, o código ficava com nove letras e a resposta era "convite não
    // encontrado" — verdade, mas inútil para quem escreveu.
    expect(normalizarCodigo('ABCDEFGHJ0')).toBeNull();
    expect(normalizarCodigo('ABCDEFGHJI')).toBeNull();
    expect(normalizarCodigo('ABCDEFGH!K')).toBeNull();
  });

  it('recusa comprimentos errados', () => {
    expect(normalizarCodigo('ABCDEFGHJ')).toBeNull();
    expect(normalizarCodigo('ABCDEFGHJKL')).toBeNull();
    expect(normalizarCodigo('')).toBeNull();
    expect(normalizarCodigo(null)).toBeNull();
  });
});

describe('estadoDoConvite', () => {
  it('sem validade e sem limite, vale sempre', () => {
    expect(estadoDoConvite(convite(), HOJE)).toBe('valido');
  });

  it('o último dia ainda conta', () => {
    // A mesma regra das assinaturas: dar um dia a menos do que está escrito no
    // ecrã é o que ninguém discute e todos notam.
    expect(estadoDoConvite(convite({ expiresOn: dia('2026-10-10') }), HOJE)).toBe('valido');
    expect(estadoDoConvite(convite({ expiresOn: dia('2026-10-09') }), HOJE)).toBe('expirado');
  });

  it('a hora do dia não conta', () => {
    const noite = new Date('2026-10-10T23:59:00.000Z');
    expect(estadoDoConvite(convite({ expiresOn: dia('2026-10-10') }), noite)).toBe('valido');
  });

  it('zero restantes é esgotado; um ainda dá', () => {
    expect(estadoDoConvite(convite({ remaining: 0 }), HOJE)).toBe('esgotado');
    expect(estadoDoConvite(convite({ remaining: 1 }), HOJE)).toBe('valido');
  });

  it('restantes negativo também é esgotado', () => {
    // Não devia acontecer, mas se acontecer a resposta certa é fechar a porta
    // e não abri-la.
    expect(estadoDoConvite(convite({ remaining: -1 }), HOJE)).toBe('esgotado');
  });

  it('revogado manda sobre tudo o resto', () => {
    // A quem o revogou interessa ler "revogado" e não "esgotado", mesmo que as
    // duas coisas sejam verdade.
    const c = convite({
      revokedAt: dia('2026-10-01'), expiresOn: dia('2026-01-01'), remaining: 0,
    });
    expect(estadoDoConvite(c, HOJE)).toBe('revogado');
  });

  it('expirado vem antes de esgotado', () => {
    const c = convite({ expiresOn: dia('2026-09-01'), remaining: 0 });
    expect(estadoDoConvite(c, HOJE)).toBe('expirado');
  });
});

describe('validoAte', () => {
  it('conta os dias a partir de hoje, ao dia', () => {
    expect(validoAte(7, HOJE)!.toISOString().slice(0, 10)).toBe('2026-10-17');
    expect(validoAte(30, HOJE)!.toISOString().slice(0, 10)).toBe('2026-11-09');
  });

  it('sem validade dá nulo', () => {
    expect(validoAte(null, HOJE)).toBeNull();
  });

  it('recusa uma validade que não é validade', () => {
    expect(() => validoAte(0, HOJE)).toThrow();
    expect(() => validoAte(-5, HOJE)).toThrow();
  });

  it('um convite criado hoje com um dia vale amanhã, e não hoje', () => {
    // E vale hoje também, porque o último dia conta: criado hoje com 1 dia de
    // validade, hoje e amanhã valem.
    const ate = validoAte(1, HOJE)!;
    expect(estadoDoConvite(convite({ expiresOn: ate }), HOJE)).toBe('valido');
    const depoisDeAmanha = new Date('2026-10-12T09:00:00.000Z');
    expect(estadoDoConvite(convite({ expiresOn: ate }), depoisDeAmanha)).toBe('expirado');
  });
});
