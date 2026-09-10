// src/shared/utils/phone.test.ts

import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidPhone } from './phone';

describe('normalizePhone — limpeza', () => {
  it('tira os espacos de um numero portugues escrito por extenso', () => {
    expect(normalizePhone('912 345 678')).toBe('912345678');
  });

  it('preserva o indicativo internacional a cabeca', () => {
    expect(normalizePhone('+351 912 345 678')).toBe('+351912345678');
  });

  it('aceita a forma brasileira com parenteses e traco', () => {
    expect(normalizePhone('(11) 98765-4321')).toBe('11987654321');
  });

  it('aceita o indicativo com 00 em vez de +', () => {
    expect(normalizePhone('00351912345678')).toBe('00351912345678');
  });

  it('corta os espacos de fora', () => {
    expect(normalizePhone('  912345678  ')).toBe('912345678');
  });

  it('um + no meio e gralha, nao indicativo', () => {
    expect(normalizePhone('912+345678')).toBe('912345678');
  });
});

describe('normalizePhone — vazio e lixo sao coisas diferentes', () => {
  it('campo por preencher da nulo', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it('campo apagado da nulo — tem de ser possivel remover o contacto', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
  });

  it('texto sem digitos NAO da nulo — senao gravava lixo como "sem telefone"', () => {
    expect(normalizePhone('nao tenho')).toBe('');
    expect(isValidPhone(normalizePhone('nao tenho'))).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('a ausencia e valida: o campo e opcional', () => {
    expect(isValidPhone(null)).toBe(true);
  });

  it('aceita numero nacional e internacional', () => {
    expect(isValidPhone('912345678')).toBe(true);
    expect(isValidPhone('+351912345678')).toBe(true);
    expect(isValidPhone('11987654321')).toBe(true);
  });

  it('recusa curto demais para ser um contacto', () => {
    expect(isValidPhone('12345')).toBe(false);
  });

  it('recusa acima dos 15 digitos do E.164', () => {
    expect(isValidPhone('1234567890123456')).toBe(false);
  });

  it('recusa a cadeia vazia que sobra do texto sem digitos', () => {
    expect(isValidPhone('')).toBe(false);
  });
});
