// scripts/verificar-buffers.mjs
//
// Guarda contra o engano que partiu o build duas vezes:
//
//     let dados = Buffer.from(texto, 'latin1');   // Buffer<ArrayBuffer>
//     dados = inflateSync(dados);                 // Buffer<ArrayBufferLike>  ✗
//
// ─── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
//
// No @types/node moderno o `Buffer` é genérico:
//
//     Buffer.from(...)      →  Buffer<ArrayBuffer>        (estreito)
//     inflateSync(...)      →  Buffer<ArrayBufferLike>    (largo)
//     createHash().digest() →  Buffer<ArrayBufferLike>    (largo)
//
// Uma variável declarada com `let x = Buffer.from(...)` fica com o tipo
// ESTREITO, e atribuir-lhe depois um valor do tipo largo não compila. A
// correcção é uma anotação: `let x: Buffer = Buffer.from(...)`.
//
// ─── E PORQUE É QUE NÃO BASTA O `tsc` ───────────────────────────────────────
//
// Basta, no servidor. O que não basta é a verificação de tipos que corre no
// ambiente de desenvolvimento deste projeto, que não tem `node_modules` nem,
// portanto, os tipos do Node: sem eles, o `Buffer` não tem parâmetros de tipo
// e o engano é INVISÍVEL. O build do Render é que o apanha — depois do commit,
// depois do push, e com o deploy em baixo.
//
// Esta verificação não precisa de tipos nenhuns. Lê o texto e exige a
// anotação em qualquer `let` que receba um Buffer e seja reatribuído. É mais
// grosseira do que o compilador e corre em qualquer sítio.
//
// Regra: um `let` que começa com um valor de Buffer E é reatribuído mais
// abaixo TEM de ter `: Buffer` escrito. Sem reatribuição não há conflito
// possível, e não se exige nada — encher o código de anotações que não servem
// para nada só ensina as pessoas a ignorar o aviso.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'src';

/** Expressões que produzem um Buffer de um tipo ou do outro. */
const PRODUZ_BUFFER = /^\s*let\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(.+)$/;

const FONTES_DE_BUFFER = [
  /\bBuffer\.(from|alloc|allocUnsafe|concat)\s*\(/,
  /\binflateSync\s*\(/,
  /\binflateRawSync\s*\(/,
  /\bgunzipSync\s*\(/,
  /\.digest\s*\(\s*\)/,
  /\breadFileSync\s*\([^)]*\)\s*$/,
];

function ficheiros(dir) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) { out.push(...ficheiros(caminho)); continue; }
    if (nome.endsWith('.ts')) out.push(caminho);
  }
  return out;
}

const problemas = [];
// Contam-se as ANOTADAS também. Um aviso que diz «✓ 0 verificadas» parece não
// estar a verificar nada, e um aviso em que ninguém confia é pior do que
// nenhum — é a mesma lição do arnês que não apanhava o erro que devia.
let comTipo = 0;
let semTipo = 0;

for (const caminho of ficheiros(RAIZ)) {
  const linhas = readFileSync(caminho, 'utf8').split('\n');

  for (let i = 0; i < linhas.length; i++) {
    const m = PRODUZ_BUFFER.exec(linhas[i]);
    if (!m) continue;

    const [, nome, valor] = m;

    if (!FONTES_DE_BUFFER.some((re) => re.test(valor))) continue;

    // Já tem anotação? Conta e segue.
    if (/^\s*let\s+[A-Za-z_$][\w$]*\s*:/.test(linhas[i])) { comTipo++; continue; }
    semTipo++;

    // É reatribuído mais abaixo, dentro deste ficheiro?
    const reatribuicao = new RegExp(`^\\s*${nome}\\s*=\\s*[^=]`);
    const reatribuido = linhas.slice(i + 1).some((l) => reatribuicao.test(l));
    if (!reatribuido) continue;

    problemas.push({ caminho, linha: i + 1, nome, texto: linhas[i].trim() });
  }
}

if (problemas.length > 0) {
  console.error('');
  console.error('✗ Variáveis de Buffer sem o tipo escrito, e que são reatribuídas:');
  console.error('');
  for (const p of problemas) {
    console.error(`  ${p.caminho}:${p.linha}`);
    console.error(`    ${p.texto}`);
    console.error(`    → escreva  let ${p.nome}: Buffer = …`);
    console.error('');
  }
  console.error('  Sem a anotação, o tipo vem de `Buffer.from(...)` e é o ESTREITO');
  console.error('  (Buffer<ArrayBuffer>). Atribuir-lhe depois o resultado do zlib ou do');
  console.error('  crypto, que é o LARGO (Buffer<ArrayBufferLike>), não compila — e o');
  console.error('  erro só aparece no build do servidor, nunca aqui.');
  console.error('');
  process.exit(1);
}

console.log(
  `✓ ${comTipo + semTipo} variável(eis) de Buffer: ${comTipo} com o tipo escrito, `
  + `${semTipo} sem — e nenhuma delas é reatribuída`,
);
