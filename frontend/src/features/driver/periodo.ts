// src/features/driver/periodo.ts
//
// O período que se está a ver: esta semana, este mês, este ano, ou um
// intervalo escolhido à mão.
//
// ─── PORQUE É QUE ISTO É UMA FUNÇÃO PURA ────────────────────────────────────
//
// Porque datas são o sítio onde o software mente com mais confiança. «Esta
// semana» começa à segunda em Portugal e ao domingo em metade das bibliotecas;
// o último dia do mês é 28, 29, 30 ou 31; e um intervalo que exclua o último
// dia esconde as despesas de hoje sem nada a dizer porquê.
//
// Nenhuma destas coisas se descobre a clicar: descobre-se quando um total não
// bate certo, meses depois, e já ninguém se lembra porquê.
//
// ─── TUDO EM UTC, E COMPARADO POR DIA ───────────────────────────────────────
//
// As datas que vêm do servidor são dias (`@db.Date`), sem hora. Comparar um
// dia com um instante local põe as despesas de dia 1 em Setembro ou Outubro
// conforme o fuso de quem está a olhar.

export type Preset = 'semana' | 'mes' | 'ano' | 'tudo' | 'personalizado';

export interface Periodo {
  /** Inclusivo. `null` em «tudo». */
  de: string | null;
  /** INCLUSIVO — ver a nota em `dentroDoPeriodo`. `null` em «tudo». */
  ate: string | null;
}

/** "2026-10-14" a partir de uma Date, em UTC. */
export function paraDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Só a parte do dia, venha a data como vier (ISO completo ou já só o dia). */
export function diaDe(valor: string): string {
  return valor.slice(0, 10);
}

/**
 * O período de um preset, a partir de um dia de referência.
 *
 * `hoje` é um parâmetro e não `new Date()` lá dentro: é o que torna isto
 * testável sem esperar pela próxima segunda-feira.
 */
export function periodoDe(preset: Preset, hoje: Date = new Date()): Periodo {
  const ano = hoje.getUTCFullYear();
  const mes = hoje.getUTCMonth();
  const dia = hoje.getUTCDate();

  if (preset === 'tudo' || preset === 'personalizado') {
    return { de: null, ate: null };
  }

  if (preset === 'ano') {
    return {
      de: paraDia(new Date(Date.UTC(ano, 0, 1))),
      ate: paraDia(new Date(Date.UTC(ano, 11, 31))),
    };
  }

  if (preset === 'mes') {
    // Dia 0 do mês seguinte é o último deste. Escrever 28, 30 ou 31 à mão
    // falha em Fevereiro, e falha de forma diferente nos anos bissextos.
    return {
      de: paraDia(new Date(Date.UTC(ano, mes, 1))),
      ate: paraDia(new Date(Date.UTC(ano, mes + 1, 0))),
    };
  }

  // Semana: de segunda a domingo, como em Portugal.
  //
  // `getUTCDay()` devolve 0 ao domingo. O `+ 6) % 7` roda a semana para a
  // segunda ser 0 — sem isso, ao domingo a «semana atual» começava no dia
  // seguinte e o período ficava vazio.
  const recuo = (new Date(Date.UTC(ano, mes, dia)).getUTCDay() + 6) % 7;
  const segunda = new Date(Date.UTC(ano, mes, dia - recuo));
  const domingo = new Date(Date.UTC(ano, mes, dia - recuo + 6));
  return { de: paraDia(segunda), ate: paraDia(domingo) };
}

/**
 * A data cai dentro do período?
 *
 * Os dois extremos são INCLUSIVOS. Com o fim exclusivo, «este mês» acabava a
 * 30 e as despesas do dia 31 desapareciam da conta — e o total aparecia mais
 * baixo sem nada a explicar.
 */
export function dentroDoPeriodo(data: string, p: Periodo): boolean {
  const d = diaDe(data);
  if (p.de && d < p.de) return false;
  if (p.ate && d > p.ate) return false;
  return true;
}

/** Filtra uma lista por um campo de data. */
export function filtrarPorPeriodo<T>(
  linhas: readonly T[],
  campo: (linha: T) => string,
  p: Periodo,
): T[] {
  if (!p.de && !p.ate) return [...linhas];
  return linhas.filter((l) => dentroDoPeriodo(campo(l), p));
}

/** Como se escreve o período, para o mostrar ao lado do filtro. */
export function descreverPeriodo(p: Periodo): string {
  if (!p.de && !p.ate) return 'Desde sempre';
  const pt = (d: string) => d.split('-').reverse().join('/');
  if (p.de && p.ate) return `${pt(p.de)} a ${pt(p.ate)}`;
  if (p.de) return `Desde ${pt(p.de)}`;
  return `Até ${pt(p.ate as string)}`;
}
