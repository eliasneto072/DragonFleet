// src/modules/system/assinatura.test.ts
//
// Contas de datas erram em silêncio: uma renovação que começa no dia errado dá
// uma frota com menos três dias do que pagou, e ninguém dá por nada até alguém
// reclamar. São três linhas por caso — e é por isso que vivem fora do serviço.

import { describe, it, expect } from 'vitest';
import {
  situacao, podeTrabalhar, renovar, doTexto, paraTexto, soDia, DIAS_DE_AVISO,
} from './assinatura';

const HOJE = new Date('2026-10-09T15:30:00.000Z');
const dia = (s: string) => doTexto(s)!;

describe('situacao', () => {
  it('sem data é "sem assinatura", e NÃO é expirada', () => {
    // É o estado da frota do próprio dono, que não paga a ninguém. Tratá-los
    // como a mesma coisa trancava-o fora da casa dele.
    expect(situacao(null, HOJE)).toEqual({ estado: 'sem_assinatura', dias: null });
    expect(podeTrabalhar(null, HOJE)).toBe(true);
  });

  it('o último dia ainda conta como pago', () => {
    const r = situacao(dia('2026-10-09'), HOJE);
    expect(r.estado).toBe('termina_em_breve');
    expect(r.dias).toBe(0);
    expect(podeTrabalhar(dia('2026-10-09'), HOJE)).toBe(true);
  });

  it('o dia seguinte ao fim já está expirado', () => {
    const r = situacao(dia('2026-10-08'), HOJE);
    expect(r.estado).toBe('expirada');
    expect(r.dias).toBe(-1);
    expect(podeTrabalhar(dia('2026-10-08'), HOJE)).toBe(false);
  });

  it('avisa na última semana', () => {
    expect(situacao(dia('2026-10-16'), HOJE).estado).toBe('termina_em_breve');
    expect(situacao(dia('2026-10-16'), HOJE).dias).toBe(DIAS_DE_AVISO);
  });

  it('com mais de uma semana, está simplesmente activa', () => {
    const r = situacao(dia('2026-10-17'), HOJE);
    expect(r.estado).toBe('activa');
    expect(r.dias).toBe(8);
  });

  it('a hora do dia não conta', () => {
    // A assinatura é em dias inteiros. Sem isto, renovar de manhã e renovar à
    // noite davam resultados diferentes.
    const manha = new Date('2026-10-09T00:01:00.000Z');
    const noite = new Date('2026-10-09T23:59:00.000Z');
    expect(situacao(dia('2026-10-09'), manha).dias).toBe(0);
    expect(situacao(dia('2026-10-09'), noite).dias).toBe(0);
  });
});

describe('renovar', () => {
  it('dentro do prazo, soma ao fim que já tinha', () => {
    // Quem renova três dias antes não perde esses três dias.
    expect(paraTexto(renovar(dia('2026-10-12'), 30, HOJE))).toBe('2026-11-11');
  });

  it('fora do prazo, conta a partir de hoje', () => {
    // Uma frota parada há dois meses não paga esses dois meses ao renovar.
    expect(paraTexto(renovar(dia('2026-08-01'), 30, HOJE))).toBe('2026-11-08');
  });

  it('a acabar hoje, soma a hoje — o último dia ainda era dela', () => {
    expect(paraTexto(renovar(dia('2026-10-09'), 30, HOJE))).toBe('2026-11-08');
  });

  it('a primeira assinatura conta a partir de hoje', () => {
    expect(paraTexto(renovar(null, 30, HOJE))).toBe('2026-11-08');
  });

  it('as durações habituais', () => {
    expect(paraTexto(renovar(null, 90, HOJE))).toBe('2027-01-07');
    expect(paraTexto(renovar(null, 180, HOJE))).toBe('2027-04-07');
    expect(paraTexto(renovar(null, 365, HOJE))).toBe('2027-10-09');
  });

  it('atravessa o fim do ano sem se perder', () => {
    expect(paraTexto(renovar(dia('2026-12-20'), 30, dia('2026-12-15')))).toBe('2027-01-19');
  });

  it('recusa uma duração que não é duração', () => {
    expect(() => renovar(null, 0, HOJE)).toThrow();
    expect(() => renovar(null, -30, HOJE)).toThrow();
  });
});

describe('doTexto e paraTexto', () => {
  it('ida e volta sem perder o dia', () => {
    expect(paraTexto(dia('2026-01-01'))).toBe('2026-01-01');
    expect(paraTexto(dia('2026-12-31'))).toBe('2026-12-31');
    expect(paraTexto(dia('2028-02-29'))).toBe('2028-02-29'); // 2028 é bissexto
  });

  it('uma data que não existe é recusada, não corrigida', () => {
    // O `Date` aceitava 29 de fevereiro de 2026 e devolvia 1 de março. Numa
    // assinatura isso é um dia escrito em silêncio por cima do que se pediu.
    expect(doTexto('2026-02-29')).toBeNull();
    expect(doTexto('2026-13-01')).toBeNull();
    expect(doTexto('2026-04-31')).toBeNull();
  });

  it('texto que não é data dá nulo', () => {
    expect(doTexto('09/10/2026')).toBeNull();
    expect(doTexto('')).toBeNull();
    expect(doTexto(null)).toBeNull();
  });

  it('soDia deita fora as horas', () => {
    expect(paraTexto(soDia(new Date('2026-10-09T23:59:59.999Z')))).toBe('2026-10-09');
  });
});
