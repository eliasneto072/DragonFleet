// src/shared/lib/iban.ts
//
// Validação e apresentação de IBAN, do lado do browser.
//
// POR QUE DUPLICAR UMA VALIDAÇÃO QUE O SERVIDOR JÁ FAZ: a rota `POST /bank`
// envia o comprovativo para o Cloudinary ANTES de o service validar o IBAN.
// Um dígito trocado é recusado, mas o ficheiro já subiu e fica lá órfão. Um
// motorista a corrigir o número três vezes deixa três comprovativos por trás.
// Validar aqui evita a viagem e o lixo; o servidor continua a ser a autoridade,
// porque ninguém pode confiar numa verificação feita no cliente.

/**
 * Sem espaços e em maiúsculas — a forma em que o backend também o guarda.
 * Os bancos imprimem o IBAN em grupos de quatro e quem copia traz os espaços.
 */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Validação pelo resto 97, o mesmo algoritmo dos bancos e o mesmo que o
 * `bank.service.ts` corre do outro lado.
 *
 * Apanha dígitos trocados, que é o erro que interessa: um IBAN com um número
 * a mais ou a menos passa numa validação de comprimento e manda o dinheiro
 * para lado nenhum — ou, pior, para outra pessoa.
 */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return false;

  // Os quatro primeiros caracteres passam para o fim e as letras viram números
  // (A=10 … Z=35), como manda a norma.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  // O número é longo demais para um inteiro de JavaScript: resto por partes.
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/**
 * Em grupos de quatro, como vem impresso no banco.
 *
 * Só para leitura: quem confere um IBAN a olho compara grupo a grupo, e uma
 * corrida de 25 caracteres seguidos torna isso quase impossível. O valor
 * enviado ao servidor é sempre o normalizado.
 */
export function formatIban(raw: string | null | undefined): string {
  if (!raw) return '';
  return normalizeIban(raw).replace(/(.{4})/g, '$1 ').trim();
}
