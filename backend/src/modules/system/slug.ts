// src/modules/system/slug.ts
//
// O nome curto de uma frota: "Chromatic Dragon Unipessoal Lda" → "chromatic-dragon".
//
// ─── PARA QUE SERVE ─────────────────────────────────────────────────────────
//
// Para o que vai aparecer escrito: o endereço do convite, e amanhã o subdomínio
// da frota. É único no sistema inteiro, e é por isso que não pode ser o nome:
// dois clientes podem chamar-se "Transportes Silva", mas só um pode ficar com
// `transportes-silva`.
//
// ─── PORQUE É QUE ISTO ESTÁ FORA DO SERVIÇO ─────────────────────────────────
//
// Porque é texto a ser transformado, e texto tem casos. Um nome com acentos, um
// nome com "&", um nome que é só pontuação, um nome de sessenta letras, dois
// nomes que dão o mesmo slug. Nenhum destes dá erro — dão um endereço estranho,
// ou uma colisão na base de dados a meio da criação de um cliente. Aqui
// testam-se em duas linhas cada.

/** O comprimento máximo. Entra em endereços, e um endereço não é um parágrafo. */
export const MAXIMO = 40;

/**
 * Texto → slug. Minúsculas, sem acentos, só letras, números e hífenes.
 *
 * Devolve `''` quando não sobra nada de utilizável — quem chama decide o que
 * fazer com isso. Devolver um valor inventado aqui escondia o caso.
 */
export function slugificar(texto: string): string {
  return texto
    .normalize('NFD')
    // Tira os acentos, deixando a letra: "ã" → "a". Sem isto, "São" dava
    // "s-o", que não é um nome de nada.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Tudo o que não é letra ou número passa a hífen. Depois colapsa-se.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAXIMO)
    // O corte pode ter deixado um hífen no fim: "transportes-silva-lda" cortado
    // aos 20 dá "transportes-silva-l", mas noutro comprimento dava "...-".
    .replace(/-$/, '');
}

/**
 * Um slug livre, a partir de um que já está ocupado.
 *
 * `ocupado` responde se um slug já existe. A primeira tentativa é o slug tal
 * como veio; depois `-2`, `-3`, e assim por diante.
 *
 * ─── PORQUE É QUE COMEÇA NO 2 E NÃO NO 1 ────────────────────────────────────
 *
 * Porque o primeiro não leva número. "transportes-silva" e "transportes-silva-2"
 * lêem-se como o primeiro e o segundo; "transportes-silva-1" ao lado de
 * "transportes-silva" faz parecer que falta um.
 *
 * ─── O LIMITE DE TENTATIVAS ─────────────────────────────────────────────────
 *
 * Atira ao fim de cem. Um ciclo sem fim num pedido web não dá erro: dá um
 * pedido que nunca responde, e um servidor com uma linha de execução presa.
 * Cem frotas com o mesmo nome é um problema a resolver à mão.
 */
export async function slugLivre(
  base: string,
  ocupado: (slug: string) => Promise<boolean>,
): Promise<string> {
  const raiz = slugificar(base);
  if (!raiz) throw new Error('[slug] não sobrou nada de utilizável deste nome');

  if (!(await ocupado(raiz))) return raiz;

  for (let n = 2; n <= 100; n += 1) {
    const sufixo = `-${n}`;
    // O sufixo tem de caber: cortar a raiz é melhor do que passar o máximo e
    // ser recusado pela base de dados.
    const tentativa = raiz.slice(0, MAXIMO - sufixo.length).replace(/-$/, '') + sufixo;
    if (!(await ocupado(tentativa))) return tentativa;
  }

  throw new Error(`[slug] cem nomes iguais a "${raiz}" — resolva este à mão`);
}
