// src/modules/personal/financas.ts
//
// As contas das finanças pessoais: trading e despesas.
//
// ─── PORQUE É QUE ISTO ESTÁ SEPARADO DO RESTO ───────────────────────────────
//
// Porque é aritmética, e aritmética testa-se sem base de dados. As estatísticas
// de um diário de operações têm casos de ponta que nunca se encontram a clicar:
// um mês sem operações, uma operação a zero (nem ganho nem perda), uma série
// toda negativa, comissões maiores do que o lucro. Cada um deles produz um
// número errado de uma maneira diferente, e nenhum salta à vista.
//
// ─── CÊNTIMOS INTEIROS ──────────────────────────────────────────────────────
//
// Como no resto do projeto. Somar cem lançamentos de 0,10 € em vírgula
// flutuante dá 9,999999999999998, e isso aparece na tela tal e qual. A regra é
// sempre a mesma: multiplica-se por 100, soma-se em inteiros, divide-se no fim.

/** Uma operação, reduzida ao que as contas precisam. */
export interface OperacaoParaConta {
  /** Resultado bruto, antes de comissões. Pode ser negativo. */
  result: number;
  /** Comissões. Sempre positivo ou zero. */
  fees: number;
  /** A data que ancora a operação no tempo. */
  openedAt: Date;
}

/** Uma despesa, reduzida ao que as contas precisam. */
export interface DespesaParaConta {
  amount: number;
  spentOn: Date;
  categoryId: string | null;
}

export interface ResumoDeTrading {
  /** Quantas operações entraram nestas contas. */
  total: number;
  /** Operações com líquido acima de zero. */
  ganhas: number;
  /** Operações com líquido abaixo de zero. */
  perdidas: number;
  /**
   * Operações com líquido exactamente zero.
   *
   * Contadas à parte, e não atiradas para as ganhas nem para as perdidas: são
   * o que distorce a taxa de acerto sem ninguém perceber porquê.
   */
  nulas: number;
  /** Soma dos resultados brutos. */
  bruto: number;
  /** Soma das comissões. */
  comissoes: number;
  /** `bruto − comissoes`. É este o número que interessa. */
  liquido: number;
  /**
   * Percentagem de operações ganhas, sobre as que tiveram resultado.
   *
   * `null` quando não houve nenhuma com resultado — e não zero, que se leria
   * como "nunca ganhaste", quando o que se passa é "ainda não há dados".
   */
  taxaDeAcerto: number | null;
  /** O melhor e o pior líquido. `null` sem operações. */
  melhor: number | null;
  pior: number | null;
  /** Média do líquido por operação. `null` sem operações. */
  media: number | null;
}

function cent(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}

function euros(centimos: number): number {
  return centimos / 100;
}

/** O líquido de uma operação: o bruto menos as comissões, em cêntimos. */
function liquidoEmCentimos(o: OperacaoParaConta): number {
  // As comissões descontam sempre, venham com o sinal que vierem. Um menos
  // escrito à mão no campo das comissões passaria a somar ao lucro.
  return cent(o.result) - Math.abs(cent(o.fees));
}

export function resumirTrading(operacoes: readonly OperacaoParaConta[]): ResumoDeTrading {
  if (operacoes.length === 0) {
    return {
      total: 0, ganhas: 0, perdidas: 0, nulas: 0,
      bruto: 0, comissoes: 0, liquido: 0,
      taxaDeAcerto: null, melhor: null, pior: null, media: null,
    };
  }

  let bruto = 0;
  let comissoes = 0;
  let liquido = 0;
  let ganhas = 0;
  let perdidas = 0;
  let nulas = 0;
  let melhor = -Infinity;
  let pior = Infinity;

  for (const o of operacoes) {
    const l = liquidoEmCentimos(o);
    bruto += cent(o.result);
    comissoes += Math.abs(cent(o.fees));
    liquido += l;

    if (l > 0) ganhas += 1;
    else if (l < 0) perdidas += 1;
    else nulas += 1;

    if (l > melhor) melhor = l;
    if (l < pior) pior = l;
  }

  // A taxa de acerto conta sobre as que tiveram resultado. Incluir as nulas no
  // denominador fazia a taxa descer sem nenhuma operação ter corrido mal.
  const comResultado = ganhas + perdidas;

  return {
    total: operacoes.length,
    ganhas,
    perdidas,
    nulas,
    bruto: euros(bruto),
    comissoes: euros(comissoes),
    liquido: euros(liquido),
    taxaDeAcerto: comResultado > 0
      ? Math.round((ganhas / comResultado) * 1000) / 10
      : null,
    melhor: euros(melhor),
    pior: euros(pior),
    media: Math.round(liquido / operacoes.length) / 100,
  };
}

