// src/config/escopo.ts
//
// A frota de quem está a pedir, e a garantia de que nenhuma consulta sai dela.
//
// ─── O PROBLEMA ─────────────────────────────────────────────────────────────
//
// Este sistema tem cerca de quatrocentas consultas à base de dados. A partir do
// momento em que há mais do que uma frota, cada uma delas precisa de saber a
// que frota pertence o que vai ler ou escrever.
//
// Corrigi-las à mão é escrever quatrocentos `where` iguais e acertar em todos.
// Uma esquecida não dá erro, não dá aviso, e não aparece em nenhum teste que
// corra com uma frota só: dá os motoristas de um cliente a aparecer na conta de
// outro. Numa casa onde se vendem contas, isso não é um defeito — é o fim.
//
// ─── A SOLUÇÃO ──────────────────────────────────────────────────────────────
//
// O carimbo é automático. Guarda-se a frota do pedido num armazenamento ligado
// à execução assíncrona (`AsyncLocalStorage`) e uma extensão do Prisma
// acrescenta-a a TUDO: aos `where` das leituras, aos `data` das escritas, aos
// `where` das alterações.
//
// E, o que importa mais: **sem frota definida, a consulta rebenta**. O estado
// de omissão é a recusa e não a passagem. Uma tabela nova fica protegida sem
// ninguém se lembrar de a proteger, e um módulo novo que se esqueça do âmbito
// falha no primeiro teste em vez de falhar em silêncio durante meses.
//
// É a mesma ideia do muro dos investidores em `routes.ts`, aplicada à base de
// dados em vez de às rotas.
//
// ─── O QUE ISTO NÃO COBRE ───────────────────────────────────────────────────
//
// SQL escrito à mão (`$queryRaw`). A extensão vê as operações do Prisma, não o
// SQL cru — e há 41 consultas dessas neste projeto, nos relatórios, nos saldos
// e nas análises. Essas têm de levar o filtro escritas à mão, e há um teste
// que as enumera para que nenhuma passe despercebida.

import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient, Prisma } from '@prisma/client';

/** Quem está a pedir, do ponto de vista dos dados. */
export interface Escopo {
  /**
   * A frota. `null` só em modo de dono ou de sistema.
   */
  fleetId: string | null;

  /**
   * - `frota`   — um pedido normal, de dentro de uma frota.
   * - `dono`    — o painel do dono da plataforma, que vê todas de propósito.
   * - `sistema` — arranque, migrações, trabalhos que percorrem as frotas.
   *
   * Os dois últimos existem porque há leituras legítimas que atravessam
   * frotas. Mas são DECLARADOS: ninguém atravessa frotas por distração.
   */
  modo: 'frota' | 'dono' | 'sistema';
}

const armazem = new AsyncLocalStorage<Escopo>();

/** O escopo atual, ou `null` fora de qualquer um. */
export function escopoAtual(): Escopo | null {
  return armazem.getStore() ?? null;
}

/**
 * Corre `fn` dentro de uma frota. É o caso normal: um pedido autenticado.
 *
 * ─── O `await` É AQUI DENTRO, E ISSO É O PONTO ──────────────────────────────
 *
 * Uma consulta do Prisma é PREGUIÇOSA: `prisma.user.findUnique(...)` não vai à
 * base de dados — devolve uma promessa que só arranca quando alguém espera por
 * ela. Escrito assim:
 *
 *     await comFrota(id, () => prisma.user.findUnique(…))   // ERRADO
 *
 * a consulta nasce dentro da frota mas só CORRE depois de o `run` ter saído, e
 * chega à camada sem frota nenhuma. O sintoma é bonito de ver e difícil de
 * adivinhar: "correu fora de qualquer frota", numa linha que está visivelmente
 * dentro de um `comFrota`.
 *
 * Por isso a espera está aqui, uma vez, em vez de ficar à responsabilidade de
 * quem chama. Assim as duas formas funcionam, e não há forma de errar.
 */
export async function comFrota<T>(fleetId: string, fn: () => T | Promise<T>): Promise<T> {
  if (!fleetId) throw new Error('[escopo] comFrota() sem frota');
  return armazem.run({ fleetId, modo: 'frota' }, async () => await fn());
}

/**
 * Corre `fn` a ver TODAS as frotas.
 *
 * Para o painel do dono. As escritas continuam a precisar de `fleetId` escrito
 * à mão — ver a nota em `aplicarEscrita`.
 */
export async function comoDono<T>(fn: () => T | Promise<T>): Promise<T> {
  // A espera é aqui dentro — ver a nota em `comFrota`.
  return armazem.run({ fleetId: null, modo: 'dono' }, async () => await fn());
}

