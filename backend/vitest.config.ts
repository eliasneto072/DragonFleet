// backend/vitest.config.ts
//
// Configuração dos testes do backend.
//
// POR QUE VITEST E NÃO JEST: o projeto já é TypeScript com ESM e usa esbuild
// por baixo (tsx). O Vitest corre TypeScript sem transformação configurada à
// mão — com Jest seria preciso ts-jest ou babel, mais um ficheiro de config e
// mais uma coisa que parte quando as versões mudam. E o frontend, quando levar
// testes, usa o mesmo executor: uma sintaxe para aprender em vez de duas.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Ficheiros de teste ao lado do que testam, e não numa árvore paralela.
    //
    // A árvore paralela obriga a manter duas estruturas em sincronia e afasta o
    // teste do código: quem altera uma função tem de se lembrar de ir procurar
    // o teste noutro sítio. Ao lado, o ficheiro está à vista no mesmo
    // diretório, e um `settlements.types.ts` sem `settlements.types.test.ts` ao
    // lado é uma ausência visível.
    include: ['src/**/*.test.ts'],

    // Node e não jsdom: isto é backend, não há DOM nenhum para simular.
    environment: 'node',

    // Sem `describe`/`it`/`expect` globais. Importar explicitamente custa uma
    // linha por ficheiro e dá em troca autocompletar e tipos corretos, além de
    // tornar óbvio de onde vêm essas funções para quem nunca viu Vitest.
    globals: false,

    // Testes que dependem da hora a que correm falham às terças-feiras e
    // ninguém percebe porquê. Fuso fixo para o comportamento ser igual aqui e
    // na máquina de qualquer outra pessoa.
    env: { TZ: 'UTC' },

    coverage: {
      provider: 'v8',
      // A cobertura é um DIAGNÓSTICO, não uma meta.
      //
      // Não há limiar mínimo configurado de propósito. Um número obrigatório
      // leva a escrever testes para o subir — testes que percorrem código sem
      // afirmar nada de útil — e isso é pior do que não ter teste nenhum,
      // porque dá a sensação de estar coberto.
      //
      // Serve para responder a "que parte disto nunca foi corrida por um
      // teste?", que é uma pergunta útil de fazer de vez em quando.
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/server.ts', 'src/config/**'],
    },
  },
});