export interface LinhaDeMes {
  /** "2026-10". Ordenável como texto, que é metade da razão para ser assim. */
  mes: string;
  total: number;
  liquido: number;
}

/**
 * O líquido mês a mês, do mais antigo para o mais recente.
 *
 * Os meses sem operações NÃO aparecem. Um gráfico que invente linhas a zero
 * para meses em que ninguém negociou diz que se perdeu dinheiro nesses meses,
 * e não se perdeu — não se fez nada.
 */
export function trandingPorMes(operacoes: readonly OperacaoParaConta[]): LinhaDeMes[] {
  const mapa = new Map<string, { total: number; liquido: number }>();

  for (const o of operacoes) {
    const chave = chaveDoMes(o.openedAt);
    const linha = mapa.get(chave) ?? { total: 0, liquido: 0 };
    linha.total += 1;
    linha.liquido += liquidoEmCentimos(o);
    mapa.set(chave, linha);
  }

  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, v]) => ({ mes, total: v.total, liquido: euros(v.liquido) }));
}

/** "2026-10", em UTC. */
export function chaveDoMes(d: Date): string {
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mes}`;
}

export interface TotalPorCategoria {
  categoriaId: string | null;
  total: number;
}

/**
 * Quanto se gastou em cada gaveta, da maior para a menor.
 *
 * As despesas sem categoria ficam numa linha com `categoriaId` nulo, em vez de
 * desaparecerem: o total por categoria tem de bater certo com o total geral,
 * senão é uma tabela que mente por omissão.
 */
export function despesasPorCategoria(
  despesas: readonly DespesaParaConta[],
): TotalPorCategoria[] {
  const mapa = new Map<string | null, number>();

  for (const d of despesas) {
    const chave = d.categoryId ?? null;
    mapa.set(chave, (mapa.get(chave) ?? 0) + Math.abs(cent(d.amount)));
  }

  return [...mapa.entries()]
    .map(([categoriaId, total]) => ({ categoriaId, total: euros(total) }))
    // Da maior para a menor: é a ordem em que a pergunta «onde é que se foi o
    // dinheiro» se responde. Empates pela chave, para a ordem ser estável.
    .sort((a, b) => b.total - a.total
      || String(a.categoriaId).localeCompare(String(b.categoriaId)));
}

/** O gasto mês a mês, do mais antigo para o mais recente. */
export function despesasPorMes(despesas: readonly DespesaParaConta[]): LinhaDeMes[] {
  const mapa = new Map<string, { total: number; liquido: number }>();

  for (const d of despesas) {
    const chave = chaveDoMes(d.spentOn);
    const linha = mapa.get(chave) ?? { total: 0, liquido: 0 };
    linha.total += 1;
    linha.liquido += Math.abs(cent(d.amount));
    mapa.set(chave, linha);
  }

  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, v]) => ({ mes, total: v.total, liquido: euros(v.liquido) }));
}

/**
 * O retorno de uma operação, em percentagem, quando dá para o calcular.
 *
 * ─── PORQUE É QUE ISTO NÃO USA O TAMANHO DA POSIÇÃO ─────────────────────────
 *
 * Porque o que uma unidade vale muda com o instrumento: um lote de divisas,
 * uma ação e um contrato de índice não têm o mesmo multiplicador, e aplicar o
 * errado dá um número com ar de exacto e completamente falso. O resultado em
 * euros é escrito pela pessoa — esse está sempre certo.
 *
 * Isto é só a variação do preço, que não precisa de multiplicador nenhum: a
 * diferença entre entrada e saída, pelo lado em que se estava. `null` quando
 * faltar um dos preços ou quando a entrada for zero.
 */
export function retornoPercentual(
  entrada: number | null | undefined,
  saida: number | null | undefined,
  direccao: 'LONG' | 'SHORT',
): number | null {
  if (!Number.isFinite(entrada as number) || !Number.isFinite(saida as number)) return null;
  const e = entrada as number;
  const s = saida as number;
  if (e === 0) return null;

  const variacao = ((s - e) / Math.abs(e)) * 100;
  const comSinal = direccao === 'SHORT' ? -variacao : variacao;
  return Math.round(comSinal * 100) / 100;
}
