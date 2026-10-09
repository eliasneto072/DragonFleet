// scripts/verificar-chaves.mjs
//
// Apanha o erro que custou três deploys seguidos: procurar por uma chave que
// deixou de ser chave.
//
// ─── O QUE ACONTECEU ────────────────────────────────────────────────────────
//
// Ao passar as unicidades para "por frota" — a matrícula, o nome do material, o
// tipo de serviço, o nível —, todas as chamadas que procuravam por esses campos
// com `findUnique`, `update` ou `delete` deixaram de compilar. O Prisma exige a
// chave INTEIRA, e esses sítios só conhecem metade dela.
//
// O compilador apanha isto, mas só com os tipos do Prisma gerados — que exigem
// `npm install` e `prisma generate`. Quem escreve sem isso à mão descobre no
// deploy, um erro de cada vez.
//
// ─── O QUE ISTO FAZ ─────────────────────────────────────────────────────────
//
// Lê o `schema.prisma`, fica a saber que campos são chave em cada modelo, e
// percorre o código à procura de operações por chave cujo `where` use um campo
// que já não o é. É grosseiro de propósito: não percebe de TypeScript, percebe
// de nomes. Falha a favor do aviso.
//
// Correr com:  node scripts/verificar-chaves.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ESQUEMA = 'prisma/schema.prisma';
const RAIZ = 'src';

/** Operações que o Prisma obriga a receber uma chave única no `where`. */
const POR_CHAVE = ['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert'];

// ── 1. Que campos são chave em cada modelo ────────────────────────────────
const esquema = readFileSync(ESQUEMA, 'utf8');
const chavesPorModelo = new Map();

for (const m of esquema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  const [, nome, corpo] = m;
  const chaves = new Set();

  for (const linha of corpo.split('\n')) {
    const campo = linha.match(/^\s+(\w+)\s+\S+/);
    if (!campo) continue;
    // `@id` ou `@unique` na própria linha do campo, mas não `@@id`/`@@unique`
    const semBlocos = linha.replace(/@@\w+/g, '');
    if (/@id\b/.test(semBlocos) || /@unique\b/.test(semBlocos)) chaves.add(campo[1]);
  }

  // Chaves compostas: só valem escritas por inteiro, e o nome que o Prisma lhes
  // dá é a junção dos campos. Guardamos esse nome.
  for (const c of corpo.matchAll(/@@(?:id|unique)\(\[([^\]]+)\]/g)) {
    const campos = c[1].split(',').map((x) => x.trim());
    chaves.add(campos.join('_'));
  }

  chavesPorModelo.set(nome, chaves);
}

/** `User` → `user`, para casar com `prisma.user.` */
const porNomeMinusculo = new Map(
  [...chavesPorModelo].map(([k, v]) => [k[0].toLowerCase() + k.slice(1), v]),
);

// ── 2. Percorrer o código ─────────────────────────────────────────────────
function ficheiros(dir) {
  const fora = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) fora.push(...ficheiros(caminho));
    else if (nome.endsWith('.ts')) fora.push(caminho);
  }
  return fora;
}

const problemas = [];
let total = 0;

const padrao = new RegExp(
  `\\b(?:prisma|tx|testDb)\\.(\\w+)\\.(${POR_CHAVE.join('|')})\\(\\s*\\{\\s*where:\\s*\\{\\s*(\\w+)`,
  'g',
);

for (const f of ficheiros(RAIZ)) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(padrao)) {
    const [, modelo, operacao, campo] = m;
    const chaves = porNomeMinusculo.get(modelo);
    if (!chaves) continue;          // não é um modelo nosso
    total += 1;
    if (!chaves.has(campo)) {
      const linha = s.slice(0, m.index).split('\n').length;
      problemas.push(
        `${f}:${linha} → ${modelo}.${operacao}({ where: { ${campo} … } }) — `
        + `"${campo}" já não é chave única em ${modelo}`,
      );
    }
  }
}

if (problemas.length > 0) {
  console.error(`\n✗ ${problemas.length} de ${total} operações por chave usam um campo que não é chave:\n`);
  for (const p of problemas) console.error('  ' + p);
  console.error(
    '\nTroque por `findFirst` / `updateMany` / `deleteMany`: essas aceitam\n'
    + 'qualquer campo, e levam o filtro da frota da camada do âmbito.\n',
  );
  process.exit(1);
}

console.log(`✓ ${total} operações por chave, todas com uma chave a sério`);
