// src/shared/utils/phone.ts
//
// Normalização do telefone de contacto do motorista.
//
// ─── PORQUE NÃO VALIDAMOS COMO NÚMERO PORTUGUÊS ──────────────────────────────
//
// A tentação óbvia era exigir nove dígitos a começar em 9. Seria errado: uma
// parte grande dos motoristas de TVDE em Portugal é estrangeira e usa números
// brasileiros, nepaleses, indianos — números que funcionam e pelos quais a
// pessoa atende. Uma validação nacional recusaria contactos legítimos e o campo
// ficaria vazio precisamente para quem é mais difícil de encontrar.
//
// O campo existe para alguém poder LIGAR por causa de uma multa. Um número com
// formato estranho que atende vale mais do que um número bem formado que foi
// recusado no formulário.
//
// Por isso: normalizamos, não interpretamos. Não há prefixo de país assumido,
// não há operadora inferida, não há formatação para exibição.
//
// ─── O VAZIO E O LIXO SÃO COISAS DIFERENTES ──────────────────────────────────
//
// Campo apagado (`''` ou `null`) → `null`. O motorista tem direito a remover o
// contacto, e um campo opcional que não se consegue esvaziar é um bug.
//
// Texto sem dígito nenhum ("não tenho", "abc") → `''`, que NÃO passa em
// `isValidPhone`. Isto é deliberado: se devolvêssemos `null` também aqui, o
// formulário aceitava lixo em silêncio e gravava "sem telefone" sem avisar
// ninguém. A pessoa julgava ter guardado um contacto e não tinha.

/** Máximo de 15 dígitos: é o limite do E.164. Mínimo de 6 para deixar passar
 *  formatos curtos que existem fora da Europa sem abrir a porta a um "12". */
const PHONE_SHAPE = /^\+?\d{6,15}$/;

/**
 * Reduz o que a pessoa escreveu a `+` opcional seguido de dígitos.
 *
 * Espaços, parênteses, pontos e traços caem — são decoração de leitura e cada
 * pessoa usa a sua. Guardar duas variantes do mesmo número como se fossem
 * diferentes só cria trabalho a quem depois procura.
 *
 * @returns `null` quando não foi escrito nada, ou a forma normalizada (que pode
 *          ser `''` se o texto não tinha dígitos — inválida de propósito).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;

  const trimmed = raw.trim();
  if (trimmed === '') return null;

  // O `+` só conta à cabeça. Um `+` no meio é gralha, não indicativo.
  const prefix = trimmed.startsWith('+') ? '+' : '';

  return prefix + trimmed.replace(/\D/g, '');
}

/**
 * `null` é válido — o campo é opcional e a maioria dos registos antigos não o
 * tem. O que não é válido é texto que ficou sem dígitos suficientes.
 */
export function isValidPhone(value: string | null): boolean {
  if (value === null) return true;
  return PHONE_SHAPE.test(value);
}
