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
import { comEscopo, entrarNaFrota, comoSistema } from '../config/escopo';

/** A frota onde os testes vivem. O mesmo id que a migração cria. */
export const FROTA_DE_TESTE = 'fleet_do_dono';
import { TEST_DATABASE_URL } from './db-url';
import { generateAccessToken } from '../modules/auth/auth.helpers';
import { UserRole } from '../shared/types/enums';

// A morada e a proteção vivem em db-url.ts, sem importações, para poderem ser
// usadas pelo setup-env antes de a aplicação ser carregada.

// Cliente próprio para as fábricas montarem o cenário e verificarem o resultado
// diretamente na base. Aponta ao MESMO sítio que a aplicação — o setup-env
// garante isso — mas é um cliente separado, para as consultas dos testes não
// passarem pelo caminho que estão a testar.
//
// ─── AS FIXTURES ESCREVEM DENTRO DA FROTA DE TESTE ──────────────────────────
//
// O cliente leva a mesma camada de âmbito da aplicação (`comEscopo`), e o
// `entrarNaFrota` logo abaixo fixa a frota para tudo o que corra neste
// processo. Assim as dezenas de fixtures espalhadas pelos testes continuam a
// escrever como sempre escreveram — sem terem de dizer a frota uma a uma — e
// as leituras delas veem só o que lá puseram.
//
// Fazê-lo aqui e não em cada ficheiro é o que evita setenta e três edições
// iguais, e setenta e três sítios onde alguém se pode esquecer.
export const testDb = comEscopo(new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
  log: ['warn', 'error'],
}));

entrarNaFrota(FROTA_DE_TESTE);

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
  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'pipe',
    });
  } catch (err: any) {
    // `stdio: 'pipe'` mantém a saída fora da consola quando corre bem — são
    // dezenas de linhas de ruído antes de cada execução. Mas quando falha, essa
    // mesma opção esconde a razão, e o que se vê é uma exceção sem mensagem.
    //
    // Aconteceu na integração contínua: as migrações falhavam e o registo não
    // dizia porquê. Agora a saída do Prisma é reencaminhada.
    const saida = [err?.stdout?.toString(), err?.stderr?.toString()]
      .filter(Boolean).join('\n').trim();

    throw new Error(
      '[testes] As migrações falharam contra a base de testes.\n' +
      `  base: ${TEST_DATABASE_URL.replace(/:[^:@]*@/, ':***@')}\n` +
      'Confirme que o postgres-test está de pé: docker compose up -d postgres-test\n\n' +
      (saida || String(err)),
    );
  }
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

  // ─── A frota tem de voltar ────────────────────────────────────────────
  //
  // O TRUNCATE leva `fleets` com o resto, e sem uma frota não se consegue
  // criar nada: a coluna é obrigatória em todas as tabelas. Repô-la aqui
  // mantém os testes a escrever fixtures como sempre escreveram — o id é o
  // mesmo que a migração usa, por isso nada mais precisa de saber dela.
  await comoSistema(async () => await testDb.fleet.create({
    data: { id: FROTA_DE_TESTE, name: 'Frota de teste', slug: 'frota-de-teste' },
  }));
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
