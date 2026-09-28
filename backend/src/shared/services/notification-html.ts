// src/shared/services/notification-html.ts
//
// O texto de uma notificação, transformado em HTML para o email.
//
// ─── DOIS PROBLEMAS, NÃO UM ─────────────────────────────────────────────────
//
// 1. O email fazia `<p>${message}</p>`. O HTML junta as quebras de linha, por
//    isso um aviso escrito em parágrafos chegava à caixa de correio como um
//    bloco corrido — exatamente o que acontecia no portal.
//
// 2. E `${message}` era interpolado SEM ESCAPAR. Um "<" numa mensagem inocente
//    ("faturação < 500€") comia o resto da frase, e uma mensagem com marcação
//    entrava no email como marcação. Hoje só a administração escreve estes
//    textos, mas quem os lê é toda a gente, e um email não se corrige depois
//    de enviado.
//
// As regras de formatação são as mesmas do portal (`notification-format.ts`,
// no frontend): `## título`, `- lista`, `**negrito**`, linha em branco a
// separar parágrafos. Mantidas iguais de propósito — quem escreve vê a
// pré-visualização no painel e tem de poder confiar que o email sai assim.
//
// Estilos em atributos `style` e não numa folha: o Gmail, o Outlook e o Apple
// Mail descartam <style> em graus diferentes, e isto é a única coisa que
// funciona nos três.

const TITULO = /^#{1,3}\s+(.*)$/;
const ITEM = /^\s*[-*•]\s+(.*)$/;

/** Escapa tudo o que possa ser lido como marcação. */
export function escaparHtml(texto: string): string {
  return (texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * `**negrito**` depois de escapado.
 *
 * A ordem importa: escapar primeiro e só depois procurar os asteriscos. Ao
 * contrário, um `<b>` que nós próprios escrevêssemos seria escapado a seguir e
 * apareceria como texto.
 */
function negrito(escapado: string): string {
  return escapado.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong style="color:#1D1D1D">$1</strong>',
  );
}

function linha(texto: string): string {
  return negrito(escaparHtml(texto));
}

/**
 * O corpo da mensagem em HTML de email.
 *
 * Devolve string vazia para uma mensagem vazia — quem chama decide se mostra
 * a caixa na mesma.
 */
export function mensagemParaHtml(texto: string): string {
  const linhas = (texto ?? '').replace(/\r\n?/g, '\n').split('\n');
  const partes: string[] = [];

  let paragrafo: string[] = [];
  let itens: string[] = [];

  const fecharParagrafo = () => {
    const junto = paragrafo.join('\n').trim();
    if (junto) {
      // <br> em vez de confiar no white-space: o Outlook ignora
      // `white-space:pre-line` e voltaríamos ao bloco corrido do princípio.
      partes.push(
        `<p style="margin:0 0 10px;color:#444;line-height:1.6">${
          junto.split('\n').map(linha).join('<br>')
        }</p>`,
      );
    }
    paragrafo = [];
  };

  const fecharLista = () => {
    if (itens.length) {
      partes.push(
        `<ul style="margin:0 0 10px;padding-left:20px;color:#444;line-height:1.6">${
          itens.map((i) => `<li style="margin:0 0 4px">${linha(i)}</li>`).join('')
        }</ul>`,
      );
    }
    itens = [];
  };

  for (const bruta of linhas) {
    const l = bruta.trimEnd();

    if (!l.trim()) {
      fecharParagrafo();
      fecharLista();
      continue;
    }

    const t = TITULO.exec(l);
    if (t) {
      fecharParagrafo();
      fecharLista();
      const texto = t[1].trim();
      if (texto) {
        partes.push(
          `<p style="margin:16px 0 6px;color:#1D1D1D;font-size:15px;font-weight:600">${linha(texto)}</p>`,
        );
      }
      continue;
    }

    const i = ITEM.exec(l);
    if (i) {
      fecharParagrafo();
      const item = i[1].trim();
      if (item) itens.push(item);
      continue;
    }

    fecharLista();
    paragrafo.push(l);
  }

  fecharParagrafo();
  fecharLista();

  // O primeiro bloco não leva margem em cima: já tem a do cartão.
  return partes.join('').replace(/^<p style="margin:16px 0 6px/, '<p style="margin:0 0 6px');
}
