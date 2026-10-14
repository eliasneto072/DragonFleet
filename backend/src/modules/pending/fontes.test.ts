// src/modules/pending/fontes.test.ts
//
// As três formas de isto falhar em silêncio: um contador a aparecer a quem não
// vê a área, um informativo a acender o menu para sempre, e um atraso contado
// ao contrário. Nenhuma dá erro — todas dão um número errado.

import { describe, it, expect } from 'vitest';
import {
  diasDesde, estaAtrasado, fontesVisiveis, resumoPorArea, ordenar, totalPorFazer,
  DIAS_PARA_ATRASO, FONTES, type Fonte,
} from './fontes';

const AGORA = new Date('2026-10-09T12:00:00.000Z').getTime();
const diasAtras = (n: number) => new Date(AGORA - n * 86_400_000).toISOString();

function fonte(p: Partial<Fonte> & Pick<Fonte, 'key' | 'area' | 'nivel'>): Fonte {
  return { count: 1, oldestAt: null, late: false, ...p };
}

describe('diasDesde', () => {
  it('conta dias inteiros', () => {
    expect(diasDesde(diasAtras(0), AGORA)).toBe(0);
    expect(diasDesde(diasAtras(1), AGORA)).toBe(1);
    expect(diasDesde(diasAtras(9), AGORA)).toBe(9);
  });

  it('uma data no futuro é zero e não um número negativo', () => {
    // Acontece com relógios dessincronizados. Um negativo mandava o item para
    // o fim da ordenação como se não tivesse idade.
    expect(diasDesde(new Date(AGORA + 86_400_000).toISOString(), AGORA)).toBe(0);
  });

  it('sem data, não há idade', () => {
    expect(diasDesde(null, AGORA)).toBeNull();
    expect(diasDesde('isto não é uma data', AGORA)).toBeNull();
  });
});

describe('estaAtrasado', () => {
  it('ao terceiro dia ainda não está; ao quarto está', () => {
    expect(estaAtrasado(diasAtras(DIAS_PARA_ATRASO), AGORA)).toBe(false);
    expect(estaAtrasado(diasAtras(DIAS_PARA_ATRASO + 1), AGORA)).toBe(true);
  });

  it('sem data não está atrasado', () => {
    expect(estaAtrasado(null, AGORA)).toBe(false);
  });

  it('o forçado ganha sempre — uma inspeção fora de prazo arde no primeiro dia', () => {
    expect(estaAtrasado(null, AGORA, true)).toBe(true);
    expect(estaAtrasado(diasAtras(0), AGORA, true)).toBe(true);
  });
});

describe('fontesVisiveis', () => {
  it('esconde a área a que a pessoa não tem acesso', () => {
    const fontes = [
      fonte({ key: 'supportOpen', area: 'SUPPORT', nivel: 'resolve' }),
      fonte({ key: 'withdrawalsPending', area: 'FINANCIAL', nivel: 'open' }),
    ];
    const vistos = fontesVisiveis(fontes, { SUPPORT: 'VIEW' });
    expect(vistos).toHaveLength(1);
    expect(vistos[0].key).toBe('supportOpen');
  });

  it('uma fonte que exige MANAGE não aparece a quem só tem VIEW', () => {
    // O caso concreto: mostrar "4 IBANs por aprovar" a quem só pode olhar
    // mandava-o a um ecrã onde o botão de aprovar está desligado.
    const fontes = [fonte({ key: 'bankPending', area: 'FINANCIAL', nivel: 'open' })];
    expect(fontesVisiveis(fontes, { FINANCIAL: 'VIEW' })).toHaveLength(0);
    expect(fontesVisiveis(fontes, { FINANCIAL: 'MANAGE' })).toHaveLength(1);
  });

  it('sem acessos nenhuns, não vê nada', () => {
    const fontes = [fonte({ key: 'supportOpen', area: 'SUPPORT', nivel: 'resolve' })];
    expect(fontesVisiveis(fontes, {})).toHaveLength(0);
  });

  it('o suporte de tickets basta VIEW — é onde se responde', () => {
    const fontes = [fonte({ key: 'supportOpen', area: 'SUPPORT', nivel: 'resolve' })];
    expect(fontesVisiveis(fontes, { SUPPORT: 'VIEW' })).toHaveLength(1);
  });
});