/**
 * Corre `fn` sem frota, como sistema.
 *
 * Para o arranque e para os trabalhos agendados ANTES de escolherem a frota —
 * tipicamente para listarem as frotas e depois correrem `comFrota` em cada uma.
 */
export async function comoSistema<T>(fn: () => T | Promise<T>): Promise<T> {
  // A espera é aqui dentro — ver a nota em `comFrota`.
  return armazem.run({ fleetId: null, modo: 'sistema' }, async () => await fn());
}

/**
 * Fixa uma frota para TUDO o que correr a seguir neste contexto.
 *
 * ─── SÓ PARA OS TESTES ──────────────────────────────────────────────────────
 *
 * Ao contrário de `comFrota`, isto não envolve uma função: entra na frota e
 * fica lá. Serve para os testes, onde as fixtures escrevem dezenas de linhas
 * fora de qualquer pedido e não faz sentido embrulhar cada uma.
 *
 * NÃO usar no servidor. Um pedido tem de levar a frota dele e devolvê-la ao
 * sair, que é o que o `comFrota` garante; com isto, uma frota ficava agarrada
 * ao contexto e o pedido seguinte podia herdá-la.
 */
export function entrarNaFrota(fleetId: string): void {
  armazem.enterWith({ fleetId, modo: 'frota' });
}

/**
 * A frota de agora, ou um erro.
 *
 * ─── PARA QUE SERVE ─────────────────────────────────────────────────────────
 *
 * Para o SQL escrito à mão. A extensão do Prisma carimba as consultas que
 * passam por ela, mas não vê uma linha de SQL — e este projeto tem perto de
 * quarenta consultas assim, nos relatórios, nos saldos e nas análises. Essas
 * levam o filtro escrito:
 *
 *   const frota = frotaObrigatoria();
 *   prisma.$queryRaw`SELECT … FROM driver_balances b
 *                    WHERE b.fleet_id = ${frota}`
 *
 * Atira em modo de dono e de sistema de propósito: uma consulta em SQL cru que
 * deva atravessar frotas tem de dizer o que faz com os dados das outras, e
 * isso escreve-se à mão, caso a caso.
 */
export function frotaObrigatoria(): string {
  const e = escopoAtual();
  if (!e || e.modo !== 'frota' || !e.fleetId) {
    throw new ErroDeEscopo(
      '[escopo] esta consulta precisa de uma frota definida. '
      + 'Se é mesmo para atravessar frotas, escreva o filtro à mão e explique porquê.',
    );
  }
  return e.fleetId;
}

/**
 * As tabelas que NÃO pertencem a nenhuma frota.
 *
 * Lista curta e fechada: as frotas e os planos são da plataforma. Tudo o resto
 * é de alguém. Acrescentar um nome aqui é abrir uma tabela a toda a gente, e é
 * por isso que esta lista é o primeiro sítio a olhar numa revisão.
 */
export const MODELOS_GLOBAIS = new Set<string>(['Fleet', 'Plan']);

/** Operações que leem. O filtro entra no `where`. */
const LEITURAS = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy',
]);

/** Operações que leem UMA linha pela chave. Ver a nota em `aplicarLeituraUnica`. */
const LEITURAS_UNICAS = new Set(['findUnique', 'findUniqueOrThrow']);

/** Operações que escrevem linhas novas. O carimbo entra no `data`. */
const CRIACOES = new Set(['create', 'createMany', 'createManyAndReturn']);

/** Operações que mexem no que já existe. O filtro entra no `where`. */
const ALTERACOES = new Set([
  'update', 'updateMany', 'updateManyAndReturn',
  'delete', 'deleteMany', 'upsert',
]);

export class ErroDeEscopo extends Error {
  readonly codigo: string;

  constructor(mensagem: string, codigo = 'SEM_ESCOPO') {
    super(mensagem);
    this.name = 'ErroDeEscopo';
    this.codigo = codigo;
  }
}

/** A frota a aplicar, ou `null` quando a operação deve passar sem filtro. */
export function frotaParaOperacao(
  modelo: string | undefined,
  operacao: string,
  escopo: Escopo | null,
): string | null {
  if (!modelo || MODELOS_GLOBAIS.has(modelo)) return null;

  if (!escopo) {
    throw new ErroDeEscopo(
      `[escopo] ${modelo}.${operacao} correu fora de qualquer frota. `
      + 'Envolva o pedido em comFrota(), ou declare comoDono()/comoSistema().',
    );
  }

  if (escopo.modo !== 'frota') {
    // Dono e sistema veem tudo. É deliberado, e por isso tem de ser declarado.
    return null;
  }

  if (!escopo.fleetId) {
    throw new ErroDeEscopo(`[escopo] ${modelo}.${operacao} sem frota definida.`);
  }

  return escopo.fleetId;
}

