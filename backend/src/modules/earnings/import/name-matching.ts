// src/modules/earnings/import/name-matching.ts
//
// Emparelhar o nome que vem do portal com um motorista da base.
//
// ─── POR QUE ISTO É PRECISO ──────────────────────────────────────────────────
//
// A importação existente atribui tudo ao utilizador autenticado, e serve para o
// motorista carregar o próprio extrato. A extensão traz outra coisa: a folha
// que o administrador tem aberta no portal, com a frota inteira. Cada linha
// pertence a uma pessoa diferente, e a única ligação entre ela e a base é o
// nome escrito pela Uber ou pela Bolt.
//
// ─── O PROBLEMA DOS ACENTOS ──────────────────────────────────────────────────
//
// Está documentado no projeto e é real: a Uber escreve "Monica Luis" e a Bolt
// escreve "Mónica Luis", para a mesma pessoa. Comparar textos crus faz uma das
// duas plataformas nunca casar, e as semanas dessa origem desaparecem sem erro
// visível — os lançamentos simplesmente não aparecem.
//
// ─── O QUE ISTO NÃO FAZ ──────────────────────────────────────────────────────
//
// Não adivinha. Um nome que não case com exatamente um motorista é devolvido
// como não emparelhado, para a tela de conferência o mostrar e alguém decidir.
// Um emparelhamento aproximado que acerte em nove casos e falhe no décimo põe
// os ganhos de uma pessoa na conta de outra — e isso, ao fim de uma semana,
// vira dinheiro pago a quem não o ganhou.

/**
 * Forma canónica de um nome, para comparação.
 *
 * Tira acentos, baixa para minúsculas, colapsa espaços repetidos e remove
 * pontuação. "Mónica  Luís." e "MONICA LUIS" dão a mesma coisa.
 *
 * NFD separa a letra do acento; o intervalo \u0300-\u036f são as marcas
 * diacríticas, que ficam para trás.
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,'`´]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MatchCandidate {
  id: string;
  name: string;
}

export type MatchOutcome =
  | { status: 'matched'; userId: string; userName: string }
  | { status: 'not_found' }
  | { status: 'ambiguous'; candidates: MatchCandidate[] };

/**
 * Encontra o motorista a que um nome do portal corresponde.
 *
 * Duas passagens, e nenhuma delas adivinha:
 *
 * 1. Nome completo igual, depois de normalizado. É o caso normal.
 *
 * 2. Primeiro e último nome iguais. Os portais nem sempre trazem os nomes do
 *    meio — "Mónica Luís Antunes" na base contra "Mónica Antunes" no portal é
 *    a mesma pessoa. Só vale quando resulta em UM único motorista; havendo dois
 *    "João Silva" na frota, devolve ambiguidade em vez de escolher.
 *
 * Não há comparação por semelhança nem distância de edição. Um nome que quase
 * casa é precisamente o caso em que o engano custa dinheiro.
 */
export function matchDriver(portalName: string, drivers: MatchCandidate[]): MatchOutcome {
  const alvo = normalizeName(portalName);
  if (!alvo) return { status: 'not_found' };

  const exatos = drivers.filter((d) => normalizeName(d.name) === alvo);
  if (exatos.length === 1) {
    return { status: 'matched', userId: exatos[0].id, userName: exatos[0].name };
  }
  if (exatos.length > 1) {
    return { status: 'ambiguous', candidates: exatos };
  }

  // Segunda passagem: primeiro e último.
  const partes = alvo.split(' ');
  if (partes.length < 2) return { status: 'not_found' };

  const primeiro = partes[0];
  const ultimo = partes[partes.length - 1];

  const porExtremos = drivers.filter((d) => {
    const p = normalizeName(d.name).split(' ');
    return p.length >= 2 && p[0] === primeiro && p[p.length - 1] === ultimo;
  });

  if (porExtremos.length === 1) {
    return { status: 'matched', userId: porExtremos[0].id, userName: porExtremos[0].name };
  }
  if (porExtremos.length > 1) {
    return { status: 'ambiguous', candidates: porExtremos };
  }

  return { status: 'not_found' };
}
