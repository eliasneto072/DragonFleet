// backend/prisma/seed-despesas.ts
//
// O cenário das páginas de simulação da extensão, na base de desenvolvimento.
//
// Uso (da sua máquina, com a base do Docker):
//
//   cd backend
//   docker compose exec backend printenv DATABASE_URL     # a morada da base
//   #   troque @postgres:5432 por @localhost:5433
//   SEED_DESPESAS=1 DATABASE_URL="...@localhost:5433/..." npm run seed:despesas
//
// Depois: extension/simulacao/prio.html e via-verde.html, e a extensão.
//
// ─── O CENÁRIO ───────────────────────────────────────────────────────────────
//
// Três motoristas e três carros, pensados para cada linha das páginas cair num
// caso diferente. Datas FIXAS, e não relativas a hoje como no seed-demo: as
// páginas de simulação têm datas escritas, e têm de bater com elas.
//
//   AA-01-DF  Ana, a semana toda.
//   BB-02-DF  Bruno até quinta 17/09 ao meio-dia; Carla a partir daí.
//   CC-03-DF  Carla até quinta 17/09 ao meio-dia; Bruno a partir daí.
//   ZZ-99-ZZ  não existe no DragonFleet.
//
// Cartões Prio:
//   7824 0000 1111 2222  → da Ana (o cartão vai com a pessoa)
//   7824 0000 3333 4444  → do CARRO BB-02-DF (vai para quem o tem na hora)
//   7824 0000 7777 8888  → não registado; cai para a matrícula CC-03-DF
//   7824 0000 5555 6666  → não registado, e a matrícula também não existe
//
// O que o fecho da semana de 21/09 deve mostrar, depois de importar as duas:
//
//              combustível (Prio 21–27/09)    portagens (Via Verde 14–20/09)
//   Ana        138,28 €                        2,00 €   (a mensalidade não conta)
//   Bruno       66,21 €                        4,65 €
//   Carla      163,80 €                        2,85 €   (o cancelado não conta)
//   por atribuir 44,28 €                       1,20 €
//
// ─── REPETÍVEL ───────────────────────────────────────────────────────────────
//
// Corre as vezes que forem precisas. Não apaga utilizadores — atualiza-os, que
// é mais seguro numa base onde outros módulos lhes podem ter associado dados.
// Apaga, isso sim, os movimentos importados destes carros e cartões e os fechos
// destes três motoristas, para a demonstração recomeçar do zero.

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DOMINIO = '@despesas.dragonfleet.local';
const TROCA = new Date('2026-09-17T11:00:00Z'); // quinta 17/09, 12:00 em Lisboa
const INICIO = new Date('2026-09-01T00:00:00Z');

const MOTORISTAS = [
  // Sem sufixo "(demo)" no nome, de propósito: a Uber e a Bolt emparelham pelo
  // primeiro e último nome, e "(demo)" passava a ser o último. Quem as marca
  // como demonstração é o email, no domínio abaixo.
  { slug: 'ana', name: 'Ana Martins' },
  { slug: 'bruno', name: 'Bruno Sousa' },
  { slug: 'carla', name: 'Carla Pinto' },
] as const;

const PLACAS = ['AA-01-DF', 'BB-02-DF', 'CC-03-DF'];
const CARTOES_TODOS = ['7824000011112222', '7824000033334444', '7824000077778888', '7824000055556666'];

