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
