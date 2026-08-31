// src/test/db-url.ts
//
// A morada da base de testes, isolada num ficheiro SEM importações.
//
// Tem de ser importável antes de tudo o resto: o setup-env.ts usa-a para
// definir o DATABASE_URL antes de a aplicação ser carregada, e nessa altura
// nada mais pode ter sido avaliado. Um único import aqui — de config/env, por
// exemplo — puxaria o dotenv para dentro e a ordem deixaria de valer.

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5434/dragonfleet_test';

/**
 * Recusa correr contra uma base cujo nome não termine em `_test`.
 *
 * Estes testes apagam tabelas inteiras. Uma variável mal apontada, um `.env`
 * copiado da produção ou um terminal na janela errada não devem chegar para
 * perder dados.
 */
export function assertTestDatabase(url: string): void {
  const dbName = url.split('/').pop()?.split('?')[0] ?? '';
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `[testes] Recusado: a base "${dbName}" não termina em _test.\n` +
      'Aponte TEST_DATABASE_URL a uma base descartável — o serviço\n' +
      'postgres-test do docker-compose serve.',
    );
  }
}
