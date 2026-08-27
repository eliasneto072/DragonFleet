// src/shared/utils/week.test.ts
//
// Os casos vêm das capturas reais dos portais que o cliente enviou, e não de
// datas inventadas. É a diferença entre testar a função e testar o problema.

import { describe, it, expect } from 'vitest';
import { startOfWeek, endOfWeek, sameWeek, toDayString, suggestWeek } from './week';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('startOfWeek', () => {
  it('devolve a propria data quando ja e segunda', () => {
    expect(toDayString(startOfWeek(d('2026-08-17')))).toBe('2026-08-17');
  });

  it('recua ate a segunda a partir de um dia no meio da semana', () => {
    expect(toDayString(startOfWeek(d('2026-08-13')))).toBe('2026-08-10');
  });

  it('trata o domingo como FIM da semana e nao como inicio', () => {
    // O caso que parte com getUTCDay() cru: domingo devolve 0, e sem o
    // tratamento a semana começaria nele em vez de acabar.
    expect(toDayString(startOfWeek(d('2026-08-16')))).toBe('2026-08-10');
  });

  it('atravessa a mudanca de mes', () => {
    expect(toDayString(startOfWeek(d('2026-09-02')))).toBe('2026-08-31');
  });
});

describe('endOfWeek', () => {
  it('devolve o domingo que fecha a semana', () => {
    expect(toDayString(endOfWeek(d('2026-08-13')))).toBe('2026-08-16');
  });

  it('a semana tem exatamente sete dias', () => {
    const ini = startOfWeek(d('2026-08-13'));
    const fim = endOfWeek(d('2026-08-13'));
    expect((fim.getTime() - ini.getTime()) / 86_400_000).toBe(6);
  });
});

describe('sameWeek — os periodos reais dos portais', () => {
  it('RECUSA o "Last 7 days" da Bolt: 11 a 17 de agosto atravessa duas semanas', () => {
    // O caso concreto da captura. 11/08/2026 é terça, 17/08 é a segunda
    // seguinte: seis dias numa semana de fecho e um noutra. Atribuir este
    // total a qualquer uma delas mete lá um dia que não lhe pertence.
    expect(sameWeek(d('2026-08-11'), d('2026-08-17'))).toBe(false);
  });

  it('ACEITA o periodo da Uber: 17 a 18 de agosto cabe numa semana', () => {
    expect(sameWeek(d('2026-08-17'), d('2026-08-18'))).toBe(true);
  });

  it('aceita uma semana certa de segunda a domingo', () => {
    expect(sameWeek(d('2026-08-10'), d('2026-08-16'))).toBe(true);
  });

  it('recusa domingo e a segunda seguinte, que sao semanas diferentes', () => {
    expect(sameWeek(d('2026-08-16'), d('2026-08-17'))).toBe(false);
  });
});

describe('suggestWeek', () => {
  it('sugere a semana certa a partir de um periodo mal escolhido', () => {
    // O que a mensagem de erro mostra a quem escolheu mal o intervalo no
    // portal: em vez de "o período está errado", diz qual usar.
    expect(suggestWeek(d('2026-08-11'))).toEqual({ from: '2026-08-10', to: '2026-08-16' });
  });
});
