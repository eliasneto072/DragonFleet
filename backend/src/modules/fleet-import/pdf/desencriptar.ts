// src/modules/fleet-import/pdf/desencriptar.ts
//
// Abrir um PDF do banco que vem encriptado.
//
// ─── PORQUE É QUE ISTO É NECESSÁRIO ─────────────────────────────────────────
//
// Quatro dos seis extratos do cliente não davam uma linha de texto, e nenhum
// deles está protegido por password: o Novo Banco e o Millennium marcam o
// ficheiro como encriptado com a password de utilizador VAZIA. É o que a
// banca faz por omissão — serve para impedir alterações, não para impedir a
// leitura. Qualquer leitor de PDF os abre sem perguntar nada.
//
// Sem esta peça, o extrato aparecia vazio e a importação dizia "não encontrei
// movimentos" — uma frase verdadeira e completamente enganadora.
//
// ─── O QUE ESTÁ IMPLEMENTADO, E O QUE NÃO ESTÁ ──────────────────────────────
//
//   /V 1, /V 2  → RC4, 40 a 128 bits        ← o Novo Banco usa isto (V2/R3)
//   /V 4 AESV2  → AES-128-CBC               ← o Millennium usa isto (V4/R4)
//   /V 4 V2     → RC4 pelo filtro do /CF
//
// O /V 5 (AES-256, revisões 5 e 6) NÃO está implementado, de propósito: não
// tenho um ficheiro real para o provar, e código de cripto que nunca correu
// contra um caso verdadeiro é uma promessa, não uma garantia. Devolve `null`,
// o extrator devolve texto vazio e o leitor RECUSA o extrato com uma frase
// clara. No dia em que aparecer um banco que o use, acrescenta-se — com o
// ficheiro à frente.
//
// ─── E A PASSWORD DE DONO? ──────────────────────────────────────────────────
//
// Não se toca. Isto só abre o que abre com a password de utilizador vazia, que
// é o que qualquer visualizador faz. Um PDF que exija password a sério
// continua a não ser lido — e é assim que deve ser.

import { createHash, createDecipheriv } from 'node:crypto';
import { stringDaChave, idDoFicheiro } from './strings-pdf';

/** O enchimento de 32 bytes da especificação, para a password vazia. */
const ENCHIMENTO = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56,
  0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

const md5 = (b: Buffer) => createHash('md5').update(b).digest();

export interface Seguranca {
  /** A chave do ficheiro. */
  chave: Buffer;
  /** AES-128-CBC quando verdadeiro; RC4 quando falso. */
  aes: boolean;
}

/**
 * RC4, à mão.
 *
 * O Node já não o traz — foi retirado do OpenSSL por ser fraco, e com razão.
 * Aqui não se está a proteger nada: está-se a ABRIR um ficheiro que o banco
 * fechou com ele. São vinte linhas e não há alternativa.
 */
