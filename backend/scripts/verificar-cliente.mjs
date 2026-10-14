// scripts/verificar-cliente.mjs
//
// Guarda contra construir um cliente da base de dados à mão.
//
// ─── O ERRO QUE ISTO APANHA ─────────────────────────────────────────────────
//
// Escrever `new PrismaClient()` em vez de importar o cliente de
// `config/prisma`. O cliente cru não leva a camada do âmbito, por isso:
//
//   · o `comFrota()` à volta não serve de nada — ele não sabe que existe;
//   · cada linha escrita nasce com a frota vazia;
//   · e a chave estrangeira recusa-a com `..._fleet_id_fkey`.
//
// Aconteceu duas vezes. No `seed-frota-exemplo`, que rebentou na primeira
// linha que tentou escrever; e no `seed-admin`, onde estava desde sempre e
// ninguém tinha reparado porque o script quase nunca corre.
//
// ─── PORQUE É QUE ISTO FALHA RUIDOSAMENTE, E AINDA BEM ──────────────────────
//
// Porque `fleetId` tem `@default("")` e uma chave estrangeira para `fleets`.
// Uma escrita que escape ao âmbito não vai parar à frota errada em silêncio:
// não vai parar a lado nenhum, e grita. Esta guarda existe para a mesma coisa
// ser apanhada antes de alguém a correr, em vez de no meio da consola do
// Render.
//
// ─── AS DUAS EXCEÇÕES ───────────────────────────────────────────────────────
//
// `config/prisma.ts`  — é o sítio onde o cliente nasce. É esse o trabalho dele.
// `test/harness.ts`   — constrói o cliente mas aplica-lhe `comEscopo(...)` ali
//                       mesmo, que é a mesma coisa feita à mão para os testes.
//
// Correr com:  node scripts/verificar-cliente.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'src';

const PERMITIDOS = new Set([
  join('src', 'config', 'prisma.ts'),
  join('src', 'test', 'harness.ts'),
]);

function ficheiros(dir) {
  const fora = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) fora.push(...ficheiros(caminho));
    else if (/\.ts$/.test(nome)) fora.push(caminho);
  }
  return fora;
}

const problemas = [];
let total = 0;

for (const f of ficheiros(RAIZ)) {
  const texto = readFileSync(f, 'utf8');

  // Fora dos comentários: este ficheiro e os seeds falam de `new
  // PrismaClient()` por escrito, a explicar porque é que não se deve usar.
  const limpo = texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  const linhas = limpo.split('\n');
  for (let i = 0; i < linhas.length; i += 1) {
    if (!/\bnew\s+PrismaClient\s*\(/.test(linhas[i])) continue;
    total += 1;
    if (!PERMITIDOS.has(f)) problemas.push(`${f}:${i + 1}`);
  }
}

if (problemas.length > 0) {
  console.error(`\n✗ ${problemas.length} cliente(s) da base de dados construído(s) à mão:\n`);
  for (const p of problemas) console.error('  ' + p);
  console.error(
    '\nUm cliente assim não leva a camada do âmbito: o `comFrota()` à volta\n'
    + 'não lhe diz nada e cada escrita nasce com a frota vazia, que a chave\n'
    + 'estrangeira recusa. Usa `import { prisma } from \'…/config/prisma\'`.\n'
    + 'Ver a nota no topo deste ficheiro.\n',
  );
  process.exit(1);
}

console.log(`✓ ${total} cliente(s) construído(s), todos nos dois sítios onde é suposto`);
