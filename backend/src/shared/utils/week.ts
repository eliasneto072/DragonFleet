// src/shared/utils/week.ts
//
// Semanas de fecho: segunda a domingo.
//
// ─── POR QUE ISTO PRECISA DE EXISTIR ─────────────────────────────────────────
//
// Os portais reportam PERÍODOS, não dias, e o período que eles oferecem por
// omissão não coincide com a semana do fecho.
//
// A vista "Last 7 days" da Bolt é uma janela deslizante: a captura que o
// cliente enviou mostra 11 a 17 de agosto de 2026, que é de TERÇA a SEGUNDA.
// Isso atravessa duas semanas de fecho — seis dias numa e um noutra.
//
// Um total desses não pode ser atribuído a nenhuma das duas sem estar errado, e
// o erro seria invisível: o número aparece no fecho e ninguém tem como saber
// que traz um dia da semana anterior. Daí estas funções, e daí o ingest recusar
// períodos que não caibam numa semana.

const DIA = 86_400_000;

/**
 * A segunda-feira da semana a que uma data pertence, à meia-noite UTC.
 *
 * `getUTCDay()` devolve 0 ao domingo; o `|| 7` transforma-o em 7 para a semana
 * acabar ao domingo em vez de começar nele.
 */
export function startOfWeek(d: Date): Date {
  const meiaNoite = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diaDaSemana = meiaNoite.getUTCDay() || 7;
  return new Date(meiaNoite.getTime() - (diaDaSemana - 1) * DIA);
}

/** O domingo que fecha a semana de uma data. */
export function endOfWeek(d: Date): Date {
  return new Date(startOfWeek(d).getTime() + 6 * DIA);
}

/** Duas datas caem na mesma semana de fecho? */
export function sameWeek(a: Date, b: Date): boolean {
  return startOfWeek(a).getTime() === startOfWeek(b).getTime();
}

/** AAAA-MM-DD, para mensagens de erro e rótulos. */
export function toDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A semana que devia ter sido pedida no portal, para a mensagem de erro.
 *
 * Dizer apenas "o período atravessa duas semanas" deixa quem lê sem saber o que
 * fazer. Dizer "escolha 10-08 a 16-08" resolve-lhe o problema num clique.
 */
export function suggestWeek(d: Date): { from: string; to: string } {
  return { from: toDayString(startOfWeek(d)), to: toDayString(endOfWeek(d)) };
}