async function main() {
  if (process.env.SEED_DESPESAS !== '1') {
    console.error('\n[seed-despesas] Recusado: falta SEED_DESPESAS=1.\n');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('\n[seed-despesas] Recusado: NODE_ENV é production.\n');
    process.exit(1);
  }

  // A tabela nova tem de existir. Sem a migração, o erro do Prisma diria
  // "table does not exist" sem dizer o que fazer.
  try {
    await prisma.expenseMovement.count();
  } catch {
    console.error(
      '\n[seed-despesas] A tabela expense_movements não existe nesta base.\n' +
      'Aplique primeiro a migração:  npx prisma migrate deploy  (com o mesmo DATABASE_URL)\n',
    );
    process.exit(1);
  }

  // ── Motoristas ─────────────────────────────────────────────────────────────
  // Palavra-passe aleatória e deitada fora: estas contas não são para entrar.
  const ids: Record<string, string> = {};
  for (const m of MOTORISTAS) {
    const email = `${m.slug}${DOMINIO}`;
    const u = await prisma.user.upsert({
      where: { email },
      update: { name: m.name, role: 'DRIVER', status: 'ACTIVE' },
      create: {
        email, name: m.name, role: 'DRIVER', status: 'ACTIVE',
        password: await bcrypt.hash(randomUUID(), 10),
      },
    });
    ids[m.slug] = u.id;
  }

  // ── Recomeçar do zero ──────────────────────────────────────────────────────
  const apagados = await prisma.expenseMovement.deleteMany({
    where: {
      OR: [
        { plate: { in: [...PLACAS, 'ZZ-99-ZZ'] } },
        { cardNumber: { in: CARTOES_TODOS } },
        { userId: { in: Object.values(ids) } },
      ],
    },
  });
  await prisma.weeklySettlement.deleteMany({ where: { userId: { in: Object.values(ids) } } });
  // Os ganhos que a extensão trouxe da Uber e da Bolt numa demonstração anterior.
  const ganhos = await prisma.earning.deleteMany({ where: { userId: { in: Object.values(ids) } } });
  await prisma.fuelCard.deleteMany({ where: { provider: 'PRIO', number: { in: CARTOES_TODOS } } });

  // ── Carros e quem os tinha ─────────────────────────────────────────────────
  const carro = async (plate: string, atual: string, model: string) => {
    const v = await prisma.vehicle.upsert({
      where: { plate },
      update: { userId: atual, status: 'ACTIVE' },
      create: {
        plate, brand: 'Toyota', model, year: 2022,
        status: 'ACTIVE', weeklyFee: 150, userId: atual,
      },
    });
    await prisma.vehicleAssignment.deleteMany({ where: { vehicleId: v.id } });
    return v;
  };

  const aa = await carro('AA-01-DF', ids.ana, 'Corolla');
  const bb = await carro('BB-02-DF', ids.carla, 'C-HR');
  const cc = await carro('CC-03-DF', ids.bruno, 'Prius');

  await prisma.vehicleAssignment.createMany({
    data: [
      { vehicleId: aa.id, userId: ids.ana,   startedAt: INICIO, endedAt: null },
      { vehicleId: bb.id, userId: ids.bruno, startedAt: INICIO, endedAt: TROCA },
      { vehicleId: bb.id, userId: ids.carla, startedAt: TROCA,  endedAt: null },
      { vehicleId: cc.id, userId: ids.carla, startedAt: INICIO, endedAt: TROCA },
      { vehicleId: cc.id, userId: ids.bruno, startedAt: TROCA,  endedAt: null },
    ],
  });

  // ── Cartões Prio ───────────────────────────────────────────────────────────
  await prisma.fuelCard.createMany({
    data: [
      { provider: 'PRIO', number: '7824000011112222', label: 'Cartão da Ana', userId: ids.ana },
      { provider: 'PRIO', number: '7824000033334444', label: 'Cartão do C-HR', vehicleId: bb.id },
    ],
  });

  console.log(`
[seed-despesas] Pronto.

  Motoristas: Ana, Bruno e Carla (demo) — ${DOMINIO}
  Carros:     AA-01-DF, BB-02-DF, CC-03-DF (trocaram de mãos na quinta 17/09 ao meio-dia)
  Cartões:    2 registados, 2 por registar de propósito
  Limpos:     ${apagados.count} despesas e ${ganhos.count} ganhos de uma demonstração anterior

A seguir, no Chrome, abra extension/simulacao/index.html e corra a extensão
nas quatro páginas. Depois: Faturação → Novo fecho, semana de 21/09/2026.
`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
