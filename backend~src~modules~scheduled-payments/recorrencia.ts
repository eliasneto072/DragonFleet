// src/modules/scheduled-payments/recorrencia.ts
//
// Quando é que um pagamento agendado se repete, e quando é que para.
//
// ─── PORQUE É QUE ISTO É UMA FUNÇÃO PURA ────────────────────────────────────
//
// Porque é a parte que tira dinheiro do saldo de alguém sem ninguém a olhar.
// Um engano aqui não dá erro nenhum: dá um desconto a mais, ou a menos, num mês
// qualquer, e só se descobre quando o motorista reclamar.
//
// Datas são o assunto onde o óbvio está errado mais vezes. 31 de janeiro mais
// um mês não é 31 de fevereiro. Um mês depois de 29 de fevereiro de um ano
// bissexto não existe no ano seguinte. Com isto fora da base de dados, cada um
// desses casos é um teste de três linhas em vez de uma noite a reproduzir.

/** As frequências, iguais às do schema. */
export type Frequencia =
  | 'UNICO' | 'SEMANAL' | 'QUINZENAL' | 'MENSAL'
  | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

/** Quantos meses avança cada frequência. Nulo para as que contam em dias. */
const MESES: Partial<Record<Frequencia, number>> = {
  MENSAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12,
};

/** Quantos dias avança cada frequência. Nulo para as que contam em meses. */
const DIAS: Partial<Record<Frequencia, number>> = {
  SEMANAL: 7, QUINZENAL: 14,
};

/** Só a parte do dia, em UTC. As datas destas tabelas são `@db.Date`. */
export function soDia(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** "2026-10-07" */
export const comoDia = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * A data seguinte, a partir de uma data e de uma frequência.
 *
 * ─── O PROBLEMA DO DIA 31 ───────────────────────────────────────────────────
 *
 * Um agendamento mensal que comece a 31 de janeiro: a 31 de fevereiro não
 * existe. A regra usada aqui é a mesma dos bancos e das rendas — cai no último
 * dia do mês. 31/jan → 28/fev (ou 29) → 31/mar.
 *
 * Repare que o mês seguinte volta ao dia 31, e não fica preso no 28. É por isso
 * que a conta é feita sempre a partir do DIA ORIGINAL (`diaPreferido`) e não da
 * última data lançada: encadear a partir do 28 arrastaria o agendamento para o
 * fim do mês para sempre, e a renda de dia 31 passaria a ser de dia 28.
 */
export function proximaData(
  atual: Date,
  frequencia: Frequencia,
  diaPreferido?: number,
): Date | null {
  if (frequencia === 'UNICO') return null;

  const base = soDia(atual);

  const dias = DIAS[frequencia];
  if (dias !== undefined) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + dias);
    return d;
  }

  const meses = MESES[frequencia];
  if (meses === undefined) return null;

  const dia = diaPreferido ?? base.getUTCDate();
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth() + meses;

  // Dia 0 do mês seguinte é o último dia deste. É a forma de perguntar
  // "quantos dias tem este mês" sem uma tabela e sem a regra dos bissextos.
  const ultimoDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();

  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDoMes)));
}

/** O estado de um agendamento, na parte que interessa a estas decisões. */
export interface Agendamento {
  frequency: Frequencia;
  startsOn: Date;
  nextRunOn: Date | null;
  endsOn: Date | null;
  remaining: number | null;
  active: boolean;
  runCount: number;
}

/** O que fazer a um agendamento numa dada passagem do job. */
export interface Decisao {
  /** Quantos lançamentos fazer AGORA, e em que datas. */
  lancarEm: Date[];
  /** Como fica o agendamento depois. */
  proximo: { nextRunOn: Date | null; remaining: number | null; active: boolean };
}

/**
 * O que o job deve fazer a este agendamento, correndo em `hoje`.
 *
 * ─── PORQUE É QUE DEVOLVE UMA LISTA DE DATAS ────────────────────────────────
 *
 * Porque uma execução pode ter de pagar mais do que uma. Se o servidor esteve
 * em baixo três dias, ou se o agendamento foi criado com uma data de início no
 * passado, há lançamentos em atraso — e saltá-los seria perder dinheiro sem
 * nada a dizê-lo.
 *
 * ─── O TETO DE SEGURANÇA ────────────────────────────────────────────────────
 *
 * `MAX_POR_PASSAGEM` existe porque um engano na data de início — 2020 em vez de
 * 2026 — geraria setenta descontos de uma vez na conta de alguém. Com o teto,
 * gera doze, alguém repara, e o resto fica para o dia seguinte. O limite não
 * perde nada: o que sobra continua vencido e sai na passagem seguinte.
 */
const MAX_POR_PASSAGEM = 12;

export function decidir(a: Agendamento, hoje: Date): Decisao {
  const dia = soDia(hoje);
  const parado = { nextRunOn: null, remaining: a.remaining, active: false };

  if (!a.active) {
    return { lancarEm: [], proximo: { nextRunOn: a.nextRunOn, remaining: a.remaining, active: false } };
  }

  // Sem `nextRunOn` gravada, o primeiro lançamento é na data de início. É o
  // caso de um agendamento acabado de criar.
  let proxima: Date | null = a.nextRunOn ? soDia(a.nextRunOn) : soDia(a.startsOn);
  let restam = a.remaining;

  // O dia do mês ORIGINAL, para o 31 não ficar preso no 28 — ver `proximaData`.
  const diaPreferido = soDia(a.startsOn).getUTCDate();

  const lancarEm: Date[] = [];

  while (proxima && proxima.getTime() <= dia.getTime()) {
    // Passou do fim marcado: não lança e desliga-se.
    if (a.endsOn && proxima.getTime() > soDia(a.endsOn).getTime()) {
      return { lancarEm, proximo: parado };
    }
    // Já fez as vezes todas.
    if (restam !== null && restam <= 0) {
      return { lancarEm, proximo: { ...parado, remaining: 0 } };
    }

    lancarEm.push(proxima);
    if (restam !== null) restam -= 1;

    proxima = proximaData(proxima, a.frequency, diaPreferido);

    if (lancarEm.length >= MAX_POR_PASSAGEM) break;
  }

  // Esgotou as repetições, ou era de uma vez só.
  if (proxima === null || (restam !== null && restam <= 0)) {
    return { lancarEm, proximo: { nextRunOn: null, remaining: restam, active: false } };
  }

  // A próxima já caiu para lá do fim marcado: fica agendada à mesma? Não —
  // desliga-se já, para o ecrã não mostrar uma data que nunca vai acontecer.
  if (a.endsOn && proxima.getTime() > soDia(a.endsOn).getTime()) {
    return { lancarEm, proximo: { nextRunOn: null, remaining: restam, active: false } };
  }

  return { lancarEm, proximo: { nextRunOn: proxima, remaining: restam, active: true } };
}

/**
 * A primeira data de um agendamento acabado de criar.
 *
 * Separada de `decidir` porque quem cria precisa de a gravar sem correr o job,
 * e porque um agendamento criado com data de HOJE deve lançar hoje — não
 * amanhã.
 */
export function primeiraData(startsOn: Date): Date {
  return soDia(startsOn);
}
