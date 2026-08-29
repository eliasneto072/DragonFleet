// src/shared/http/pagination.ts
//
// Paginação e teto de segurança para as listagens.
//
// ─── O QUE ISTO RESOLVE ──────────────────────────────────────────────────────
//
// Nenhuma listagem tinha limite. A tela de Faturação pedia `GET /settlements`
// e o servidor devolvia TUDO: com um ano de dados e 2000 motoristas, foram
// medidos **70,4 MB e 22 segundos** num único pedido, para desenhar as cinco
// linhas que cabem no ecrã.
//
// E o problema não precisa de 2000 motoristas para doer. Cem motoristas durante
// três anos dão quinze mil fechos — a mesma tela fica lenta sozinha, ao longo
// do tempo, sem ninguém perceber porquê.
//
// ─── DUAS DEFESAS, E A SEGUNDA É A QUE INTERESSA ─────────────────────────────
//
// A primeira é a paginação: quem chama pede uma página de cada vez.
//
// A segunda é o TETO. Mesmo que alguém peça `pageSize=99999`, ou construa uma
// tela nova e se esqueça de paginar, o servidor nunca devolve mais do que
// MAX_PAGE_SIZE. Foi assim que isto aconteceu — a tela não tinha limite e
// ninguém reparou até haver dados que chegassem. Uma defesa que depende de
// quem chama se lembrar não é uma defesa.

/** Página por omissão quando quem chama não diz nada. */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * O máximo que qualquer listagem pode devolver, em qualquer circunstância.
 *
 * 200 é generoso para uma tela e ridículo comparado com os 88 mil que saíam
 * antes. Se alguma vez fizer falta mais, o caminho é exportar em CSV — não
 * subir isto.
 */
export const MAX_PAGE_SIZE = 200;

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface Paged<T> {
  items: T[];
  page: PageInfo;
}

/**
 * Converte o que vem na query string em parâmetros seguros.
 *
 * Tudo o que chega por HTTP é texto e pode ser absurdo: `page=-3`,
 * `pageSize=abc`, `pageSize=1e9`. Em vez de recusar o pedido com um erro, os
 * valores impossíveis são corrigidos para os limites — uma listagem não deve
 * rebentar porque alguém escreveu mal um número no URL.
 */
export function parsePage(input: { page?: unknown; pageSize?: unknown }): PageParams {
  const pedida = Number(input.page);
  const page = Number.isFinite(pedida) && pedida >= 1 ? Math.floor(pedida) : 1;

  const tamanhoPedido = Number(input.pageSize);
  const pageSize = Number.isFinite(tamanhoPedido) && tamanhoPedido >= 1
    ? Math.min(Math.floor(tamanhoPedido), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  return { page, pageSize, skip: (page - 1) * pageSize };
}

/** Monta a informação de página a partir do total que a base contou. */
export function buildPageInfo(params: PageParams, total: number): PageInfo {
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  return {
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages,
    hasMore: params.page < totalPages,
  };
}
