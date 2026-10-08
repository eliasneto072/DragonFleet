// src/modules/scheduled-payments/recorrencia.test.ts
//
// Datas de repetição, e quando parar.
//
// Isto tira dinheiro do saldo de alguém sem ninguém a olhar. Um engano não dá
// erro: dá um desconto a mais num mês qualquer, e descobre-se quando o
// motorista reclamar. Por isso os casos difíceis estão todos aqui — dia 31,
// fevereiro, anos bissextos, servidor em baixo, e a data de início escrita com
// o ano errado.

import { describe, it, expect } from 'vitest';
import { proximaData, decidir, comoDia, type Agendamento } from './recorrencia';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const base: Agendamento = {
  frequency: 'MENSAL',
  startsOn: d('2026-01-10'),
  nextRunOn: d('2026-01-10'),
  endsOn: null,
  remaining: null,
  active: true,
  runCount: 0,
};

// ═══════════════════════════════════════════════════════════════════════════
describe('a próxima data', () => {
  it('soma os dias certos nas frequências curtas', () => {
    expect(comoDia(proximaData(d('2026-01-10'), 'SEMANAL')!)).toBe('2026-01-17');
    expect(comoDia(proximaData(d('2026-01-10'), 'QUINZENAL')!)).toBe('2026-01-24');
  });

  it('soma os meses certos nas longas', () => {
    expect(comoDia(proximaData(d('2026-01-10'), 'MENSAL')!)).toBe('2026-02-10');
    expect(comoDia(proximaData(d('2026-01-10'), 'TRIMESTRAL')!)).toBe('2026-04-10');
    expect(comoDia(proximaData(d('2026-01-10'), 'SEMESTRAL')!)).toBe('2026-07-10');
    expect(comoDia(proximaData(d('2026-01-10'), 'ANUAL')!)).toBe('2027-01-10');
  });

  it('um pagamento único não tem próxima', () => {
    expect(proximaData(d('2026-01-10'), 'UNICO')).toBe(null);
  });

  it('atravessa o fim do ano', () => {
    expect(comoDia(proximaData(d('2026-12-15'), 'MENSAL')!)).toBe('2027-01-15');
  });

  // ─── O caso que parte a maioria das implementações ──────────────────────
  it('dia 31 em fevereiro cai no último dia do mês', () => {
    expect(comoDia(proximaData(d('2026-01-31'), 'MENSAL', 31)!)).toBe('2026-02-28');
  });

  it('e num ano bissexto cai a 29', () => {
    // 2028 é bissexto.
    expect(comoDia(proximaData(d('2028-01-31'), 'MENSAL', 31)!)).toBe('2028-02-29');
  });

  it('depois de fevereiro VOLTA ao dia 31, não fica preso no 28', () => {
    // Este é o que interessa de verdade: encadear a partir do 28 arrastava a
    // renda de dia 31 para dia 28 e nunca mais voltava.
    expect(comoDia(proximaData(d('2026-02-28'), 'MENSAL', 31)!)).toBe('2026-03-31');
  });

  it('29 de fevereiro mais um ano cai a 28', () => {
    expect(comoDia(proximaData(d('2028-02-29'), 'ANUAL', 29)!)).toBe('2029-02-28');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('o que o job decide fazer', () => {
  it('não lança nada antes da data', () => {
    const r = decidir(base, d('2026-01-09'));
    expect(r.lancarEm).toHaveLength(0);
    expect(r.proximo.active).toBe(true);
  });

  it('lança no próprio dia', () => {
    const r = decidir(base, d('2026-01-10'));
    expect(r.lancarEm.map(comoDia)).toEqual(['2026-01-10']);
    expect(comoDia(r.proximo.nextRunOn!)).toBe('2026-02-10');
  });

  it('um agendamento desligado não lança nada', () => {
    const r = decidir({ ...base, active: false }, d('2026-06-10'));
    expect(r.lancarEm).toHaveLength(0);
  });

  // ─── Servidor em baixo ──────────────────────────────────────────────────
  it('recupera os lançamentos em atraso', () => {
    // O job não correu durante três meses. Os três têm de sair, senão o
    // dinheiro desaparece sem nada a dizê-lo.
    const r = decidir(base, d('2026-04-10'));
    expect(r.lancarEm.map(comoDia)).toEqual([
      '2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10',
    ]);
    expect(comoDia(r.proximo.nextRunOn!)).toBe('2026-05-10');
  });

  it('mas nunca mais de doze de uma vez', () => {
    // A data de início com o ano errado — 2020 em vez de 2026 — geraria
    // setenta descontos de uma vez. Com o teto, alguém repara primeiro.
    const r = decidir({ ...base, startsOn: d('2020-01-10'), nextRunOn: d('2020-01-10') }, d('2026-04-10'));
    expect(r.lancarEm).toHaveLength(12);
    expect(r.proximo.active).toBe(true);   // o resto sai amanhã
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('quando é que para', () => {
  it('um único lança uma vez e desliga-se', () => {
    const r = decidir({ ...base, frequency: 'UNICO' }, d('2026-01-10'));
    expect(r.lancarEm.map(comoDia)).toEqual(['2026-01-10']);
    expect(r.proximo.active).toBe(false);
    expect(r.proximo.nextRunOn).toBe(null);
  });

  it('a multa em 6 prestações faz exatamente seis', () => {
    let a: Agendamento = { ...base, remaining: 6 };
    const saidas: string[] = [];

    // Doze meses de execuções, uma por mês.
    for (let m = 0; m < 12; m += 1) {
      const hoje = new Date(Date.UTC(2026, m, 10));
      const r = decidir(a, hoje);
      saidas.push(...r.lancarEm.map(comoDia));
      a = { ...a, ...r.proximo, runCount: a.runCount + r.lancarEm.length };
    }

    expect(saidas).toHaveLength(6);
    expect(saidas[0]).toBe('2026-01-10');
    expect(saidas[5]).toBe('2026-06-10');
    expect(a.active).toBe(false);
  });

  it('para na data de fim, sem lançar depois dela', () => {
    let a: Agendamento = { ...base, endsOn: d('2026-03-31') };
    const saidas: string[] = [];
    for (let m = 0; m < 6; m += 1) {
      const r = decidir(a, new Date(Date.UTC(2026, m, 10)));
      saidas.push(...r.lancarEm.map(comoDia));
      a = { ...a, ...r.proximo };
    }
    expect(saidas).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
    expect(a.active).toBe(false);
  });

  it('a data de fim trava mesmo com recuperação de atrasados', () => {
    // Correr só em junho, com fim em março: só os três de antes do fim saem.
    const r = decidir({ ...base, endsOn: d('2026-03-31') }, d('2026-06-10'));
    expect(r.lancarEm.map(comoDia)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
    expect(r.proximo.active).toBe(false);
  });

  it('desliga-se mal a próxima caia para lá do fim', () => {
    // Sem isto, o ecrã mostrava uma próxima data que nunca ia acontecer.
    const r = decidir({ ...base, endsOn: d('2026-02-01') }, d('2026-01-10'));
    expect(r.lancarEm.map(comoDia)).toEqual(['2026-01-10']);
    expect(r.proximo.nextRunOn).toBe(null);
    expect(r.proximo.active).toBe(false);
  });
});
