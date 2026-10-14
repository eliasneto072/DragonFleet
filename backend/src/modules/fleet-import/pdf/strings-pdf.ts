// src/modules/fleet-import/pdf/strings-pdf.ts
//
// Ler uma string de dentro de um PDF, em bytes.
//
// ─── PORQUE É QUE ISTO NÃO É UM `slice` ─────────────────────────────────────
//
// Um PDF escreve uma string de duas maneiras:
//
//   (texto)        literal, com escapes: \( \) \\ \n \377 (octal)
//   <0A1B2C>       hexadecimal
//
// E a chave de encriptação de um extrato do Millennium vem assim:
//
//   /O(\226\202z\240\255;'\015\261N ...)
//
// Um `slice` entre parênteses devolve 25 caracteres de texto onde estão 32
// BYTES. A chave sai errada, a desencriptação sai lixo, e o extrato aparece
// vazio sem nenhum erro — que é a pior forma de isto falhar.
//
// Os parênteses também se encaixam: `(a(b)c)` é UMA string. Contar até ao
// primeiro `)` partia-a ao meio.

/** Os bytes de uma string PDF que começa em `i`. Devolve também onde acaba. */
export function lerStringPdf(
  bruto: string,
  i: number,
): { bytes: Buffer; fim: number } | null {
  if (bruto[i] === '<') return lerHex(bruto, i);
  if (bruto[i] === '(') return lerLiteral(bruto, i);
  return null;
}

function lerHex(bruto: string, i: number): { bytes: Buffer; fim: number } | null {
  const fim = bruto.indexOf('>', i + 1);
  if (fim < 0) return null;
  // Um dígito ímpar no fim completa-se com zero — está na especificação.
  const hex = bruto.slice(i + 1, fim).replace(/[^0-9A-Fa-f]/g, '');
  const par = hex.length % 2 === 0 ? hex : `${hex}0`;
  return { bytes: Buffer.from(par, 'hex'), fim: fim + 1 };
}

const ESCAPES: Record<string, number> = {
  n: 0x0a, r: 0x0d, t: 0x09, b: 0x08, f: 0x0c,
  '(': 0x28, ')': 0x29, '\\': 0x5c,
};

function lerLiteral(bruto: string, i: number): { bytes: Buffer; fim: number } {
  const out: number[] = [];
  let nivel = 0;
  let p = i;

  for (; p < bruto.length; p++) {
    const c = bruto[p];

    if (c === '\\') {
      const s = bruto[p + 1];
      if (s === undefined) break;

      if (s >= '0' && s <= '7') {
        // Octal: até três dígitos. `\0` e `\00` também são válidos.
        let oct = '';
        let q = p + 1;
        while (q < bruto.length && oct.length < 3 && bruto[q] >= '0' && bruto[q] <= '7') {
          oct += bruto[q];
          q++;
        }
        out.push(parseInt(oct, 8) & 0xff);
        p = q - 1;
        continue;
      }

      // Uma barra antes de fim de linha junta as duas linhas: não escreve nada.
      if (s === '\n') { p += 1; continue; }
      if (s === '\r') { p += bruto[p + 2] === '\n' ? 2 : 1; continue; }

      const b = ESCAPES[s];
      // Uma barra antes de qualquer outro caractere é ignorada, e fica só o
      // caractere — é o que a especificação manda, e não um erro.
      out.push(b === undefined ? s.charCodeAt(0) & 0xff : b);
      p += 1;
      continue;
    }

    if (c === '(') {
      nivel++;
      // O parêntese de abertura do nível 0 é a moldura, não conteúdo.
      if (nivel > 1) out.push(0x28);
      continue;
    }

    if (c === ')') {
      nivel--;
      if (nivel === 0) return { bytes: Buffer.from(out), fim: p + 1 };
      out.push(0x29);
      continue;
    }

    out.push(c.charCodeAt(0) & 0xff);
  }

  // String sem fecho: devolve o que apanhou. Quem chama confere o tamanho.
  return { bytes: Buffer.from(out), fim: bruto.length };
}

/** Os bytes de `/Chave(...)` ou `/Chave<...>` dentro de um dicionário. */
export function stringDaChave(corpo: string, chave: string): Buffer | null {
  const re = new RegExp(`/${chave}\\s*(?=[(<])`, 'g');
  const m = re.exec(corpo);
  if (!m) return null;
  const lido = lerStringPdf(corpo, m.index + m[0].length);
  return lido ? lido.bytes : null;
}

/**
 * O primeiro elemento de `/ID [<...> <...>]` do TRAILER.
 *
 * ─── PORQUE É QUE NÃO SERVE O PRIMEIRO `/ID` DO FICHEIRO ───────────────────
 *
 * Porque `/ID` também aparece dentro de objetos — e num extrato do Millennium
 * aparece dentro de um objeto ENCRIPTADO, quase 1,5 KB antes do trailer. O
 * primeiro `/ID` do ficheiro era esse, a chave saía errada, e o extrato
 * aparecia vazio sem um único erro.
 *
 * O `/ID` que vale é o do dicionário que também tem o `/Encrypt`: é esse o par
 * que a especificação manda usar para derivar a chave. Procura-se a partir de
 * lá, e não do início do ficheiro.
 */
export function idDoFicheiro(bruto: string): Buffer {
  const lerEm = (i: number): Buffer | null => {
    const lido = lerStringPdf(bruto, i);
    return lido ? lido.bytes : null;
  };

  const encrypts = [...bruto.matchAll(/\/Encrypt\s+\d+\s+\d+\s+R/g)];
  if (encrypts.length > 0) {
    const ultimo = encrypts[encrypts.length - 1];
    const de = ultimo.index ?? 0;

    // PRIMEIRO para a frente, e só depois para trás. Num trailer o `/ID` vem
    // quase sempre depois do `/Encrypt`, e procurar numa janela em volta
    // encontrava o `/ID` de um objeto ANTERIOR — que é exactamente o engano
    // que este ficheiro traz.
    const adiante = /\/ID\s*\[\s*(?=[(<])/.exec(bruto.slice(de, de + 2000));
    if (adiante) {
      const bytes = lerEm(de + adiante.index + adiante[0].length);
      if (bytes) return bytes;
    }

    // Para trás: o mais PRÓXIMO do `/Encrypt`, isto é o último da janela.
    const inicio = Math.max(0, de - 2000);
    const atras = [...bruto.slice(inicio, de).matchAll(/\/ID\s*\[\s*(?=[(<])/g)];
    if (atras.length > 0) {
      const perto = atras[atras.length - 1];
      const bytes = lerEm(inicio + (perto.index ?? 0) + perto[0].length);
      if (bytes) return bytes;
    }
  }

  // Sem `/Encrypt`: o último `/ID` do ficheiro, que é o do trailer mais
  // recente num ficheiro actualizado de forma incremental.
  const todos = [...bruto.matchAll(/\/ID\s*\[\s*(?=[(<])/g)];
  if (todos.length === 0) return Buffer.alloc(0);
  const fim = todos[todos.length - 1];
  return lerEm((fim.index ?? 0) + fim[0].length) ?? Buffer.alloc(0);
}
