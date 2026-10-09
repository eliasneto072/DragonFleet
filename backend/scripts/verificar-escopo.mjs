// scripts/verificar-escopo.mjs
//
// Guarda contra o erro mais caro desta aplicação: uma consulta em SQL escrito à
// mão sem o filtro da frota.
//
// ─── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
//
// A camada em `src/config/escopo.ts` carimba a frota em todas as consultas do
// Prisma. O que ela NÃO vê é SQL: `$queryRaw` e `$queryRawUnsafe` passam-lhe ao
// lado. São perto de quarenta neste projeto — relatórios, saldos, análises — e
// uma sem filtro não dá erro nenhum: dá os números de um cliente somados aos de
// outro, com ar de estarem certos.
//
// Esta verificação lê cada uma e exige a palavra `fleet_id` lá dentro. Não
// prova que o filtro está CERTO — prova que alguém pensou nele. É o mesmo
// género de rede do aviso do `req.params` em `check.sh`: mecânica, estúpida, e
// apanha a distração de quem está a escrever código às duas da manhã.
//
// Correr com:  node scripts/verificar-escopo.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'src/modules';

/** Todos os .ts abaixo de uma pasta, sem os testes. */
function ficheiros(dir) {
  const fora = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) fora.push(...ficheiros(caminho));
    else if (nome.endsWith('.ts') && !nome.endsWith('.test.ts')) fora.push(caminho);
  }
  return fora;
}

/**
 * O texto de cada consulta, do `$queryRaw` até à crase de fecho.
 *
 * Procurar só até ao primeiro parêntesis não serve: `COUNT(*)` cortava a
 * consulta antes do WHERE e dava dezenas de alarmes falsos.
 */
function* consultas(s) {
  const re = /\$queryRaw(Unsafe)?/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    let i = s.indexOf('`', m.index + m[0].length);
    const par = s.indexOf('(', m.index + m[0].length);
    if (par !== -1 && (i === -1 || par < i)) i = s.indexOf('`', par);
    if (i === -1) continue;
    let k = i + 1;
    while (k < s.length && !(s[k] === '`' && s[k - 1] !== '\\')) k += 1;
    yield { texto: s.slice(i + 1, k), linha: s.slice(0, m.index).split('\n').length };
  }
}

const problemas = [];
let total = 0;

for (const f of ficheiros(RAIZ)) {
  const s = readFileSync(f, 'utf8');
  for (const { texto, linha } of consultas(s)) {
    if (!texto.toUpperCase().includes('SELECT')) continue;
    total += 1;
    if (!texto.includes('fleet_id')) {
      problemas.push(`${f}:${linha} → ${texto.replace(/\s+/g, ' ').trim().slice(0, 100)}`);
    }
  }
}

if (problemas.length > 0) {
  console.error(
    `\n✗ ${problemas.length} de ${total} consultas em SQL sem filtro de frota:\n`,
  );
  for (const p of problemas) console.error('  ' + p);
  console.error(
    '\nAcrescente `WHERE … fleet_id = ${frotaObrigatoria()}` — ou, se a consulta\n'
    + 'deve mesmo atravessar frotas, escreva porquê num comentário com a palavra\n'
    + 'fleet_id para esta verificação o reconhecer como deliberado.\n',
  );
  process.exit(1);
}

console.log(`✓ ${total} consultas em SQL, todas com filtro de frota`);
