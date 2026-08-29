// backend/vitest.integration.config.ts
//
// Configuração separada dos testes de integração.
//
// POR QUE UM FICHEIRO À PARTE: estes precisam de Postgres de pé e demoram
// segundos, não milissegundos. Misturados com os unitários, o `npm test` do dia
// a dia passava a exigir Docker — e um comando que exige preparação acaba por
// não ser corrido. Ficam em `npm run test:integration`, e no CI correm os dois.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    globals: false,
    env: { TZ: 'UTC' },

    // Em série e não em paralelo. Os testes partilham uma base de dados e cada
    // um limpa-a antes de começar: em paralelo, um apagaria as tabelas debaixo
    // de outro a meio da execução. Isolar por processo exigiria uma base por
    // ficheiro, o que custa mais do que rende nesta escala.
    //
    // O `poolOptions` deixou de existir no Vitest 4 — as opções do pool passaram
    // a ser de topo. O `fileParallelism: false` é o que garante a execução em
    // série; o antigo `{ threads: { singleThread: true } }` era redundante com
    // ele e foi removido em vez de traduzido.
    fileParallelism: false,

    // Aponta o DATABASE_URL à base de testes ANTES de a aplicação ser
    // carregada. Sem isto, o cliente Prisma do config/prisma liga-se à base de
    // desenvolvimento e os testes escrevem numa base enquanto a app lê de
    // outra — com o sintoma enganador de tudo responder 404.
    setupFiles: ['./src/test/setup-env.ts'],

    // Migrações aplicadas uma vez, antes de tudo.
    globalSetup: ['./src/test/global-setup.ts'],

    // Postgres a arrancar de fresco é lento na primeira ligação.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
