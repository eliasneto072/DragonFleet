// src/shared/utils/iban.ts
//
// Validação e normalização de IBAN.
//
// POR QUE ESTÁ AQUI E NÃO DENTRO DO bank.service: estas funções são puras —
// entra uma string, sai um booleano — mas viviam dentro de um módulo que
// importa o Prisma. Isso tornava-as impossíveis de testar sem levantar uma
// base de dados para verificar aritmética que não toca em base de dados
// nenhuma.
//
// A regra geral que isto ilustra: lógica pura em ficheiros sem dependências de
// infraestrutura. É o que separa um teste de milissegundos de um teste que
// precisa de Docker.
//
// O frontend tem a sua própria cópia em shared/lib/iban.ts. A duplicação é
// deliberada — são dois pacotes com dependências separadas, e partilhar código
// entre eles exigiria um terceiro pacote. Os testes deste ficheiro são a
// garantia de que o algoritmo aqui está certo; os do frontend, o mesmo do
// outro lado.

/**
 * Sem espaços e em maiúsculas — a forma em que o IBAN é guardado.
 *
 * Os bancos imprimem-no em grupos de quatro, e quem copia traz os espaços.
 */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Validação pelo resto 97, o mesmo algoritmo que os bancos usam.
 *
 * Apanha dígitos trocados, que é o erro real — um IBAN com um número a mais ou
 * a menos passaria numa validação de comprimento e enviaria o dinheiro para
 * lado nenhum, ou pior, para outra pessoa.
 *
 * Espera o IBAN já normalizado. Quem receber texto do utilizador deve passar
 * primeiro pelo normalizeIban.
 */
export function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return false;

  // Move os quatro primeiros caracteres para o fim e converte letras em números
  // (A=10 … Z=35), como manda a norma.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  // O número é longo demais para caber num inteiro de JavaScript sem perder
  // precisão: o resto é calculado por partes, dígito a dígito.
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
