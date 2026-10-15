// scripts/verificar-relacoes.mjs
//
// Guarda contra o engano que partiu o build: uma relação com um lado só.
//
// ─── O QUE ACONTECEU ────────────────────────────────────────────────────────
//
// Duas linhas (`tranches CreditTranche[]` e `payments CreditPayment[]`) foram
// parar ao modelo `TradeEntry` em vez de ao `Credit`. O Prisma recusou-se a
// gerar o cliente e o deploy parou em `npm ci`:
//
//   The relation field `payments` on model `TradeEntry` is missing an
//   opposite relation field on the model `CreditPayment`.
//
// ─── E PORQUE É QUE NÃO APARECEU ANTES ──────────────────────────────────────
//
// Porque quem valida o `schema.prisma` é o `prisma generate`, e isso precisa
// do `node_modules`, que este ambiente não tem. A verificação de tipos não
// olha para o schema: olha para o CLIENTE que o schema gera — e o cliente não
// existe aqui.
//
// É a terceira vez que o build apanha uma coisa que a verificação local não
// vê. As duas primeiras deram guiões (`verificar-buffers`, os tipos do Node);
// esta dá este.
//
// ─── O QUE ISTO VERIFICA ────────────────────────────────────────────────────
//
// Uma relação no Prisma tem SEMPRE dois lados. Se o modelo A tem um campo do
// tipo B, o modelo B tem de ter um campo do tipo A. Quando há `@relation("x")`,
// o nome tem de bater nos dois.
//
// Não é o validador do Prisma e não tenta ser: é a regra que falhou, escrita
// de forma a correr em qualquer sítio, sem dependências.

import { readFileSync } from 'node:fs';

const texto = readFileSync('prisma/schema.prisma', 'utf8');

// ─── Os modelos e os seus campos ────────────────────────────────────────────

const modelos = new Map();

for (const bloco of texto.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const [, nome, corpo] = bloco;
  const campos = [];

  for (const linha of corpo.split('\n')) {
    const limpa = linha.replace(/\/\/.*$/, '').trim();
    if (!limpa || limpa.startsWith('@@') || limpa.startsWith('///')) continue;

    // `nomeDoCampo Tipo[]?  @relation("x", fields: [...], ...)`
    const m = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(limpa);
    if (!m) continue;

    const [, campo, tipo, lista, opcional, resto] = m;
    const relacao = /@relation\(\s*"([^"]+)"/.exec(resto)?.[1] ?? null;
    const temFields = /@relation\([^)]*\bfields:/.test(resto);

    campos.push({
      campo, tipo, lista: Boolean(lista), opcional: Boolean(opcional), relacao, temFields,
    });
  }

  modelos.set(nome, campos);
}

// Os tipos que não são modelos (escalares e enums) não têm lado oposto.
const ehModelo = (t) => modelos.has(t);

// ─── A verificação ──────────────────────────────────────────────────────────

const problemas = [];
let relacoes = 0;

for (const [nome, campos] of modelos) {
  for (const c of campos) {
    if (!ehModelo(c.tipo)) continue;
    relacoes++;

    const doOutroLado = modelos.get(c.tipo) ?? [];

    // Candidatos: campos do outro modelo que apontam de volta para este.
    let opostos = doOutroLado.filter((o) => o.tipo === nome);

    // Com nome de relação, só conta o lado com o MESMO nome. É isto que
    // permite dois caminhos diferentes entre os mesmos dois modelos — por
    // exemplo um fecho que tem quem o recebe e quem o criou.
    if (c.relacao) {
      opostos = opostos.filter((o) => o.relacao === c.relacao);
    } else {
      // Sem nome, o outro lado também não pode ter nome — senão são relações
      // diferentes que por acaso ligam os mesmos modelos.
      const semNome = opostos.filter((o) => !o.relacao);
      if (semNome.length > 0) opostos = semNome;
    }

    // Uma auto-relação (um modelo que aponta para si próprio) tem os dois
    // lados no mesmo bloco: o campo não pode ser o seu próprio oposto.
    if (c.tipo === nome) {
      opostos = opostos.filter((o) => o.campo !== c.campo);
    }

    if (opostos.length === 0) {
      problemas.push({
        modelo: nome,
        campo: c.campo,
        tipo: c.tipo,
        relacao: c.relacao,
        porque: `falta o campo oposto em ${c.tipo}`,
      });
      continue;
    }

    // Um dos dois lados tem de guardar a chave estrangeira, e só um.
    const comChave = [c, ...opostos].filter((x) => x.temFields).length;
    if (comChave === 0 && !c.lista) {
      problemas.push({
        modelo: nome,
        campo: c.campo,
        tipo: c.tipo,
        relacao: c.relacao,
        porque: 'nenhum dos dois lados guarda a chave (`fields:`)',
      });
    }
  }
}

if (problemas.length > 0) {
  console.error('');
  console.error('✗ Relações com um lado só no schema.prisma:');
  console.error('');
  for (const p of problemas) {
    console.error(`  model ${p.modelo} → campo \`${p.campo}\`: ${p.tipo}`);
    if (p.relacao) console.error(`    relação "${p.relacao}"`);
    console.error(`    → ${p.porque}`);
    console.error('');
  }
  console.error('  O `prisma generate` recusa-se a correr assim, e o deploy para em');
  console.error('  `npm ci`. Aqui não aparece porque validar o schema precisa do');
  console.error('  node_modules, que este ambiente não tem.');
  console.error('');
  process.exit(1);
}

console.log(`✓ ${relacoes} campos de relação, todos com os dois lados`);
