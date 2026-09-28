// src/modules/expenses/expenses.math.test.ts
//
// Os valores destes testes saem das CAPTURAS que o cliente mandou dos dois
// portais — não são inventados. Se um portal mudar a forma de escrever, é aqui
// que se vê primeiro.

import { describe, it, expect } from 'vitest';
import {
  canonicalPlate, normalizeCard, splitPrioCardCell, parseMoney, parsePortalDateTime,
  mondayOf, settlementWeekOf, movementRangeFor, categorizeViaVerde,
  isCancelledStatus, defaultChargeable, externalKey,
} from './expenses.math';

describe('matriculas e cartoes', () => {
  it('poe tracos numa matricula portuguesa', () => {
    expect(canonicalPlate('xy27qz')).toBe('XY-27-QZ');
    expect(canonicalPlate('XY-27-QZ')).toBe('XY-27-QZ');
    expect(canonicalPlate(' xy 27 qz ')).toBe('XY-27-QZ');
  });

  it('matricula estrangeira fica em maiusculas, sem inventar tracos', () => {
    expect(canonicalPlate('AB123CD')).toBe('AB123CD');
  });

  it('cartao so com digitos, e recusa lixo curto', () => {
    expect(normalizeCard('7824 0000 1111 2222')).toBe('7824000011112222');
    expect(normalizeCard('123')).toBeNull();
  });

  it('separa o cartao da matricula na celula da Prio', () => {
    // Tal como aparece na captura das Transacoes Frota.
    expect(splitPrioCardCell('7824000011112222\nXY-27-QZ'))
      .toEqual({ card: '7824000011112222', plate: 'XY-27-QZ' });
    expect(splitPrioCardCell('7824000011112222 XY-27-QZ'))
      .toEqual({ card: '7824000011112222', plate: 'XY-27-QZ' });
  });

  it('celula so com o cartao nao inventa matricula', () => {
    expect(splitPrioCardCell('7824000011112222')).toEqual({ card: '7824000011112222', plate: null });
  });
});

describe('dinheiro', () => {
  it('le os totais da Prio', () => {
    expect(parseMoney('87,55€')).toBe(87.55);
    expect(parseMoney('29,74€')).toBe(29.74);
    expect(parseMoney('117.29 €')).toBe(117.29);
  });

  it('le os valores da Via Verde', () => {
    expect(parseMoney('1,49 €')).toBe(1.49);
    expect(parseMoney('0,75 €')).toBe(0.75);
  });

  it('o preco unitario da Prio usa ponto decimal e le-se certo', () => {
    // Mesma tabela, formato diferente: "1.7797 €". Nao e mil setecentos.
    expect(parseMoney('1.7797 €')).toBe(1.78);
  });

  it('milhares com os dois separadores', () => {
    expect(parseMoney('1.234,56 €')).toBe(1234.56);
    expect(parseMoney('1,234.56')).toBe(1234.56);
  });

  it('ponto com exatamente tres casas e milhar — a aposta documentada', () => {
    expect(parseMoney('1.234')).toBe(1234);
  });

  it('negativos e vazios', () => {
    expect(parseMoney('-3,20 €')).toBe(-3.2);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('—')).toBeNull();
    expect(parseMoney(null)).toBeNull();
  });
});

