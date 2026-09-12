// src/modules/reports/xlsx-kit.ts
//
// As primitivas visuais dos ficheiros Excel.
//
// ─── PORQUE ISTO NÃO ESTÁ DUPLICADO ──────────────────────────────────────────
//
// Há dois exports para Excel — a Faturação e os Recibos Verdes — e o cliente
// validou o aspeto do primeiro. Se o segundo tivesse a sua própria cópia das
// cores, dos formatos e do estilo do cabeçalho, os dois divergiam no dia em que
// alguém ajustasse um. E divergência de aspeto entre dois ficheiros que saem do
// mesmo sistema não parece descuido: parece que um deles não é oficial.
//
// Este ficheiro NÃO decide o conteúdo — só a aparência. Cada export monta as
// suas folhas e colunas.

import type ExcelJS from 'exceljs';

// ─── FORMATOS ────────────────────────────────────────────────────────────────
//
// Números a sério com formato aplicado, e não texto pré-formatado. O Excel usa
// a localização de quem abre; escrever "1.234,56" como texto faz o SUM do
// contabilista devolver zero.
//
// Isto é o CONTRÁRIO do CSV, onde a convenção do ponto-e-vírgula e da vírgula
// decimal é obrigatória porque não há formato nenhum a aplicar.

export const EUR = '#,##0.00\\ "€"';
export const PERCENT = '0.00"%"';
export const DATA = 'dd/mm/yyyy';
export const DATA_HORA = 'dd/mm/yyyy hh:mm';

// ─── CORES ───────────────────────────────────────────────────────────────────

export const VERDE = 'FF0F5132';
export const VERDE_CLARO = 'FFD1E7DD';

/** Cabeçalho: verde escuro, texto branco, alto o suficiente para duas linhas. */
export function estilizarCabecalho(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 30;
}

/** Linha de totais: verde claro, negrito, risco em cima. */
export function estilizarTotais(row: ExcelJS.Row) {
  row.font = { bold: true, size: 10 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_CLARO } };
  row.border = { top: { style: 'thin' } };
}

/** Título de secção nas folhas de resumo. */
export function estilizarTitulo(row: ExcelJS.Row, tamanho = 16) {
  row.font = { bold: true, size: tamanho, color: { argb: VERDE } };
}

/**
 * `A`, `B`, ... `AA` — para montar as fórmulas de soma.
 *
 * As linhas de total levam `SUM(D2:D58)` e não o valor já somado, para o
 * contabilista poder clicar e ver de onde vem. Isso obriga a saber a letra da
 * coluna, que o exceljs não dá diretamente a partir do índice.
 */
export function letraDaColuna(indice: number): string {
  let n = indice;
  let letra = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - resto) / 26);
  }
  return letra;
}

/**
 * A linha de TOTAL de uma folha de dados.
 *
 * `primeiraColuna` leva o rótulo; as colunas indicadas em `somar` recebem a
 * fórmula. As restantes ficam vazias em vez de repetir rótulos.
 */
export function linhaDeTotais(
  ws: ExcelJS.Worksheet,
  totalColunas: number,
  rotulo: string,
  somar: Array<{ indice: number; formato?: string }>,
  primeiraLinhaDados = 2,
): ExcelJS.Row {
  const ultima = ws.rowCount;

  const valores: Array<unknown> = new Array(totalColunas).fill(null);
  valores[0] = rotulo;

  for (const { indice } of somar) {
    const L = letraDaColuna(indice);
    valores[indice - 1] = { formula: `SUM(${L}${primeiraLinhaDados}:${L}${ultima})` };
  }

  const row = ws.addRow(valores);
  for (const { indice, formato } of somar) {
    row.getCell(indice).numFmt = formato ?? EUR;
  }
  estilizarTotais(row);
  return row;
}

/** Arredonda a duas casas, evitando os resíduos do ponto flutuante. */
export function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