function rc4(chave: Buffer, dados: Buffer): Buffer {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;

  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + chave[i % chave.length]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }

  const out = Buffer.alloc(dados.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < dados.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = dados[k] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

/** O número do objeto `/Encrypt 117 0 R` do trailer. */
function objetoDoEncrypt(bruto: string): number | null {
  // O ÚLTIMO trailer é o que vale: um PDF actualizado de forma incremental
  // tem vários, e o primeiro pode nem ter `/Encrypt`.
  const todos = [...bruto.matchAll(/\/Encrypt\s+(\d+)\s+\d+\s+R/g)];
  if (todos.length === 0) return null;
  return Number(todos[todos.length - 1][1]);
}

function inteiro(corpo: string, chave: string, omissao: number): number {
  const m = new RegExp(`/${chave}\\s+(-?\\d+)`).exec(corpo);
  return m ? Number(m[1]) : omissao;
}

/**
 * O tamanho da chave, em bytes.
 *
 * ─── O /Length APARECE DUAS VEZES, EM UNIDADES DIFERENTES ─────────────────
 *
 * No dicionário de encriptação, em BITS:        /V 4 /R 4 /Length 128
 * Dentro do filtro `/CF`, em BYTES:             /CFM /AESV2 /Length 16
 *
 * O extrato do Millennium tem os dois, e o do `/CF` vem PRIMEIRO. Ler
 * simplesmente o primeiro `/Length` dava 16 bits — dois bytes — que depois do
 * limite inferior virava uma chave de 5 bytes. A chave saía errada e o extrato
 * aparecia vazio.
 *
 * Em vez de adivinhar qual é qual pela posição, normalizam-se os dois: um
 * valor de 40 ou mais só pode ser bits (a chave mais pequena que existe tem 5
 * bytes, isto é 40 bits); 16 ou menos só pode ser bytes. Não há sobreposição,
 * por isso não há ambiguidade.
 */
function bytesDaChave(dicionario: string, v: number): number {
  // O /V 1 não traz /Length: são sempre 40 bits.
  if (v === 1) return 5;

  const candidatos: number[] = [];
  for (const m of dicionario.matchAll(/\/Length\s+(\d+)/g)) {
    const n = Number(m[1]);
    if (n >= 40) candidatos.push(Math.floor(n / 8));
    else if (n >= 5) candidatos.push(n);
  }
  if (candidatos.length === 0) return 5;
  return Math.max(5, Math.min(16, Math.max(...candidatos)));
}

/**
 * A chave do ficheiro, a partir da password de utilizador VAZIA.
 *
 * É o Algoritmo 2 da especificação: MD5 do enchimento, do /O, do /P em 4
 * bytes little-endian e do /ID — e, da revisão 3 em diante, mais cinquenta
 * voltas de MD5 sobre os primeiros n bytes. As cinquenta voltas existem para
 * tornar a força bruta lenta; sem elas a chave sai errada.
 */
function chaveDoFicheiro(
  dicionario: string,
  id: Buffer,
  revisao: number,
  bytes: number,
): Buffer | null {
  const o = stringDaChave(dicionario, 'O');
  if (!o || o.length < 32) return null;

  const p = inteiro(dicionario, 'P', 0);
  const pLE = Buffer.alloc(4);
  pLE.writeInt32LE(p | 0, 0);

  const partes = [ENCHIMENTO, o.subarray(0, 32), pLE, id];

  // Da revisão 4, com os metadados em claro, entram mais quatro bytes a 0xFF.
  const metadadosEmClaro = /\/EncryptMetadata\s+false/.test(dicionario);
  if (revisao >= 4 && metadadosEmClaro) {
    partes.push(Buffer.from([0xff, 0xff, 0xff, 0xff]));
  }

  let chave = md5(Buffer.concat(partes));
  if (revisao >= 3) {
    for (let i = 0; i < 50; i++) chave = md5(chave.subarray(0, bytes));
  }
  return chave.subarray(0, bytes);
}

/**
 * Lê o dicionário `/Encrypt` e devolve a chave, ou `null`.
 *
 * `null` quer dizer "não sei abrir isto" e nunca "não está encriptado": quem
 * chama distingue os dois casos pela presença do `/Encrypt`.
 */
export function lerSeguranca(
  bruto: string,
  objs: Map<number, string>,
): { ok: true; seg: Seguranca } | { ok: false; motivo: string } | null {
  const num = objetoDoEncrypt(bruto);
  if (num === null) return null;

  const dicionario = objs.get(num);
  if (!dicionario) return { ok: false, motivo: 'dicionário de encriptação não encontrado' };

  if (!/\/Filter\s*\/Standard/.test(dicionario)) {
    return { ok: false, motivo: 'encriptação que não é a padrão' };
  }

  const v = inteiro(dicionario, 'V', 0);
  const r = inteiro(dicionario, 'R', 0);

  if (v >= 5) {
    return { ok: false, motivo: 'AES-256 (/V 5), que ainda não é lido' };
  }
  if (v !== 1 && v !== 2 && v !== 4) {
    return { ok: false, motivo: `versão de encriptação ${v} desconhecida` };
  }

  const bytes = bytesDaChave(dicionario, v);

  // O método está no filtro de streams apontado pelo /StmF. O AESV2 é o único
  // AES possível no /V 4; o resto é RC4.
  const aes = v === 4 && /\/CFM\s*\/AESV2/.test(dicionario);

  if (v === 4 && !aes && !/\/CFM\s*\/V2/.test(dicionario)) {
    // /Identity (sem encriptação) ou um filtro que não conheço. Recusa-se em
    // vez de desencriptar com o método errado e devolver lixo.
    if (/\/StmF\s*\/Identity/.test(dicionario)) {
      return { ok: false, motivo: 'streams em claro com strings encriptadas' };
    }
    return { ok: false, motivo: 'filtro de encriptação desconhecido' };
  }

  const chave = chaveDoFicheiro(dicionario, idDoFicheiro(bruto), r, bytes);
  if (!chave) return { ok: false, motivo: 'chave do ficheiro ilegível' };

  return { ok: true, seg: { chave, aes } };
}

/**
 * Desencripta os dados de um objeto.
 *
 * Cada objeto tem a SUA chave, derivada da chave do ficheiro mais o número e a
 * geração do objeto. É o que impede que dois streams iguais fiquem iguais
 * depois de encriptados — e é também a razão pela qual isto precisa de saber
 * de que objeto se trata.
 */
export function desencriptar(
  dados: Buffer,
  num: number,
  gen: number,
  seg: Seguranca,
): Buffer {
  const extra = Buffer.from([
    num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff,
    gen & 0xff, (gen >> 8) & 0xff,
  ]);

  const partes = [seg.chave, extra];
  // Os quatro bytes "sAlT" entram só no AES. Sem eles, a chave do objeto sai
  // errada e o AES devolve ruído — que passa por stream corrompido.
  if (seg.aes) partes.push(Buffer.from([0x73, 0x41, 0x6c, 0x54]));

  const n = Math.min(seg.chave.length + 5, 16);
  const chaveDoObjeto = md5(Buffer.concat(partes)).subarray(0, n);

  if (!seg.aes) return rc4(chaveDoObjeto, dados);

  // AES-128-CBC, com o vector de inicialização nos primeiros 16 bytes.
  if (dados.length <= 16) return Buffer.alloc(0);
  try {
    const d = createDecipheriv('aes-128-cbc', chaveDoObjeto, dados.subarray(0, 16));
    d.setAutoPadding(false);
    const aberto = Buffer.concat([d.update(dados.subarray(16)), d.final()]);

    // Enchimento PKCS#7 à mão: o automático atira quando o último byte não é
    // um enchimento válido, e um stream truncado levava o PDF todo atrás.
    const ultimo = aberto[aberto.length - 1];
    if (ultimo >= 1 && ultimo <= 16 && ultimo <= aberto.length) {
      return aberto.subarray(0, aberto.length - ultimo);
    }
    return aberto;
  } catch {
    return Buffer.alloc(0);
  }
}
