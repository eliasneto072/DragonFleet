// backend/prisma/seed-guard.ts
//
// Os seeds que reutilizam lógica do backend só correm A PARTIR DA SUA MÁQUINA,
// nunca de dentro do contentor.
//
// ─── PORQUÊ ──────────────────────────────────────────────────────────────────
//
// A fase de produção do Dockerfile copia apenas `prisma/` e o `dist/`
// compilado — NÃO copia `src/`, e é assim que deve ser: uma imagem de produção
// não leva código-fonte nem dependências de desenvolvimento.
//
// Mas o seed-demo e o seed-perf importam o `computeTotals` de `src/`, para os
// números que geram serem calculados pela MESMA fórmula que a aplicação usa.
// Copiar a fórmula para dentro do seed resolveria o arranque e criaria um
// problema pior: os dados de teste divergiriam da aplicação assim que um dos
// dois mudasse, em silêncio.
//
// Dentro do contentor, esse import falha com um MODULE_NOT_FOUND que não
// explica nada. Esta verificação troca-o por uma mensagem que diz o que fazer.
//
// O seed-admin não passa por aqui de propósito: não importa nada de `src/`, e
// por isso corre nos dois sítios.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function assertTemCodigoFonte(): void {
  const src = join(__dirname, '..', 'src', 'modules', 'settlements');
  if (existsSync(src)) return;

  console.error(`
[seed] Este script precisa do código-fonte e não o encontrou.

  Procurou em: ${src}

Está a correr dentro do contentor? A imagem de produção não leva a pasta src/ —
só o dist/ compilado. Corra a partir da sua máquina:

  cd backend

  # a morada exata da base, tirada do proprio contentor:
  docker compose exec backend printenv DATABASE_URL

  # a mesma, mas com a porta que o Docker expoe para fora:
  #   @postgres:5432  ->  @localhost:5433

  SEED_PERF=1 DATABASE_URL="...@localhost:5433/..." npx tsx prisma/seed-perf.ts
`);
  process.exit(1);
}
