// scripts/verificar-aninhados.mjs
//
// Guarda contra criações ANINHADAS dentro do `data` de uma escrita.
//
// ─── O ERRO QUE ISTO APANHA ─────────────────────────────────────────────────
//
// A camada do âmbito (`src/config/escopo.ts`) carimba a frota no `data` de
// topo de cada escrita. NÃO desce às relações lá dentro. Então isto:
//
//   prisma.investmentPlan.create({
//     data: {
//       name: …,
//       rates: { create: { annualRate: … } },   // ← sem frota
//     },
//   })
//
// cria o plano na frota certa e a taxa com `fleet_id` vazio. A chave
// estrangeira recusa o vazio — de propósito, é para isso que ele existe — e a
// pessoa vê "internal server error" ao carregar em Guardar.
//
// Aconteceu a sério, na criação de planos de investimento, e ficou meses sem
// dar por isso porque era a única escrita aninhada do projeto.
//
// ─── O QUE FAZER EM VEZ DISSO ───────────────────────────────────────────────
//
// Duas escritas, numa transação:
//
//   await prisma.$transaction(async (tx) => {
//     const p = await tx.investmentPlan.create({ data: { … } });
//     await tx.investmentPlanRate.create({ data: { planId: p.id, … } });
//   });
//
// As duas passam pela camada, as duas levam a frota.
//
// ─── O QUE ISTO NÃO ASSINALA ────────────────────────────────────────────────
//
// O `create` de um `upsert`. Esse é de topo e a camada trata dele — está
// escrito e testado em `aplicarEscrita`. Por isso o padrão exige um NOME DE
// RELAÇÃO antes: `rates: { create:` é aninhado, `create: {` sozinho não é.
//
// Correr com:  node scripts/verificar-aninhados.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'src';

function ficheiros(dir) {
  const fora = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      // Os testes e as fixtures montam dados à mão, fora de um pedido, e
      // declaram a frota eles próprios (ver `src/test/harness.ts`).
      if (nome === 'test') continue;
      fora.push(...ficheiros(caminho));
    } else if (nome.endsWith('.ts') && !nome.endsWith('.test.ts')) {
      fora.push(caminho);
    }
  }
  return fora;
}

// `nomeDaRelacao: { create:` — o nome antes é o que distingue uma criação
// aninhada do `create` de um upsert.
const ANINHADO = /\b([a-zA-Z_]\w*)\s*:\s*\{\s*(create|createMany|connectOrCreate)\b/g;

const problemas = [];

for (const f of ficheiros(RAIZ)) {
  const s = readFileSync(f, 'utf8');
  for (const linha of s.split('\n').keys()) {
    const texto = s.split('\n')[linha];
    // Comentários não são código.
    if (/^\s*(\/\/|\*|\/\*)/.test(texto)) continue;

    ANINHADO.lastIndex = 0;
    let m;
    while ((m = ANINHADO.exec(texto)) !== null) {
      problemas.push(`${f}:${linha + 1} → ${m[1]}: { ${m[2]} … }`);
    }
  }
}

if (problemas.length > 0) {
  console.error(`\n✗ ${problemas.length} criação(ões) aninhada(s) sem carimbo de frota:\n`);
  for (const p of problemas) console.error('  ' + p);
  console.error(
    '\nA camada do âmbito não desce às relações dentro do `data`. Separe em\n'
    + 'duas escritas dentro de um $transaction — ver a nota no topo deste\n'
    + 'ficheiro.\n',
  );
  process.exit(1);
}

console.log('✓ nenhuma criação aninhada: todas as escritas levam a frota');