/** Junta `fleetId` a um `where`, sem destruir o que lá estava. */
function comFiltro(where: unknown, fleetId: string): Record<string, unknown> {
  const atual = (where ?? {}) as Record<string, unknown>;
  return { ...atual, fleetId };
}

/**
 * O `findUnique` é o caso que obriga a um desvio.
 *
 * O Prisma só aceita campos únicos no `where` de um `findUnique`, e `fleetId`
 * não é único — acrescentá-lo faz a chamada rebentar na validação. A saída é
 * deixar a consulta correr como está e CONFERIR o resultado: se a linha é de
 * outra frota, devolve-se vazio, exatamente como se não existisse.
 *
 * É o comportamento certo também do ponto de vista de quem pergunta: um id de
 * outra frota não deve dar "não pode ver" (que confirma que existe), deve dar
 * "não existe".
 */
function conferirResultado(
  resultado: unknown,
  fleetId: string,
  operacao: string,
): unknown {
  if (resultado === null || resultado === undefined) return resultado;
  const linha = resultado as { fleetId?: unknown };
  if (typeof linha.fleetId === 'string' && linha.fleetId !== fleetId) {
    if (operacao === 'findUniqueOrThrow') {
      throw new ErroDeEscopo('Não encontrado.', 'NOT_FOUND');
    }
    return null;
  }
  return resultado;
}

/**
 * Carimba a frota nos dados de uma criação.
 *
 * Um `fleetId` já escrito à mão é RESPEITADO e não substituído: é assim que o
 * painel do dono cria a primeira conta de uma frota nova. Mas, em modo de
 * frota, escrever outra frota é recusado — se fosse permitido, bastava um
 * campo mal filtrado de um formulário para escrever na conta de outro cliente.
 */
function aplicarEscrita(
  dados: unknown,
  fleetId: string,
): Record<string, unknown> {
  const atual = (dados ?? {}) as Record<string, unknown>;
  const jaTem = atual.fleetId;
  if (typeof jaTem === 'string' && jaTem !== fleetId) {
    throw new ErroDeEscopo(
      '[escopo] tentativa de escrever noutra frota.', 'FROTA_ERRADA',
    );
  }
  return { ...atual, fleetId };
}

/**
 * O cliente do Prisma com o âmbito aplicado.
 *
 * Exportado como função para os testes poderem construir um cliente próprio.
 */
export function comEscopo(cliente: PrismaClient) {
  return cliente.$extends({
    name: 'escopo-por-frota',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const fleetId = frotaParaOperacao(model, operation, escopoAtual());
          if (fleetId === null) return query(args);

          const a = (args ?? {}) as Record<string, unknown>;

          if (LEITURAS.has(operation)) {
            return query({ ...a, where: comFiltro(a.where, fleetId) });
          }

          if (LEITURAS_UNICAS.has(operation)) {
            const r = await query(args);
            return conferirResultado(r, fleetId, operation);
          }

          if (CRIACOES.has(operation)) {
            const dados = a.data;
            return query({
              ...a,
              data: Array.isArray(dados)
                ? dados.map((d) => aplicarEscrita(d, fleetId))
                : aplicarEscrita(dados, fleetId),
            });
          }

          if (ALTERACOES.has(operation)) {
            const seguinte: Record<string, unknown> = {
              ...a, where: comFiltro(a.where, fleetId),
            };
            // No `upsert`, o que se cria também leva o carimbo.
            if (operation === 'upsert' && a.create !== undefined) {
              seguinte.create = aplicarEscrita(a.create, fleetId);
            }
            return query(seguinte);
          }

          // Operações que não conhecemos (`findRaw`, agregações novas de uma
          // versão futura do Prisma) não passam sem alguém olhar para elas.
          // Falhar alto é melhor do que deixar passar o que não se percebeu.
          throw new ErroDeEscopo(
            `[escopo] operação não prevista: ${model}.${operation}. `
            + 'Acrescente-a às listas em escopo.ts depois de confirmar o âmbito.',
          );
        },
      },
    },
  });
}

/**
 * O `update` e o `delete` por id também precisam de uma nota.
 *
 * O Prisma aceita `where: { id }` num `update`, e acrescentar-lhe `fleetId`
 * passa a exigir que a linha seja das duas coisas — que é o que se quer. A
 * diferença para o `findUnique` é que aqui o Prisma ACEITA campos não únicos no
 * `where`, por isso o filtro entra direto. Uma linha de outra frota deixa de
 * casar e a operação atira `RecordNotFound`, que é a resposta certa.
 */
export type ClienteComEscopo = ReturnType<typeof comEscopo>;

export { Prisma };