describe('datas', () => {
  it('le a data da Prio, mesmo partida em duas linhas', () => {
    const m = parsePortalDateTime('23/09/2026\n23:20')!;
    expect(m.day).toBe('2026-09-23');
    // Setembro: Lisboa esta em UTC+1.
    expect(m.occurredAt.toISOString()).toBe('2026-09-23T22:20:00.000Z');
  });

  it('le a data da Via Verde', () => {
    const m = parsePortalDateTime('2026-09-19 08:04:14')!;
    expect(m.day).toBe('2026-09-19');
    expect(m.occurredAt.toISOString()).toBe('2026-09-19T07:04:14.000Z');
  });

  it('numa portagem com entrada e saida fica a ENTRADA', () => {
    const m = parsePortalDateTime('2026-09-22 09:23:20 > 2026-09-22 09:26:23')!;
    expect(m.occurredAt.toISOString()).toBe('2026-09-22T08:23:20.000Z');
  });

  it('no inverno Lisboa esta em UTC', () => {
    const m = parsePortalDateTime('15/01/2026 10:00')!;
    expect(m.occurredAt.toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('a meia-noite de segunda em Lisboa fica na SEGUNDA, nao no domingo', () => {
    // 00:30 de segunda 21/09/2026 em Lisboa = 23:30 de domingo em UTC. Pela
    // conta em UTC caia na semana anterior; o motorista ve segunda no recibo.
    const m = parsePortalDateTime('21/09/2026 00:30')!;
    expect(m.occurredAt.toISOString()).toBe('2026-09-20T23:30:00.000Z');
    expect(m.day).toBe('2026-09-21');
    expect(mondayOf(m.day)).toBe('2026-09-21');
  });

  it('recusa o que nao e data', () => {
    expect(parsePortalDateTime('A aguardar fatura')).toBeNull();
    expect(parsePortalDateTime('32/13/2026')).toBeNull();
  });
});

describe('semanas de fecho', () => {
  it('a segunda-feira de qualquer dia da semana', () => {
    expect(mondayOf('2026-09-21')).toBe('2026-09-21'); // segunda
    expect(mondayOf('2026-09-24')).toBe('2026-09-21'); // quinta
    expect(mondayOf('2026-09-27')).toBe('2026-09-21'); // domingo
  });

  it('a Prio desconta na propria semana', () => {
    expect(settlementWeekOf('PRIO', '2026-09-23')).toBe('2026-09-21');
  });

  it('a Via Verde desconta na semana SEGUINTE', () => {
    // Portagem na semana de 14 a 20 → fecho da semana de 21 a 27.
    expect(settlementWeekOf('VIA_VERDE', '2026-09-14')).toBe('2026-09-21');
    expect(settlementWeekOf('VIA_VERDE', '2026-09-20')).toBe('2026-09-21');
  });

  it('o fecho de uma semana pede a Via Verde da anterior e a Prio da propria', () => {
    expect(movementRangeFor('VIA_VERDE', '2026-09-21')).toEqual({ from: '2026-09-14', to: '2026-09-20' });
    expect(movementRangeFor('PRIO', '2026-09-21')).toEqual({ from: '2026-09-21', to: '2026-09-27' });
  });

  it('as duas funcoes sao inversas uma da outra', () => {
    for (const source of ['PRIO', 'VIA_VERDE'] as const) {
      const { from, to } = movementRangeFor(source, '2026-09-21');
      expect(settlementWeekOf(source, from)).toBe('2026-09-21');
      expect(settlementWeekOf(source, to)).toBe('2026-09-21');
    }
  });
});

describe('categorias da Via Verde, com as descricoes das capturas', () => {
  it('entrada >> saida e portagem', () => {
    expect(categorizeViaVerde('Pontinha >> Belas PV')).toBe('TOLL');
    expect(categorizeViaVerde('V.F.Xira II SN >> Carregado')).toBe('TOLL');
  });

  it('mensalidade e adesao sao mensalidades', () => {
    expect(categorizeViaVerde('Mensalidade VV Mobilidade Mensal')).toBe('FEE');
    expect(categorizeViaVerde('Adesão VV Mobilidade Mensal')).toBe('FEE');
  });

  it('estacionamento', () => {
    expect(categorizeViaVerde('Parque Colombo')).toBe('PARKING');
  });

  it('o que nao se reconhece fica em OUTRO, e nao numa categoria errada', () => {
    expect(categorizeViaVerde('Venda Pinheiro')).toBe('OTHER');
  });
});

describe('o que se desconta', () => {
  it('portagens e estacionamento descontam-se', () => {
    expect(defaultChargeable('TOLL', null)).toBe(true);
    expect(defaultChargeable('PARKING', 'Pendente')).toBe(true);
    expect(defaultChargeable('FUEL', 'Ativo')).toBe(true);
  });

  it('a mensalidade do identificador fica na empresa por omissao', () => {
    expect(defaultChargeable('FEE', null)).toBe(false);
  });

  it('cancelados nao se descontam, seja qual for a categoria', () => {
    expect(isCancelledStatus('Cancelado')).toBe(true);
    expect(isCancelledStatus('Anulado')).toBe(true);
    expect(defaultChargeable('TOLL', 'Cancelado')).toBe(false);
  });

  it('pendentes descontam-se', () => {
    expect(isCancelledStatus('Pendente')).toBe(false);
    expect(defaultChargeable('TOLL', 'Pendente')).toBe(true);
  });
});

describe('chave de repeticao', () => {
  const quando = new Date('2026-09-23T22:20:00Z');

  it('na Prio usa o recibo quando existe', () => {
    expect(externalKey({ source: 'PRIO', occurredAt: quando, amount: 87.55, receipt: '001110', card: '7824000011112222' }))
      .toBe('PRIO|R|001110|7824000011112222');
  });

  it('o mesmo movimento da a mesma chave — reenviar nao duplica', () => {
    const a = externalKey({ source: 'VIA_VERDE', occurredAt: quando, amount: 1, identifier: '601000000011', description: 'Pontinha >> Belas PV' });
    const b = externalKey({ source: 'VIA_VERDE', occurredAt: quando, amount: 1, identifier: '601000000011', description: 'Pontinha >> Belas PV ' });
    expect(a).toBe(b);
  });

  it('valores diferentes dao chaves diferentes', () => {
    const a = externalKey({ source: 'VIA_VERDE', occurredAt: quando, amount: 1, identifier: 'X', description: 'D' });
    const b = externalKey({ source: 'VIA_VERDE', occurredAt: quando, amount: 1.5, identifier: 'X', description: 'D' });
    expect(a).not.toBe(b);
  });
});
