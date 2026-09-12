// src/shared/utils/money.ts
//
// Arredondamento monetário.
//
// ─── PORQUE ESTE FICHEIRO EXISTE ─────────────────────────────────────────────
//
// A mesma função estava escrita em `settlements.types.ts` e no `xlsx-kit.ts`, e
// eu ia acrescentar uma terceira ao extrato. Três cópias de uma regra de
// arredondamento sobre dinheiro é exatamente o tipo de duplicação que um dia dá
// dois totais diferentes para a mesma conta.
//
// Fica em `shared` e não no kit do Excel: o `balance` a importar do `reports`
// punha um módulo de domínio a depender de um de relatório, o que é a direção
// errada.
//
// As duas cópias antigas ficam por migrar de propósito — são código já
// commitado e testado, e trocá-las de passagem num commit sobre outra coisa é
// como se perdem as revisões.

/**
 * Duas casas decimais, sem os resíduos do ponto flutuante.
 *
 * O `Number.EPSILON` empurra os casos que caem exatamente em meio cêntimo para
 * cima em vez de dependerem da representação binária. Não resolve tudo — nada
 * em `double` resolve — mas os valores que atravessam isto vêm todos de colunas
 * `Decimal(12,2)`, portanto cada um é exato a duas casas e arredondar a cada
 * passo mantém-se exato.
 */
export function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
