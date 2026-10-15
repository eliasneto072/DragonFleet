// src/modules/personal/personal.schemas.test.ts
//
// As datas opcionais, e o engano que tornava impossível editar.
//
// ─── O QUE ACONTECEU ────────────────────────────────────────────────────────
//
// Um `<input type="date">` por preencher vale `""`. O formulário enviava isso
// na data de fecho, e o `nullish()` — que aceita `null` e `undefined` — não
// aceita `""`. A resposta era «Data inválida (use AAAA-MM-DD)».
//
// Criar funcionava, porque o formulário vazio nem enviava o campo. EDITAR não:
// qualquer crédito por liquidar e qualquer operação de trading ainda aberta
// ficavam impossíveis de gravar. Dois ecrãs inteiros bloqueados por um caso
// que nenhum teste cobria.
//
// Estes testes existem para que não volte. São rápidos e não precisam de base
// de dados nenhuma — exactamente o tipo de teste que faltava.

import { describe, it, expect } from 'vitest';
import {
  actualizarCreditoSchema, criarCreditoSchema, actualizarOperacaoSchema,
  periodoDaQuery,
} from './personal.schemas';

const CREDITO = {
  name: 'Crédito pessoal',
  principal: '10000',
  startedOn: '2026-01-15',
  installments: '48',
};

describe('a data de fecho de um crédito', () => {
  it('um campo VAZIO quer dizer «ainda não foi liquidado»', () => {
    // Era isto que rebentava. O formulário de edição carrega `""` no campo
    // quando o crédito não está liquidado, e gravar era impossível.
    const r = actualizarCreditoSchema.parse({
      params: { id: 'c1' },
      body: { ...CREDITO, closedOn: '' },
    });
    expect(r.body.closedOn).toBeNull();
  });

  it('espaços em branco também', () => {
    const r = actualizarCreditoSchema.parse({
      params: { id: 'c1' },
      body: { ...CREDITO, closedOn: '   ' },
    });
    expect(r.body.closedOn).toBeNull();
  });

  it('nulo e ausente continuam a valer', () => {
    expect(criarCreditoSchema.parse({ body: { ...CREDITO, closedOn: null } }).body.closedOn)
      .toBeNull();
    expect(criarCreditoSchema.parse({ body: CREDITO }).body.closedOn)
      .toBeUndefined();
  });

  it('uma data a sério continua a ser lida, ao meio-dia UTC', () => {
    // Meio-dia e não meia-noite: um fuso a oeste empurrava a data para o dia
    // anterior. Ver a nota no topo de `personal.schemas.ts`.
    const r = criarCreditoSchema.parse({ body: { ...CREDITO, closedOn: '2026-06-30' } });
    expect((r.body.closedOn as Date).toISOString()).toBe('2026-06-30T12:00:00.000Z');
  });

  it('uma data mal escrita CONTINUA a ser recusada', () => {
    // A correcção não pode ter aberto a porta a qualquer coisa.
    expect(() => criarCreditoSchema.parse({ body: { ...CREDITO, closedOn: '30/06/2026' } }))
      .toThrow();
    expect(() => criarCreditoSchema.parse({ body: { ...CREDITO, closedOn: 'ontem' } }))
      .toThrow();
  });
});

describe('a data de fecho de uma operação de trading', () => {
  const OPERACAO = {
    asset: 'EURUSD',
    direction: 'LONG' as const,
    openedAt: '2026-03-01',
    result: '150',
  };

  it('uma posição ABERTA grava-se com a data de fecho vazia', () => {
    // O mesmo engano, no outro ecrã. Uma correcção num sítio só resolve os
    // dois — e é por isso que a data opcional é partilhada.
    const r = actualizarOperacaoSchema.parse({
      params: { id: 'o1' },
      body: { ...OPERACAO, closedAt: '' },
    });
    expect(r.body.closedAt).toBeNull();
  });
});

describe('o período na barra de endereço', () => {
  it('sem filtro nenhum', () => {
    expect(periodoDaQuery({})).toEqual({ de: null, ate: null });
  });

  it('`?de=&ate=` é sem filtro, e não um erro', () => {
    expect(periodoDaQuery({ de: '', ate: '' })).toEqual({ de: null, ate: null });
  });

  it('o fim do período vai até ao FIM do dia', () => {
    // Ao meio-dia, as despesas do último dia com hora depois disso caíam fora
    // da conta.
    const p = periodoDaQuery({ de: '2026-10-01', ate: '2026-10-31' });
    expect(p.de?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(p.ate?.toISOString()).toBe('2026-10-31T23:59:59.999Z');
  });

  it('uma data mal escrita continua a ser recusada', () => {
    expect(() => periodoDaQuery({ de: '2026-13-45' })).toThrow();
  });
});
