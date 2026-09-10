// src/modules/vehicles/assignment-lookup.test.ts

import { describe, it, expect } from 'vitest';
import { plateCandidates, resolveWindow, overlapsWindow } from './assignment-lookup';

describe('plateCandidates', () => {
  it('gera a forma com tracos a partir da forma sem tracos', () => {
    expect(plateCandidates('AA00BB')).toContain('AA-00-BB');
  });

  it('gera a forma sem tracos a partir da forma com tracos', () => {
    expect(plateCandidates('AA-00-BB')).toContain('AA00BB');
  });

  it('sobe as minusculas — quem copia de uma multa nem sempre repara', () => {
    const c = plateCandidates('aa-00-bb');
    expect(c).toContain('AA-00-BB');
    expect(c).toContain('AA00BB');
  });

  it('aguenta espacos no meio e a volta', () => {
    expect(plateCandidates('  AA 00 BB ')).toContain('AA-00-BB');
  });

  it('mantem o que veio, para o caso de estar gravado num formato que nao prevemos', () => {
    expect(plateCandidates('AA-00-BB')).toContain('AA-00-BB');
  });

  it('nao inventa tracos em matriculas que nao tem seis caracteres', () => {
    const c = plateCandidates('ABC1234');
    expect(c.some((p) => p.includes('-'))).toBe(false);
  });

  it('nao repete quando as variantes coincidem', () => {
    const c = plateCandidates('AA00BB');
    expect(new Set(c).size).toBe(c.length);
  });

  it('devolve lista vazia para entrada vazia — nao vale a pena ir a base', () => {
    expect(plateCandidates('')).toEqual([]);
    expect(plateCandidates('   ')).toEqual([]);
  });
});

describe('resolveWindow', () => {
  it('sem data de fim, a janela e o proprio dia', () => {
    const w = resolveWindow('2026-03-05');
    expect(w.from.toISOString()).toBe('2026-03-05T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-03-05T23:59:59.999Z');
  });

  it('com data de fim, apanha o dia inteiro do fim', () => {
    const w = resolveWindow('2026-03-01', '2026-03-05');
    expect(w.from.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-03-05T23:59:59.999Z');
  });
});

describe('overlapsWindow', () => {
  const dia = resolveWindow('2026-03-05');
  const d = (iso: string) => new Date(iso);

  it('atribuicao ainda aberta que comecou antes conta', () => {
    expect(
      overlapsWindow({ startedAt: d('2026-01-10T09:00:00Z'), endedAt: null }, dia),
    ).toBe(true);
  });

  it('atribuicao fechada que envolve o dia conta', () => {
    expect(
      overlapsWindow(
        { startedAt: d('2026-03-01T09:00:00Z'), endedAt: d('2026-03-20T18:00:00Z') },
        dia,
      ),
    ).toBe(true);
  });

  it('atribuicao que acabou antes do dia nao conta', () => {
    expect(
      overlapsWindow(
        { startedAt: d('2026-01-01T09:00:00Z'), endedAt: d('2026-03-04T18:00:00Z') },
        dia,
      ),
    ).toBe(false);
  });

  it('atribuicao que so comecou depois do dia nao conta', () => {
    expect(
      overlapsWindow({ startedAt: d('2026-03-06T09:00:00Z'), endedAt: null }, dia),
    ).toBe(false);
  });

  it('comecou nesse mesmo dia, ainda aberta — conta', () => {
    expect(
      overlapsWindow({ startedAt: d('2026-03-05T14:00:00Z'), endedAt: null }, dia),
    ).toBe(true);
  });

  it('acabou nesse mesmo dia — conta, o carro esteve com ele parte do dia', () => {
    expect(
      overlapsWindow(
        { startedAt: d('2026-02-01T09:00:00Z'), endedAt: d('2026-03-05T11:00:00Z') },
        dia,
      ),
    ).toBe(true);
  });

  it('acabou a meia-noite exata do dia — mostramos na mesma, por seguranca', () => {
    expect(
      overlapsWindow(
        { startedAt: d('2026-02-01T09:00:00Z'), endedAt: d('2026-03-05T00:00:00.000Z') },
        dia,
      ),
    ).toBe(true);
  });

  it('duas atribuicoes no mesmo dia aparecem as duas — o carro trocou de maos', () => {
    const manha = { startedAt: d('2026-01-01T00:00:00Z'), endedAt: d('2026-03-05T12:00:00Z') };
    const tarde = { startedAt: d('2026-03-05T12:00:00Z'), endedAt: null };
    expect(overlapsWindow(manha, dia)).toBe(true);
    expect(overlapsWindow(tarde, dia)).toBe(true);
  });

  it('num intervalo, apanha quem so la esteve no meio', () => {
    const semana = resolveWindow('2026-03-01', '2026-03-07');
    expect(
      overlapsWindow(
        { startedAt: d('2026-03-03T09:00:00Z'), endedAt: d('2026-03-04T18:00:00Z') },
        semana,
      ),
    ).toBe(true);
  });
});