describe('resumoPorArea', () => {
  it('soma as fontes da mesma área', () => {
    const r = resumoPorArea([
      fonte({ key: 'bookingsPropostas', area: 'FLEET', nivel: 'resolve', count: 2 }),
      fonte({ key: 'inspections', area: 'FLEET', nivel: 'open', count: 3 }),
    ]);
    expect(r.FLEET).toEqual({ count: 5, late: false });
  });

  it('um atrasado basta para a área ficar em atraso', () => {
    const r = resumoPorArea([
      fonte({ key: 'bookingsPropostas', area: 'FLEET', nivel: 'resolve', count: 1 }),
      fonte({ key: 'inspections', area: 'FLEET', nivel: 'open', count: 1, late: true }),
    ]);
    expect(r.FLEET).toEqual({ count: 2, late: true });
  });

  it('os informativos NÃO contam para o número do menu', () => {
    // O caso que isto existe para evitar: o saldo negativo regulariza-se no
    // próximo fecho, e até lá acendia o menu todos os dias.
    const r = resumoPorArea([
      fonte({ key: 'negativeDrivers', area: 'FINANCIAL', nivel: 'inform', count: 7 }),
    ]);
    expect(r.FINANCIAL).toBeUndefined();
  });

  it('uma fonte a zero não deixa a área no resultado', () => {
    const r = resumoPorArea([
      fonte({ key: 'supportOpen', area: 'SUPPORT', nivel: 'resolve', count: 0 }),
    ]);
    expect(r.SUPPORT).toBeUndefined();
  });

  it('os informativos não apagam o que a mesma área tem por fazer', () => {
    const r = resumoPorArea([
      fonte({ key: 'withdrawalsPending', area: 'FINANCIAL', nivel: 'open', count: 2 }),
      fonte({ key: 'negativeDrivers', area: 'FINANCIAL', nivel: 'inform', count: 7 }),
    ]);
    expect(r.FINANCIAL).toEqual({ count: 2, late: false });
  });
});

describe('ordenar', () => {
  it('quem espera há mais tempo vem primeiro', () => {
    const r = ordenar([
      fonte({ key: 'supportOpen', area: 'SUPPORT', nivel: 'resolve', oldestAt: diasAtras(1) }),
      fonte({ key: 'documentsPending', area: 'DOCUMENTS', nivel: 'open', oldestAt: diasAtras(6) }),
    ], AGORA);
    expect(r[0].key).toBe('documentsPending');
  });

  it('quem não tem idade vai para o fim', () => {
    const r = ordenar([
      fonte({ key: 'materialsLow', area: 'FLEET', nivel: 'open', oldestAt: null }),
      fonte({ key: 'supportOpen', area: 'SUPPORT', nivel: 'resolve', oldestAt: diasAtras(0) }),
    ], AGORA);
    expect(r[0].key).toBe('supportOpen');
  });

  it('não mexe no array que recebe', () => {
    const original = [
      fonte({ key: 'supportOpen', area: 'SUPPORT', nivel: 'resolve', oldestAt: diasAtras(1) }),
      fonte({ key: 'documentsPending', area: 'DOCUMENTS', nivel: 'open', oldestAt: diasAtras(6) }),
    ];
    ordenar(original, AGORA);
    expect(original[0].key).toBe('supportOpen');
  });
});

describe('totalPorFazer', () => {
  it('soma tudo o que pede ação e ignora os informativos', () => {
    expect(totalPorFazer([
      fonte({ key: 'supportOpen', area: 'SUPPORT', nivel: 'resolve', count: 2 }),
      fonte({ key: 'documentsPending', area: 'DOCUMENTS', nivel: 'open', count: 3 }),
      fonte({ key: 'driversBlocked', area: 'DRIVERS', nivel: 'inform', count: 9 }),
    ])).toBe(5);
  });

  it('nada por fazer é zero', () => {
    expect(totalPorFazer([])).toBe(0);
  });
});

describe('os pedidos de esclarecimento na fila', () => {
  it('são da Faturação, pedem decisão, e bastam VIEW para os ver', () => {
    // VIEW e não MANAGE: responder exige MANAGE, mas o SUPPORT precisa de
    // SABER que a pergunta existe — é a ele que ela chega primeiro.
    expect(FONTES.settlementQueries).toEqual({
      area: 'SETTLEMENTS', nivel: 'resolve', minimo: 'VIEW',
    });
  });

  it('contam para o número do menu — não são informativos', () => {
    // Um informativo não acenderia o menu, e uma pessoa ficava à espera de
    // uma resposta sobre o dinheiro dela sem ninguém saber.
    expect(totalPorFazer([
      fonte({ key: 'settlementQueries', area: 'SETTLEMENTS', nivel: 'resolve', count: 2 }),
    ])).toBe(2);
  });

  it('o suporte vê-os; quem não tem a área não', () => {
    const f = [fonte({ key: 'settlementQueries', area: 'SETTLEMENTS', nivel: 'resolve' })];
    expect(fontesVisiveis(f, { SETTLEMENTS: 'VIEW' })).toHaveLength(1);
    expect(fontesVisiveis(f, { FLEET: 'MANAGE' })).toHaveLength(0);
  });
});
