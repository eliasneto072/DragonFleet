// scripts/verificar-campos.mjs
//
// Guarda contra o engano que partiu o build três vezes: escrever num campo do
// Prisma que não existe.
//
// ─── O QUE ACONTECEU ────────────────────────────────────────────────────────
//
//   error TS2353: Object literal may only specify known properties, and
//   'notes' does not exist in type '...BalanceAdjustmentUncheckedCreateInput'
//
// O `BalanceAdjustment` não tem campo de notas, e o `createdById` chama-se
// `createdBy`. Escrevi os dois de cabeça, a partir de outro modelo onde esses
// nomes existem de facto.
//
// ─── E PORQUE É QUE NÃO APARECE AQUI ────────────────────────────────────────
//
// Porque quem conhece os nomes dos campos é o CLIENTE do Prisma, que nasce do
// `prisma generate`, que precisa do node_modules — e este ambiente não o tem.
// A verificação de tipos corre, não vê o cliente, e `data: { ... }` passa como
// um objecto qualquer.
//
// O schema.prisma, esse, está aqui. Os nomes estão lá escritos. É só ler.
//
// ─── O QUE ISTO VERIFICA ────────────────────────────────────────────────────
//
// Em cada `prisma.<modelo>.create({ data: { ... } })` (e `update`, `upsert`,
// `createMany`), que todas as chaves escritas no `data` existam no modelo.
//
// Não é o cliente do Prisma e não tenta ser. Apanha a classe de erro que me
// partiu o build: um nome de campo trocado. O que não souber ler, diz que não
// soube — em vez de calar e passar.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ─── Os campos de cada modelo, lidos do schema ──────────────────────────────

const schema = readFileSync('prisma/schema.prisma', 'utf8');

/** modelo → Set de nomes de campo escrevíveis */
const campos = new Map();
/** Nome do modelo em minúsculas (como o cliente o expõe) → nome real */
const porChamada = new Map();

for (const bloco of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const [, nome, corpo] = bloco;
  const set = new Set();

  for (const linha of corpo.split('\n')) {
    const limpa = linha.replace(/\/\/.*$/, '').trim();
    if (!limpa || limpa.startsWith('@@') || limpa.startsWith('///')) continue;

    const m = /^(\w+)\s+(\w+)(\[\])?(\?)?/.exec(limpa);
    if (!m) continue;
    set.add(m[1]);
  }

  campos.set(nome, set);
  // `BalanceAdjustment` → `balanceAdjustment`
  porChamada.set(nome[0].toLowerCase() + nome.slice(1), nome);
}

// ─── Encontrar os `data: { ... }` no código ─────────────────────────────────

function ficheiros(dir) {
  const fora = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fora.push(...ficheiros(p));
    else if (e.endsWith('.ts') && !e.endsWith('.test.ts')) fora.push(p);
  }
  return fora;
}

/**
 * O conteúdo entre `{` e o `}` que lhe faz par, a contar chaves.
 * Devolve null se as chaves não fecharem — e aí o chamador diz que não soube
 * ler, em vez de assumir que estava bem.
 */
function bloco(texto, abre) {
  let nivel = 0;
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i];
    if (c === '{') nivel++;
    else if (c === '}') {
      nivel--;
      if (nivel === 0) return texto.slice(abre + 1, i);
    }
  }
  return null;
}

/** As chaves do primeiro nível de um objecto, ignorando o que está aninhado. */
function chavesDoPrimeiroNivel(corpo) {
  const nomes = [];
  let nivel = 0;
  let inicioDeLinha = true;
  let acumulado = '';

  for (let i = 0; i < corpo.length; i++) {
    const c = corpo[i];

    if (c === '{' || c === '[' || c === '(') { nivel++; acumulado = ''; continue; }
    if (c === '}' || c === ']' || c === ')') { nivel--; acumulado = ''; continue; }

    if (nivel > 0) continue;

    if (c === ',' || c === '\n') { inicioDeLinha = true; acumulado = ''; continue; }

    if (c === ':') {
      const nome = acumulado.trim();
      if (inicioDeLinha && /^\w+$/.test(nome)) nomes.push(nome);
      acumulado = '';
      inicioDeLinha = false;
      continue;
    }

    acumulado += c;
  }

  return nomes;
}

const problemas = [];
const naoLidos = [];
let verificados = 0;

// `prisma.coisa.create({` ou `tx.coisa.update({` ou `this.db.coisa.upsert({`
const chamada = /\b(?:prisma|tx|db|cliente)\.(\w+)\.(create|update|upsert|createMany|updateMany)\s*\(\s*\{/g;

for (const f of ficheiros('src')) {
  const texto = readFileSync(f, 'utf8');

  for (const m of texto.matchAll(chamada)) {
    const [, chamado, operacao] = m;
    const modelo = porChamada.get(chamado);
    if (!modelo) continue; // `$transaction`, `$queryRaw`, e outros que não são modelos

    const corpoDaChamada = bloco(texto, m.index + m[0].length - 1);
    if (corpoDaChamada === null) {
      naoLidos.push(`${f}: ${chamado}.${operacao} — chaves não fecham`);
      continue;
    }

    // O `data:` dentro da chamada. `upsert` tem `create:` e `update:`.
    const alvos = operacao === 'upsert' ? ['create', 'update'] : ['data'];

    for (const alvo of alvos) {
      const re = new RegExp(`\\b${alvo}\\s*:\\s*\\{`, 'g');
      const d = re.exec(corpoDaChamada);
      if (!d) continue;

      const dados = bloco(corpoDaChamada, d.index + d[0].length - 1);
      if (dados === null) {
        naoLidos.push(`${f}: ${chamado}.${operacao} — \`${alvo}\` não fecha`);
        continue;
      }

      verificados++;
      const doModelo = campos.get(modelo);

      for (const chave of chavesDoPrimeiroNivel(dados)) {
        if (!doModelo.has(chave)) {
          const linha = texto.slice(0, m.index).split('\n').length;
          problemas.push({
            ficheiro: f, linha, modelo, operacao, chave,
            parecidos: [...doModelo].filter((x) =>
              x.toLowerCase().startsWith(chave.toLowerCase().slice(0, 4))
              || chave.toLowerCase().startsWith(x.toLowerCase().slice(0, 4))),
          });
        }
      }
    }
  }
}

if (naoLidos.length > 0) {
  console.error('');
  console.error('⚠ Chamadas que este guião não soube ler (não foram verificadas):');
  for (const n of naoLidos) console.error(`    ${n}`);
  console.error('');
}

if (problemas.length > 0) {
  console.error('');
  console.error('✗ Campos escritos que não existem no modelo:');
  console.error('');
  for (const p of problemas) {
    console.error(`  ${p.ficheiro}:${p.linha}`);
    console.error(`    ${p.modelo}.${p.operacao} → escreve \`${p.chave}\`, que não existe`);
    if (p.parecidos.length > 0) {
      console.error(`    será \`${p.parecidos.join('` ou `')}\`?`);
    }
    console.error('');
  }
  console.error('  O `tsc` do build apanha isto; aqui não, porque os nomes dos');
  console.error('  campos vivem no cliente do Prisma, que precisa do node_modules.');
  console.error('');
  process.exit(1);
}

console.log(`✓ ${verificados} escritas no Prisma, todos os campos existem no schema`);
