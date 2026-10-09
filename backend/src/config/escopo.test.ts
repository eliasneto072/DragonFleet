// src/config/escopo.test.ts
//
// A pergunta que isto responde é sempre a mesma: "a consulta de uma frota pode
// tocar nos dados de outra?". É a pergunta mais importante de todo o sistema a
// partir do momento em que se vende contas, e é a única cuja resposta errada
// não dá erro nenhum.
//
// Testa-se a decisão pura — quando é que uma operação leva filtro e qual — e
// não o Prisma, que não está instalado aqui. A ligação entre as duas é a
// extensão em `escopo.ts`, dez linhas de encaminhamento por cima destas regras.

import { describe, it, expect } from 'vitest';
import {
  frotaParaOperacao, ErroDeEscopo, MODELOS_GLOBAIS,
  type Escopo,
} from './escopo';

const DELE: Escopo = { fleetId: 'frota_a', modo: 'frota' };
const DONO: Escopo = { fleetId: null, modo: 'dono' };
const SISTEMA: Escopo = { fleetId: null, modo: 'sistema' };

describe('fora de qualquer frota', () => {
  it('atira — o estado de omissão é a recusa', () => {
    // É isto que faz um módulo novo que se esqueça do âmbito falhar no
    // primeiro teste, em vez de deixar passar dados durante meses.
    expect(() => frotaParaOperacao('User', 'findMany', null)).toThrow(ErroDeEscopo);
  });

  it('a mensagem diz o que fazer', () => {
    try {
      frotaParaOperacao('Booking', 'create', null);
      throw new Error('devia ter atirado');
    } catch (e: any) {
      expect(e.message).toContain('Booking.create');
      expect(e.message).toContain('comFrota');
    }
  });

  it('as tabelas da plataforma passam na mesma', () => {
    // As frotas e os planos não pertencem a ninguém: lê-las antes de haver
    // frota definida é exatamente o que o arranque e o login fazem.
    expect(frotaParaOperacao('Fleet', 'findMany', null)).toBeNull();
    expect(frotaParaOperacao('Plan', 'findMany', null)).toBeNull();
  });
});

describe('dentro de uma frota', () => {
  it('devolve a frota, para entrar no filtro', () => {
    expect(frotaParaOperacao('Vehicle', 'findMany', DELE)).toBe('frota_a');
    expect(frotaParaOperacao('Withdrawal', 'create', DELE)).toBe('frota_a');
    expect(frotaParaOperacao('Booking', 'updateMany', DELE)).toBe('frota_a');
  });

  it('as tabelas da plataforma continuam sem filtro', () => {
    // Uma frota precisa de ler o plano dela, que é uma linha partilhada.
    expect(frotaParaOperacao('Plan', 'findUnique', DELE)).toBeNull();
  });

  it('um modo de frota sem frota é um erro e não um "vê tudo"', () => {
    // O caso perigoso: um pedido onde o escopo foi criado mas a frota ficou
    // por preencher. Sem esta linha, passava a ver o sistema inteiro.
    const partido: Escopo = { fleetId: null, modo: 'frota' };
    expect(() => frotaParaOperacao('User', 'findMany', partido)).toThrow(ErroDeEscopo);
  });
});

describe('o dono e o sistema', () => {
  it('atravessam as frotas de propósito', () => {
    expect(frotaParaOperacao('Fleet', 'findMany', DONO)).toBeNull();
    expect(frotaParaOperacao('User', 'count', DONO)).toBeNull();
    expect(frotaParaOperacao('Vehicle', 'findMany', SISTEMA)).toBeNull();
  });

  it('e é preciso declará-lo — não acontece por distração', () => {
    // A diferença entre "vejo tudo" e "esqueci-me do filtro" é esta: o
    // primeiro escreve-se comoDono(), o segundo atira.
    expect(frotaParaOperacao('User', 'findMany', DONO)).toBeNull();
    expect(() => frotaParaOperacao('User', 'findMany', null)).toThrow(ErroDeEscopo);
  });
});

describe('a lista de tabelas globais', () => {
  it('tem só as duas da plataforma', () => {
    // Este teste existe para falhar quando alguém acrescentar um nome. Se o
    // acrescento for deliberado, muda-se aqui também — com a mão a tremer,
    // porque é abrir uma tabela a todos os clientes.
    expect([...MODELOS_GLOBAIS].sort()).toEqual(['Fleet', 'Plan']);
  });

  it('e nenhuma tabela de dados de clientes', () => {
    for (const m of ['User', 'Vehicle', 'Earning', 'Withdrawal', 'Document',
      'WeeklySettlement', 'Booking', 'Material', 'SystemSettings',
      'SupportTicket', 'InvestorAccount', 'StaffPermission']) {
      expect(MODELOS_GLOBAIS.has(m)).toBe(false);
    }
  });
});
