// src/test/harness.ts
//
// Base dos testes de integração: base de dados real, aplicação real, HTTP real.
//
// ─── O QUE ESTES TESTES SÃO ──────────────────────────────────────────────────
//
// Ao contrário dos unitários, aqui nada é substituído por imitações. O pedido
// entra pelo Express, passa pelos middlewares de autenticação, pelo zod, pelo
// service, pelo Prisma e chega ao Postgres. O que se verifica é o comportamento
// do sistema, não o de uma função.
//
// É por isso que estes testes apanham coisas que os unitários nunca apanhariam:
// uma coluna que falta na migração, uma rota registada no sítio errado, um
// middleware de permissões esquecido. E é por isso que são mais lentos — cada
// um paga o preço de falar com uma base de dados a sério.
//
// ─── ISOLAMENTO ──────────────────────────────────────────────────────────────
//
// Cada teste começa com a base vazia. O `TRUNCATE` corre antes de cada caso e
// não depois: se um teste rebentar a meio, o seguinte continua a arrancar
// limpo em vez de herdar os destroços.
//
// Optou-se por TRUNCATE e não por envolver cada teste numa transação revertida
// no fim. A transação é mais rápida, mas o settlements.service abre as suas
// próprias transações com $transaction, e transações encaixadas comportam-se de
// maneira diferente — os testes passariam a exercitar um caminho que a produção
// nunca percorre. Mais lento e honesto ganha a mais rápido e enganador.
//
// ─── PROTEÇÃO ────────────────────────────────────────────────────────────────
//
// Este ficheiro apaga tabelas inteiras. A verificação do nome da base é o que
// separa "correu a suite" de "perdeu o trabalho da semana".

import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { TEST_DATABASE_URL } from './db-url';
import { generateAccessToken } from '../modules/auth/auth.helpers';
import { UserRole } from '../shared/types/enums';

// A morada e a proteção vivem em db-url.ts, sem importações, para poderem ser
// usadas pelo setup-env antes de a aplicação ser carregada.

// Cliente próprio para as fábricas montarem o cenário e verificarem o resultado
// diretamente na base. Aponta ao MESMO sítio que a aplicação — o setup-env
// garante isso — mas é um cliente separado, para as consultas dos testes não
// passarem pelo caminho que estão a testar.
export const testDb = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
  log: ['warn', 'error'],
});

/**
 * Aplica as migrações à base de testes.
 *
 * `migrate deploy` e não `db push`: é o mesmo comando que corre em produção,
 * portanto os testes exercitam o esquema tal como ele existe lá — incluindo as
 * migrações escritas à mão. Um erro numa delas aparece aqui.
 *
 * Corre uma vez por execução da suite, no globalSetup.
 */
export function applyMigrations(): void {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}

/**
 * Esvazia todas as tabelas de dados.
 *
 * A lista vem do catálogo do próprio Postgres em vez de estar escrita à mão:
 * uma tabela nova passa a ser limpa sozinha, sem ninguém se lembrar de a
 * acrescentar aqui. Uma tabela esquecida deixaria lixo entre testes e o
 * sintoma apareceria noutro sítio qualquer.
 *
 * `_prisma_migrations` fica de fora — é o registo do que já foi aplicado, e
 * apagá-lo faria o migrate deploy tentar correr tudo outra vez.
 *
 * CASCADE trata das chaves estrangeiras sem obrigar a acertar a ordem.
 */
export async function resetDb(): Promise<void> {
  const tables = await testDb.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;

  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await testDb.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

/**
 * Cabeçalho de autenticação para um utilizador.
 *
 * Assina um token a sério com o segredo da aplicação, em vez de simular o
 * middleware. Assim o teste percorre a autenticação toda — e se alguém mexer na
 * forma do token, estes testes dão conta.
 */
export function authHeader(userId: string, role: UserRole): { Authorization: string } {
  return { Authorization: `Bearer ${generateAccessToken(userId, role)}` };
}

/**
 * A aplicação e os testes estão mesmo a falar com a mesma base?
 *
 * Vale a pena existir por causa de como isto falhou da primeira vez: as
 * fábricas escreviam na base de testes e a aplicação lia da de desenvolvimento.
 * Doze testes falharam com 404 — mas seis PASSARAM, porque verificavam que nada
 * tinha mudado ou aceitavam qualquer erro. Passavam pela razão errada.
 *
 * Esta verificação corre uma vez e falha alto se a ligação estiver partida, em
 * vez de deixar a suite inteira dar respostas sem significado.
 */
export async function assertSameDatabase(): Promise<void> {
  const daApp = process.env.DATABASE_URL;
  if (daApp !== TEST_DATABASE_URL) {
    throw new Error(
      '[testes] A aplicação e os testes apontam a bases diferentes.\n' +
      `  testes: ${TEST_DATABASE_URL}\n` +
      `  app:    ${daApp}\n` +
      'O setup-env.ts devia ter definido isto. Confirme setupFiles na config.',
    );
  }
}
