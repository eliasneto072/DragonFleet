// scripts/verificar-multipart.mjs
//
// Guarda contra o erro que deu «Internal server error» ao responder a um
// pedido de extrato: uma rota com ficheiro que se esquece de repor a frota.
//
// ─── O QUE ACONTECEU ────────────────────────────────────────────────────────
//
//   ErroDeEscopo: SettlementQuery.findFirst correu fora de qualquer frota.
//
// O `escopoDaFrota` envolve o `next()` numa frota e tudo o que corre a seguir
// herda-a — enquanto correr dentro dessa cadeia. O multer não corre: lê o
// corpo do pedido e só chama o `next()` no fim, de dentro de um evento do
// stream `req`. Esse stream foi criado pelo servidor de HTTP antes de qualquer
// middleware, fora da frota, e é o contexto DELE que o Node repõe.
//
// Resultado: em toda e qualquer rota multipart, o resto do pedido corre sem
// frota. Não era só a resposta aos pedidos de extrato — eram as sete.
//
// ─── E PORQUE É QUE NÃO SE VIU ──────────────────────────────────────────────
//
// Porque é preciso um servidor de HTTP a sério, com um corpo a sério, para o
// contexto se perder. Nem os tipos nem os testes puros apanham isto; só uma
// chamada verdadeira. Apanhou-a o utilizador.
//
// ─── O QUE ISTO VERIFICA ────────────────────────────────────────────────────
//
// Que toda a rota com `upload.single/array/fields` tem `reporFrota` logo a
// seguir. Logo a seguir e não mais à frente: entre os dois não pode haver
// nada que toque na base de dados.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function ficheiros(dir) {
  const fora = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fora.push(...ficheiros(p));
    else if (e.endsWith('.ts') && !e.endsWith('.test.ts')) fora.push(p);
  }
  return fora;
}

const problemas = [];
let verificadas = 0;

// `upload.single('x'),` e o que vem logo a seguir, até à vírgula ou ao fim.
const multipart = /upload\.(single|array|fields)\s*\([^)]*\)\s*,\s*([A-Za-z_$][\w$]*)?/g;

for (const f of ficheiros('src')) {
  const texto = readFileSync(f, 'utf8');

  for (const m of texto.matchAll(multipart)) {
    verificadas++;
    const seguinte = m[2];
    if (seguinte !== 'reporFrota') {
      problemas.push({
        ficheiro: f,
        linha: texto.slice(0, m.index).split('\n').length,
        seguinte: seguinte ?? '(nada)',
      });
    }
  }

  // E que o import existe, se a palavra é usada.
  if (texto.includes('reporFrota,') && !/import\s*\{[^}]*\breporFrota\b/.test(texto)) {
    problemas.push({
      ficheiro: f,
      linha: texto.slice(0, texto.indexOf('reporFrota')).split('\n').length,
      seguinte: 'usa `reporFrota` sem o importar',
    });
  }
}

if (problemas.length > 0) {
  console.error('');
  console.error('✗ Rotas com ficheiro que não repõem a frota:');
  console.error('');
  for (const p of problemas) {
    console.error(`  ${p.ficheiro}:${p.linha}`);
    console.error(`    a seguir ao upload vem \`${p.seguinte}\`, devia vir \`reporFrota\``);
    console.error('');
  }
  console.error('  O multer chama o `next()` de dentro de um evento do stream do');
  console.error('  pedido, e aí o contexto da frota já não existe. Sem o repor,');
  console.error('  a primeira consulta ao Prisma atira ErroDeEscopo e o');
  console.error('  utilizador vê «Internal server error».');
  console.error('');
  console.error('    router.post(\'/x\', upload.single(\'f\'), reporFrota, controlador);');
  console.error('');
  process.exit(1);
}

console.log(`✓ ${verificadas} rota(s) com ficheiro, todas repõem a frota`);
