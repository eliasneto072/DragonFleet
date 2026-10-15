// scripts/verificar-graficos.mjs
//
// Guarda contra o engano que partiu o build do Cloudflare: anotar um valor do
// recharts com um tipo que o recharts não conhece.
//
// ─── O QUE ACONTECEU ────────────────────────────────────────────────────────
//
//   pessoal-creditos.tsx(150,13): error TS2769: No overload matches this call.
//     Type '(v: number | null) => string' is not assignable to
//     type 'Formatter<ValueType, NameType>'.
//       Type 'string' is not assignable to type 'number'.
//
// Escrevi `formatter={(v: number | null) => ...}` porque o dado pode ser nulo
// — a reta dos pagamentos acaba onde o tempo acaba. Mas o recharts declara o
// valor como `number | string | Array<number | string>`, e `null` não está lá.
// O ficheiro inteiro foi recusado, o `tsc -b` parou, e o site ficou a servir
// a construção anterior durante horas sem ninguém perceber — porque quem
// falhou foi o Cloudflare, e nós estávamos a olhar para o Render.
//
// ─── E PORQUE É QUE NÃO APARECE AQUI ────────────────────────────────────────
//
// Porque o tipo `Formatter` vive dentro do recharts, no node_modules, e este
// ambiente não o tem. Sem ele o `tsc` não compara nada e a anotação passa.
//
// ─── O QUE ISTO VERIFICA ────────────────────────────────────────────────────
//
// Nas propriedades de callback do recharts (`formatter`, `labelFormatter`,
// `tickFormatter`), que a anotação do parâmetro não inclua `null` nem
// `undefined` — os dois que não existem no tipo do recharts.
//
// O dado PODE ser nulo, e isso trata-se dentro da função, com `typeof`. O que
// não se pode é prometer ao recharts um tipo que ele não reconhece.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function ficheiros(dir) {
  const fora = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fora.push(...ficheiros(p));
    else if (e.endsWith('.tsx') || e.endsWith('.ts')) fora.push(p);
  }
  return fora;
}

// `formatter={(v: number | null) => ...}` — apanha a lista de parâmetros até
// à seta, que é onde as anotações vivem.
const propriedade = /\b(formatter|labelFormatter|tickFormatter)\s*=\s*\{\s*\(([^)]*)\)/g;

const problemas = [];
let verificados = 0;

for (const f of ficheiros('src')) {
  const texto = readFileSync(f, 'utf8');

  for (const m of texto.matchAll(propriedade)) {
    const [, prop, params] = m;
    if (!params.includes(':')) continue; // sem anotação, o tipo vem do contexto
    verificados++;

    const proibido = /:\s*[^,)]*\b(null|undefined)\b/.exec(params);
    if (proibido) {
      problemas.push({
        ficheiro: f,
        linha: texto.slice(0, m.index).split('\n').length,
        prop,
        params: params.trim(),
        palavra: proibido[1],
      });
    }
  }
}

if (problemas.length > 0) {
  console.error('');
  console.error('✗ Callbacks de gráfico com um tipo que o recharts não conhece:');
  console.error('');
  for (const p of problemas) {
    console.error(`  ${p.ficheiro}:${p.linha}`);
    console.error(`    ${p.prop}={(${p.params}) => …}`);
    console.error(`    → \`${p.palavra}\` não existe no tipo do recharts`);
    console.error('      (o valor é `number | string | Array<number | string>`)');
    console.error('');
  }
  console.error('  O dado PODE vir nulo — trata-se disso DENTRO da função:');
  console.error('');
  console.error('    formatter={(v: number | string) =>');
  console.error("      typeof v === 'number' ? formatCurrency(v) : '—'}");
  console.error('');
  console.error('  `typeof null` é `\'object\'`, por isso o nulo cai no ramo de');
  console.error('  baixo sem precisar de estar na anotação.');
  console.error('');
  console.error('  O `tsc -b` do Cloudflare recusa o ficheiro inteiro com TS2769.');
  console.error('  Aqui não aparece porque o tipo `Formatter` vive no recharts,');
  console.error('  que não está instalado neste ambiente.');
  console.error('');
  process.exit(1);
}

console.log(`✓ ${verificados} callbacks de gráfico com tipo escrito, nenhum com null/undefined`);
