// src/config/prisma.ts
//
// O cliente da base de dados, já com o âmbito da frota aplicado.
//
// ─── PORQUE É QUE O CLIENTE CRU NÃO SE EXPORTA ──────────────────────────────
//
// Porque um `import { prisma }` que não passe pela extensão é uma consulta sem
// frota — e uma consulta sem frota é a conta de um cliente a aparecer na de
// outro. O cliente cru fica fechado aqui dentro; o que sai é só o estendido.
//
// Quem precisar mesmo de atravessar frotas declara-o com `comoDono()` ou
// `comoSistema()` (ver `escopo.ts`), e aí a extensão deixa passar. A diferença
// entre "vejo tudo" e "esqueci-me do filtro" passa a estar escrita no código.

import { PrismaClient } from '@prisma/client';
import { comEscopo } from './escopo';

function criar() {
  return comEscopo(new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'warn', 'error']
      : ['warn', 'error'],
  }));
}

// Evita vários clientes em desenvolvimento, onde o servidor reinicia sozinho.
const globalParaPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof criar>;
};

export const prisma = globalParaPrisma.prisma ?? criar();

if (process.env.NODE_ENV !== 'production') globalParaPrisma.prisma = prisma;

/** O cliente da base de dados, já com o âmbito aplicado. */
export type ClientePrisma = typeof prisma;

/**
 * O que uma função que trabalha dentro de uma transação deve receber.
 *
 * ─── PORQUE É QUE NÃO SERVE O `Prisma.TransactionClient` ────────────────────
 *
 * Esse é o tipo da transação de um cliente SEM extensões. A partir do momento
 * em que o cliente leva a camada do âmbito (`$extends`), o `tx` que o
 * `$transaction` entrega é de outro tipo — mais rico, e incompatível com
 * aquele. Quem tivesse os parâmetros escritos como `Prisma.TransactionClient`
 * deixava de compilar, mesmo estando correto.
 *
 * Aqui o tipo é DERIVADO do cliente a sério, com os métodos que não existem
 * dentro de uma transação removidos. Como o cliente completo tem tudo isto e
 * mais, também encaixa — e por isso a mesma função serve para ser chamada
 * dentro ou fora de uma transação, que é como estes serviços já funcionavam.
 */
export type Transacao = Omit<
  ClientePrisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
