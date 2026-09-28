// src/shared/lib/notification-format.ts
//
// Dar forma ao texto de uma notificação.
//
// ─── O PROBLEMA ─────────────────────────────────────────────────────────────
//
// A mensagem era desenhada com `{n.message}` dentro de um <p>. O HTML trata
// qualquer sequência de espaços e quebras de linha como UM espaço, por isso um
// aviso escrito em dez parágrafos com títulos e listas chegava ao motorista
// como um bloco de texto corrido de vinte linhas — ilegível, e ninguém o lê
// até ao fim.
//
// ─── PORQUE NÃO UMA BIBLIOTECA DE MARKDOWN ──────────────────────────────────
//
// Porque o que é preciso são três coisas — títulos, listas e negrito — e uma
// biblioteca de markdown traz tabelas, imagens, HTML embutido e ligações. O
// texto é escrito na administração, mas é lido por toda a gente: quanto menos
// o formatador aceitar, menos há para correr mal. Este devolve BLOCOS, não
// HTML, e quem desenha decide o que fazer com eles — que é também a razão de
// isto funcionar igual no portal (React) e no email (HTML).
//
// ─── AS REGRAS ──────────────────────────────────────────────────────────────
//
//   ## Um título            → título
//   - Um item               → item de lista (também aceita "•" e "*")
//   linha em branco         → separa parágrafos
//   **negrito**             → negrito
//
// Uma quebra de linha simples dentro de um parágrafo é MANTIDA. Quem escreveu
// a quebra queria-a ali; juntar as linhas seria adivinhar.

export type Bloco =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'lista'; itens: string[] };

/** Um pedaço de texto com ou sem negrito. */
export interface Pedaco {
  texto: string;
  forte: boolean;
}

const TITULO = /^#{1,3}\s+(.*)$/;
const ITEM = /^\s*[-*•]\s+(.*)$/;

/**
 * Divide a mensagem em blocos.
 *
 * Nunca rebenta e nunca devolve blocos vazios: uma mensagem só com espaços dá
 * uma lista vazia, e quem desenha decide se mostra alguma coisa.
 */
export function analisarMensagem(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  // \r\n e \r vêm de quem escreve no Windows e de alguns clientes de email.
  const linhas = (texto ?? '').replace(/\r\n?/g, '\n').split('\n');

  let paragrafo: string[] = [];
  let itens: string[] = [];

  function fecharParagrafo() {
    const junto = paragrafo.join('\n').trim();
    if (junto) blocos.push({ tipo: 'paragrafo', texto: junto });
    paragrafo = [];
  }
  function fecharLista() {
    if (itens.length) blocos.push({ tipo: 'lista', itens });
    itens = [];
  }

  for (const bruta of linhas) {
    const linha = bruta.trimEnd();

    if (!linha.trim()) {
      fecharParagrafo();
      fecharLista();
      continue;
    }

    const titulo = TITULO.exec(linha);
    if (titulo) {
      fecharParagrafo();
      fecharLista();
      const t = titulo[1].trim();
      if (t) blocos.push({ tipo: 'titulo', texto: t });
      continue;
    }

    const item = ITEM.exec(linha);
    if (item) {
      // Uma lista a seguir a um parágrafo pertence-lhe, mas são blocos
      // diferentes: o parágrafo fecha aqui.
      fecharParagrafo();
      const i = item[1].trim();
      if (i) itens.push(i);
      continue;
    }

    // Texto normal. Se vínhamos de uma lista, ela acabou.
    fecharLista();
    paragrafo.push(linha);
  }

  fecharParagrafo();
  fecharLista();
  return blocos;
}

/**
 * Parte um texto nos pedaços em negrito.
 *
 * Um `**` sem par fica como texto, tal e qual — corrigir à força o que o autor
 * escreveu dava resultados piores do que mostrar os asteriscos.
 */
export function partirNegrito(texto: string): Pedaco[] {
  const pedacos: Pedaco[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) {
      pedacos.push({ texto: texto.slice(ultimo, m.index), forte: false });
    }
    pedacos.push({ texto: m[1], forte: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) {
    pedacos.push({ texto: texto.slice(ultimo), forte: false });
  }
  return pedacos.length ? pedacos : [{ texto, forte: false }];
}

/**
 * Uma linha só, para as listas onde não cabe mais.
 *
 * Tira as marcas de formatação em vez de as mostrar: "## Níveis" numa
 * pré-visualização de uma linha é ruído, não é um título.
 */
export function resumirMensagem(texto: string, max = 140): string {
  const limpo = (texto ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(TITULO, '$1').replace(ITEM, '$1').trim())
    .filter(Boolean)
    .join(' · ')
    .replace(/\*\*/g, '');

  if (limpo.length <= max) return limpo;
  // Corta na palavra e não a meio dela.
  const corte = limpo.slice(0, max);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).trimEnd()}…`;
}

/**
 * Vale a pena dobrar esta mensagem numa lista?
 *
 * O critério é o comprimento e não o número de blocos: três parágrafos curtos
 * leem-se de uma vez, e um parágrafo só com trezentos caracteres não.
 */
export function mensagemEhLonga(texto: string, limite = 260): boolean {
  return (texto ?? '').trim().length > limite;
}
