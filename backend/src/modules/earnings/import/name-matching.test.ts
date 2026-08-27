// src/modules/earnings/import/name-matching.test.ts
//
// A pergunta que estes testes respondem: os ganhos de uma pessoa podem ir parar
// à conta de outra?
//
// É a falha mais cara desta funcionalidade e a mais silenciosa — não dá erro,
// dá um número errado no fecho de duas pessoas ao mesmo tempo.

import { describe, it, expect } from 'vitest';
import { normalizeName, matchDriver } from './name-matching';

const FROTA = [
  { id: 'u1', name: 'Mónica Luís Antunes' },
  { id: 'u2', name: 'Bruno Silva' },
  { id: 'u3', name: 'Carla Mendes' },
];

describe('normalizeName', () => {
  it('tira acentos', () => {
    expect(normalizeName('Mónica Luís')).toBe(normalizeName('Monica Luis'));
  });

  it('ignora maiusculas', () => {
    expect(normalizeName('BRUNO SILVA')).toBe('bruno silva');
  });

  it('colapsa espacos repetidos', () => {
    expect(normalizeName('Bruno   Silva ')).toBe('bruno silva');
  });

  it('ignora pontuacao', () => {
    expect(normalizeName('Bruno Silva.')).toBe('bruno silva');
  });

  it('trata cedilha e til', () => {
    expect(normalizeName('João Conceição')).toBe('joao conceicao');
  });
});

describe('matchDriver — o caso dos acentos', () => {
  it('casa o nome sem acentos da Uber com o motorista acentuado da base', () => {
    // O caso documentado no projeto: a Uber escreve "Monica Luis Antunes" e a
    // base tem "Mónica Luís Antunes". Sem normalização, esta pessoa nunca
    // recebia os ganhos da Uber — e sem erro nenhum, simplesmente não apareciam.
    const r = matchDriver('Monica Luis Antunes', FROTA);

    expect(r.status).toBe('matched');
    expect(r).toMatchObject({ userId: 'u1' });
  });

  it('casa o nome acentuado da Bolt com o mesmo motorista', () => {
    const r = matchDriver('Mónica Luís Antunes', FROTA);
    expect(r).toMatchObject({ status: 'matched', userId: 'u1' });
  });
});

describe('matchDriver — nomes do meio em falta', () => {
  it('casa por primeiro e ultimo nome quando o do meio nao vem', () => {
    // Os portais nem sempre trazem o nome do meio.
    const r = matchDriver('Monica Antunes', FROTA);
    expect(r).toMatchObject({ status: 'matched', userId: 'u1' });
  });

  it('NAO casa quando so o primeiro nome bate', () => {
    // "Mónica Ferreira" não é a "Mónica Antunes". Casar por primeiro nome
    // punha os ganhos de uma pessoa na conta de outra.
    const r = matchDriver('Monica Ferreira', FROTA);
    expect(r.status).toBe('not_found');
  });

  it('NAO casa quando so o ultimo nome bate', () => {
    const r = matchDriver('Rita Antunes', FROTA);
    expect(r.status).toBe('not_found');
  });
});

describe('matchDriver — quando NAO deve decidir', () => {
  it('devolve ambiguidade com dois motoristas do mesmo nome', () => {
    // Duas pessoas com o mesmo nome na frota é raro mas acontece, e é
    // precisamente quando escolher uma seria mais caro do que não escolher
    // nenhuma. Vai para a tela de conferência.
    const frota = [
      { id: 'a', name: 'João Silva' },
      { id: 'b', name: 'João Silva' },
    ];
    const r = matchDriver('Joao Silva', frota);

    expect(r.status).toBe('ambiguous');
    expect(r).toMatchObject({ candidates: [{ id: 'a' }, { id: 'b' }] });
  });

  it('devolve ambiguidade quando dois casam por primeiro e ultimo', () => {
    const frota = [
      { id: 'a', name: 'João Pedro Silva' },
      { id: 'b', name: 'João Miguel Silva' },
    ];
    const r = matchDriver('Joao Silva', frota);
    expect(r.status).toBe('ambiguous');
  });

  it('nao encontra um nome que nao existe na frota', () => {
    expect(matchDriver('Pessoa Inexistente', FROTA).status).toBe('not_found');
  });

  it('nao encontra a partir de um nome vazio', () => {
    expect(matchDriver('   ', FROTA).status).toBe('not_found');
  });

  it('nao encontra a partir de um nome com uma palavra so', () => {
    // "Bruno" sozinho não chega: se houvesse um "Bruno Costa" na frota,
    // escolher qualquer um deles seria um palpite.
    expect(matchDriver('Bruno', FROTA).status).toBe('not_found');
  });
});
