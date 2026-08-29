// backend/prisma/seed-demo.ts
//
// Popula a base com cenários de demonstração.
//
// Uso:
//   SEED_DEMO=1 SEED_DEMO_PASSWORD=umaSenhaForte123 npm run seed:demo
//
// ─── O QUE ISTO É, E O QUE NÃO É ─────────────────────────────────────────────
//
// Isto é para exploração manual: abrir a aplicação e ver cada estado com olhos.
// NÃO é para os testes automáticos se apoiarem nele.
//
// Testes que partilham dados de seed ganham dependências invisíveis entre si —
// um teste que aprova o IBAN da Sofia parte o teste seguinte que esperava
// encontrá-lo pendente — e passam a depender da ordem de execução. Cada teste
// deve construir o que precisa e limpar atrás de si. O seed serve o humano.
//
// ─── DADOS NÃO SÃO CENÁRIOS ──────────────────────────────────────────────────
//
// Trinta motoristas gerados ao acaso não provam nada: ficam todos no mesmo
// estado e nenhum exercita o caso difícil. Aqui cada motorista existe para
// responder a uma pergunta concreta, e o nome dele na consola diz qual.
//
// ─── IDEMPOTÊNCIA ────────────────────────────────────────────────────────────
//
// Corre as vezes que forem precisas. Antes de criar, apaga tudo o que criou
// antes — e só isso: os utilizadores cujo email termina em SEED_DOMAIN. O
// resto da base, incluindo o teu admin e qualquer motorista real, fica intacto.
// As datas são relativas a hoje, portanto os gráficos mostram sempre semanas
// recentes em vez de envelhecerem.

import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
// A fórmula do fecho vem do backend e não é recalculada aqui. Copiá-la faria
// os números do seed divergirem dos da aplicação assim que um mudasse — e é
// precisamente a divergência silenciosa que o seed deveria ajudar a apanhar.
// A verificação corre ANTES deste import: se corresse depois, o
// MODULE_NOT_FOUND acontecia primeiro e a mensagem nunca apareceria.
import { assertTemCodigoFonte } from './seed-guard';
assertTemCodigoFonte();
// eslint-disable-next-line import/first
import { computeTotals } from '../src/modules/settlements/settlements.types';

const prisma = new PrismaClient();

/** Emails de demonstração terminam aqui. É por isto que a limpeza sabe o que é seu. */
const SEED_DOMAIN = '@seed.dragonfleet.local';

/**
 * Ficheiros de exemplo.
 *
 * URL públicos e estáveis, para os botões "Ver comprovativo" e "Recibo"
 * abrirem alguma coisa em vez de darem 404. Não passam pelo Cloudinary: o seed
 * não envia ficheiros, só grava as referências.
 */
const SAMPLE_PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
const SAMPLE_IMG = 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';

// ─── Sobre os IBAN deste ficheiro ────────────────────────────────────────────
//
// São fictícios mas passam no resto 97 — o mesmo algoritmo que o bank.service
// e o iban.ts do frontend aplicam. O seed escreve direto na base e passa ao
// lado dessa validação, portanto números inventados à mão entrariam na
// aplicação e só dariam erro à primeira vez que alguém tentasse reeditá-los.
//
// Se precisar de mudar um: os dois últimos dígitos são de controlo. Percorra
// os 100 pares possíveis e fique com o que faz o conjunto dar resto 1.

// ─── Datas ────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

/** Meia-noite, para as datas @db.Date não escorregarem com o fuso. */
function atMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * A segunda-feira da semana que passou, contando `weeksAgo` para trás.
 *
 * As semanas do fecho são de segunda a domingo. `weeksAgo = 1` é a última
 * semana completa; a semana em curso nunca é fechada, porque ainda não acabou.
 */
function mondayWeeksAgo(weeksAgo: number): Date {
  const now = atMidnight(new Date());
  const dow = now.getUTCDay() || 7;            // domingo = 7, não 0
  const thisMonday = new Date(now.getTime() - (dow - 1) * DAY);
  return new Date(thisMonday.getTime() - weeksAgo * 7 * DAY);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY);
}

function dec(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

// ─── Guardas ──────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`\n[seed-demo] Variável ${name} não definida.\n`);
    process.exit(1);
  }
  return value.trim();
}

function assertSafeToRun(): void {
  // Duas trancas independentes. A primeira apanha o engano de correr o seed
  // contra a máquina errada; a segunda apanha quem lhe chame por distração,
  // porque este script APAGA dados antes de criar.
  if (process.env.NODE_ENV === 'production') {
    console.error('\n[seed-demo] Recusado: NODE_ENV=production.\n');
    process.exit(1);
  }
  if (process.env.SEED_DEMO !== '1') {
    console.error(
      '\n[seed-demo] Recusado: falta SEED_DEMO=1.\n' +
      'Este script apaga e recria os dados de demonstração. A variável existe\n' +
      'para que isso nunca aconteça por engano.\n',
    );
    process.exit(1);
  }
}

// ─── Limpeza ──────────────────────────────────────────────────────────────────

/**
 * Apaga apenas o que este seed criou.
 *
 * O `onDelete: Cascade` do schema leva atrás fechos, retiradas, documentos,
 * lançamentos, notificações e conta bancária. Os veículos ficam com
 * `userId: null` (SetNull), por isso são apagados à parte pela matrícula.
 */
async function wipePreviousSeed(): Promise<void> {
  const previous = await prisma.user.findMany({
    where: { email: { endsWith: SEED_DOMAIN } },
    select: { id: true },
  });

  if (previous.length === 0) {
    console.log('[seed-demo] Nada de anterior para limpar.');
    return;
  }

  const ids = previous.map((u) => u.id);

  // Fechos criados POR estes utilizadores apontam para eles com onDelete
  // restrito (createdBy). Se algum admin de seed tiver criado fechos de um
  // motorista real, apagá-lo rebentaria; não acontece hoje, mas a ordem
  // explícita evita a surpresa.
  await prisma.weeklySettlement.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.vehicle.deleteMany({ where: { plate: { startsWith: 'SEED-' } } });
  const { count } = await prisma.user.deleteMany({ where: { id: { in: ids } } });

  console.log(`[seed-demo] Limpos ${count} utilizadores de seed anteriores.`);
}

// ─── Construção ───────────────────────────────────────────────────────────────

interface WeekInput {
  uberAmount: number;
  boltAmount: number;
  otherRevenue?: number;
  tollsAmount: number;
  fuelAmount: number;
  vehicleFee: number;
  otherDeductions?: number;
}

/**
 * Regista um fecho e devolve o líquido creditado.
 *
 * Só `REGISTERED` credita — é o que a vista `driver_balances` soma. Um
 * rascunho fica visível na tela mas não mexe no saldo, e o seed cria um de
 * cada para essa diferença ser observável.
 */
async function createSettlement(opts: {
  userId: string;
  vehicleId: string | null;
  createdById: string;
  weeksAgo: number;
  commissionRate: number;
  taxRate: number;
  status: 'REGISTERED' | 'DRAFT';
  amounts: WeekInput;
  notes?: string;
}): Promise<number> {
  const weekStart = mondayWeeksAgo(opts.weeksAgo);
  const weekEnd = new Date(weekStart.getTime() + 6 * DAY);

  const totals = computeTotals({
    ...opts.amounts,
    commissionRate: opts.commissionRate,
    taxRate: opts.taxRate,
  });

  await prisma.weeklySettlement.create({
    data: {
      userId: opts.userId,
      vehicleId: opts.vehicleId,
      createdById: opts.createdById,
      weekStart,
      weekEnd,
      uberAmount: dec(opts.amounts.uberAmount),
      boltAmount: dec(opts.amounts.boltAmount),
      otherRevenue: dec(opts.amounts.otherRevenue ?? 0),
      tollsAmount: dec(opts.amounts.tollsAmount),
      fuelAmount: dec(opts.amounts.fuelAmount),
      vehicleFee: dec(opts.amounts.vehicleFee),
      otherDeductions: dec(opts.amounts.otherDeductions ?? 0),
      commissionRate: dec(opts.commissionRate),
      taxRate: dec(opts.taxRate),
      taxBase: dec(totals.taxBase),
      taxAmount: dec(totals.taxAmount),
      grossRevenue: dec(totals.grossRevenue),
      totalDeductions: dec(totals.totalDeductions),
      profitBase: dec(totals.profitBase),
      commissionAmount: dec(totals.commissionAmount),
      netToDriver: dec(totals.netToDriver),
      status: opts.status,
      notes: opts.notes ?? null,
      registeredAt: opts.status === 'REGISTERED' ? weekEnd : null,
    },
  });

  return opts.status === 'REGISTERED' ? totals.netToDriver : 0;
}

async function createDriver(opts: {
  name: string;
  slug: string;
  passwordHash: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'AGUARDANDO_REGULARIZACAO';
}) {
  return prisma.user.create({
    data: {
      name: opts.name,
      email: `${opts.slug}${SEED_DOMAIN}`,
      password: opts.passwordHash,
      role: 'DRIVER',
      status: opts.status ?? 'ACTIVE',
    },
  });
}

async function createVehicle(opts: {
  brand: string; model: string; plate: string; year: number;
  weeklyFee: number; userId: string;
}) {
  const vehicle = await prisma.vehicle.create({
    data: {
      brand: opts.brand,
      model: opts.model,
      plate: opts.plate,
      year: opts.year,
      status: 'ACTIVE',
      weeklyFee: dec(opts.weeklyFee),
      userId: opts.userId,
    },
  });
  await prisma.vehicleAssignment.create({
    data: { vehicleId: vehicle.id, userId: opts.userId, startedAt: mondayWeeksAgo(12) },
  });
  return vehicle;
}

/** Uma retirada. O recibo é obrigatório no schema, por isso vai sempre. */
async function createWithdrawal(opts: {
  userId: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';
  daysAgo: number;
  paidToIban?: string;
  paidToHolder?: string;
  notes?: string;
}) {
  return prisma.withdrawal.create({
    data: {
      userId: opts.userId,
      amount: dec(opts.amount),
      status: opts.status,
      requestedAt: daysFromNow(-opts.daysAgo),
      processedAt: opts.status === 'PENDING' ? null : daysFromNow(-opts.daysAgo + 1),
      receiptUrl: SAMPLE_PDF,
      receiptKey: `seed/recibos/${opts.userId}-${opts.daysAgo}`,
      paidToIban: opts.paidToIban ?? null,
      paidToHolder: opts.paidToHolder ?? null,
      notes: opts.notes ?? null,
    },
  });
}

// ─── Cenários ─────────────────────────────────────────────────────────────────

async function main() {
  assertSafeToRun();

  const password = requireEnv('SEED_DEMO_PASSWORD');
  if (password.length < 8) {
    console.error('[seed-demo] SEED_DEMO_PASSWORD deve ter pelo menos 8 caracteres.');
    process.exit(1);
  }

  // Precisa de um admin para assinar os fechos (createdById é obrigatório).
  // Usa um real se existir; senão cria um de seed, para o script não depender
  // de o seed-admin ter corrido antes.
  let admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', email: { not: { endsWith: SEED_DOMAIN } } },
  });

  await wipePreviousSeed();

  const hash = await bcrypt.hash(password, 10);

  if (!admin) {
    admin = await prisma.user.create({
      data: {
        name: 'Administrador (seed)',
        email: `admin${SEED_DOMAIN}`,
        password: hash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    console.log('[seed-demo] Sem admin real na base — criado um de seed.');
  } else {
    console.log(`[seed-demo] Fechos assinados por: ${admin.email}`);
  }

  // Configurações. `upsert` porque a linha é única e global.
  await prisma.systemSettings.upsert({
    where: { id: 'global' },
    update: {},
    create: { id: 'global' },
  });

  const RATE = 15;  // comissão da empresa; igual ao valor por omissão
  const TAX = 6;    // imposto sobre a faturação; o valor que o cliente indicou
  const created: { nome: string; email: string; pergunta: string }[] = [];

  // ── 1. Bruno: sem conta bancária ───────────────────────────────────────────
  //
  // Tem saldo de sobra. A ÚNICA razão para não poder pedir uma retirada é não
  // ter IBAN — é o que torna o cenário útil: isola a tranca.
  {
    const u = await createDriver({ name: 'Bruno Silva', slug: 'bruno', passwordHash: hash });
    const v = await createVehicle({
      brand: 'Renault', model: 'Mégane', plate: 'SEED-01-AA', year: 2021,
      weeklyFee: 180, userId: u.id,
    });
    for (let w = 1; w <= 4; w++) {
      await createSettlement({
        userId: u.id, vehicleId: v.id, createdById: admin.id, weeksAgo: w,
        commissionRate: RATE, taxRate: TAX, status: 'REGISTERED',
        amounts: { uberAmount: 520, boltAmount: 410, tollsAmount: 42, fuelAmount: 95, vehicleFee: 180 },
      });
    }
    created.push({
      nome: u.name, email: u.email,
      pergunta: 'Sem IBAN: o botao de retirada esta bloqueado apesar do saldo?',
    });
  }

  // ── 2. Carla: IBAN à espera de decisão, primeira submissão ─────────────────
  {
    const u = await createDriver({ name: 'Carla Mendes', slug: 'carla', passwordHash: hash });
    const v = await createVehicle({
      brand: 'Peugeot', model: '308', plate: 'SEED-02-BB', year: 2020,
      weeklyFee: 170, userId: u.id,
    });
    await prisma.bankAccount.create({
      data: {
        userId: u.id,
        pendingIban: 'PT50002700000001234567833',
        pendingHolderName: 'Carla Mendes',
        pendingProofUrl: SAMPLE_IMG,
        pendingProofKey: 'seed/comprovativos/carla',
        pendingAt: daysFromNow(-2),
      },
    });
    for (let w = 1; w <= 3; w++) {
      await createSettlement({
        userId: u.id, vehicleId: v.id, createdById: admin.id, weeksAgo: w,
        commissionRate: RATE, taxRate: TAX, status: 'REGISTERED',
        amounts: { uberAmount: 480, boltAmount: 330, tollsAmount: 38, fuelAmount: 88, vehicleFee: 170 },
      });
    }
    created.push({
      nome: u.name, email: u.email,
      pergunta: 'IBAN pendente: aparece na fila do Financeiro com o contador a 2?',
    });
  }

  // ── 3. Diogo: IBAN recusado, com motivo ────────────────────────────────────
  {
    const u = await createDriver({ name: 'Diogo Ferreira', slug: 'diogo', passwordHash: hash });
    await prisma.bankAccount.create({
      data: {
        userId: u.id,
        rejectionReason: 'O nome no comprovativo não corresponde ao titular indicado.',
        reviewedById: admin.id,
        reviewedAt: daysFromNow(-5),
      },
    });
    await prisma.notification.create({
      data: {
        userId: u.id,
        title: 'Dados bancários recusados',
        message: 'O nome no comprovativo não corresponde ao titular indicado.',
        createdAt: daysFromNow(-5),
      },
    });
    created.push({
      nome: u.name, email: u.email,
      pergunta: 'IBAN recusado: o motivo aparece no Perfil e no aviso das Retiradas?',
    });
  }

  // ── 4. Mónica: o caso normal, com histórico longo ──────────────────────────
  //
  // O acento no nome é deliberado. O emparelhamento de nomes na importação de
  // CSV normaliza acentos, e "Monica" vindo do portal tem de encontrar a
  // "Mónica" da base. Sem um nome acentuado no seed, esse caminho nunca é
  // exercitado a olho.
  {
    const u = await createDriver({ name: 'Mónica Antunes', slug: 'monica', passwordHash: hash });
    const v = await createVehicle({
      brand: 'Toyota', model: 'Corolla', plate: 'SEED-03-CC', year: 2022,
      weeklyFee: 200, userId: u.id,
    });
    await prisma.bankAccount.create({
      data: {
        userId: u.id,
        iban: 'PT50003300004567890123437',
        holderName: 'Mónica Antunes',
        reviewedById: admin.id,
        reviewedAt: daysFromNow(-40),
      },
    });

    // Dez semanas, com variação suficiente para o gráfico não ser uma reta.
    const semanas = [
      { uber: 610, bolt: 450 }, { uber: 580, bolt: 520 }, { uber: 495, bolt: 470 },
      { uber: 700, bolt: 380 }, { uber: 640, bolt: 500 }, { uber: 530, bolt: 430 },
      { uber: 590, bolt: 560 }, { uber: 620, bolt: 410 }, { uber: 555, bolt: 490 },
      { uber: 680, bolt: 520 },
    ];
    for (let i = 0; i < semanas.length; i++) {
      await createSettlement({
        userId: u.id, vehicleId: v.id, createdById: admin.id, weeksAgo: i + 1,
        commissionRate: RATE, taxRate: TAX, status: 'REGISTERED',
        amounts: {
          uberAmount: semanas[i].uber, boltAmount: semanas[i].bolt,
          tollsAmount: 45, fuelAmount: 105, vehicleFee: 200,
        },
      });
    }

    // Documentos em três estados, para a tela de validades ter o que mostrar.
    await prisma.document.createMany({
      data: [
        {
          userId: u.id, type: 'CARTA_CONDUCAO', status: 'APPROVED',
          fileUrl: SAMPLE_PDF, fileKey: 'seed/docs/monica-carta',
          expiresAt: daysFromNow(400),
        },
        {
          userId: u.id, type: 'REGISTO_CRIMINAL', status: 'APPROVED',
          fileUrl: SAMPLE_PDF, fileKey: 'seed/docs/monica-registo',
          issuedAt: daysFromNow(-75), expiresAt: daysFromNow(15), // dentro do aviso de 30 dias
        },
        {
          userId: u.id, type: 'CERTIFICADO_TVDE', status: 'EXPIRED',
          fileUrl: SAMPLE_PDF, fileKey: 'seed/docs/monica-tvde',
          expiresAt: daysFromNow(-10),
        },
      ],
    });

    created.push({
      nome: u.name, email: u.email,
      pergunta: 'Caso normal: 10 semanas no grafico, documento a expirar e um expirado.',
    });
  }

  // ── 5. Rui: saldo negativo ─────────────────────────────────────────────────
  //
  // Uma semana em prejuízo, com comissão a zero. Prova duas regras de uma vez:
  // não se cobra percentagem de resultado negativo, e o saldo pode ficar
  // abaixo de zero — a despesa foi real e alguém a pagou.
  {
    const u = await createDriver({ name: 'Rui Tavares', slug: 'rui', passwordHash: hash });
    const v = await createVehicle({
      brand: 'Dacia', model: 'Logan', plate: 'SEED-04-DD', year: 2019,
      weeklyFee: 150, userId: u.id,
    });
    await prisma.bankAccount.create({
      data: {
        userId: u.id,
        iban: 'PT50001000004567890123438',
        holderName: 'Rui Tavares',
        reviewedById: admin.id,
        reviewedAt: daysFromNow(-30),
      },
    });
    await createSettlement({
      userId: u.id, vehicleId: v.id, createdById: admin.id, weeksAgo: 2,
      commissionRate: RATE, taxRate: TAX, status: 'REGISTERED',
      amounts: { uberAmount: 210, boltAmount: 140, tollsAmount: 30, fuelAmount: 70, vehicleFee: 150 },
    });
    // Semana de avaria: quase nada faturado e uma reparação pesada.
    await createSettlement({
      userId: u.id, vehicleId: v.id, createdById: admin.id, weeksAgo: 1,
      commissionRate: RATE, taxRate: TAX, status: 'REGISTERED',
      amounts: {
        uberAmount: 95, boltAmount: 60, tollsAmount: 12, fuelAmount: 40,
        vehicleFee: 150, otherDeductions: 320,
      },
      notes: 'Semana com o carro na oficina. Reparação da embraiagem descontada.',
    });
    await prisma.balanceAdjustment.create({
      data: {
        userId: u.id, amount: dec(45), type: 'DEBIT',
        reason: 'Coima de estacionamento (Lisboa, 12/03).', createdBy: admin.id,
      },
    });
    created.push({
      nome: u.name, email: u.email,
      pergunta: 'Saldo negativo: comissao a zero na semana de prejuizo, botao bloqueado por saldo?',
    });
  }

  // ── 6. Sofia: o caminho do dinheiro, de ponta a ponta ──────────────────────
  //
  // O cenário que interessa mesmo. Tem uma retirada em cada estado, e trocou
  // de IBAN DEPOIS de uma delas ser aprovada: a retirada aprovada continua a
  // mostrar o IBAN antigo enquanto o Perfil mostra o novo à espera de decisão.
  // É a prova visível do congelamento — e a única forma de o ver sem simular a
  // troca à mão de cada vez.
  {
    const u = await createDriver({ name: 'Sofia Lopes', slug: 'sofia', passwordHash: hash });
    const v = await createVehicle({
      brand: 'Volkswagen', model: 'Golf', plate: 'SEED-05-EE', year: 2022,
      weeklyFee: 195, userId: u.id,
    });

    const IBAN_ANTIGO = 'PT50003500000000123456779';
    const IBAN_NOVO = 'PT50001800001234567891585';

    await prisma.bankAccount.create({
      data: {
        userId: u.id,
        iban: IBAN_ANTIGO,
        holderName: 'Sofia Lopes',
        reviewedById: admin.id,
        reviewedAt: daysFromNow(-60),
        // Mudou de banco. O antigo continua a valer até alguém decidir.
        pendingIban: IBAN_NOVO,
        pendingHolderName: 'Sofia Lopes',
        pendingProofUrl: SAMPLE_IMG,
        pendingProofKey: 'seed/comprovativos/sofia',
        pendingAt: daysFromNow(-1),
      },
    });

    for (let w = 1; w <= 8; w++) {
      await createSettlement({
        userId: u.id, vehicleId: v.id, createdById: admin.id, weeksAgo: w,
        commissionRate: RATE, taxRate: TAX, status: 'REGISTERED',
        amounts: {
          uberAmount: 560 + (w % 3) * 40, boltAmount: 480 - (w % 4) * 25,
          tollsAmount: 40, fuelAmount: 98, vehicleFee: 195,
        },
      });
    }

    // Rascunho da semana passada: visível na tela, sem mexer no saldo.
    await createSettlement({
      userId: u.id, vehicleId: v.id, createdById: admin.id, weeksAgo: 9,
      commissionRate: RATE, taxRate: TAX, status: 'DRAFT',
      amounts: { uberAmount: 610, boltAmount: 455, tollsAmount: 44, fuelAmount: 101, vehicleFee: 195 },
    });

    await createWithdrawal({
      userId: u.id, amount: 400, status: 'PAID', daysAgo: 21,
      paidToIban: IBAN_ANTIGO, paidToHolder: 'Sofia Lopes',
      notes: 'TRF 2026/0418 — SEPA imediata.',
    });
    await createWithdrawal({
      userId: u.id, amount: 350, status: 'APPROVED', daysAgo: 4,
      paidToIban: IBAN_ANTIGO, paidToHolder: 'Sofia Lopes',
    });
    await createWithdrawal({ userId: u.id, amount: 200, status: 'PENDING', daysAgo: 1 });
    await createWithdrawal({
      userId: u.id, amount: 120, status: 'REJECTED', daysAgo: 30,
      notes: 'O recibo enviado era de outro mês.',
    });

    // Lançamentos comunicados, à espera de confirmação: alimentam a Revisão.
    await prisma.earning.createMany({
      data: [
        {
          userId: u.id, amount: dec(612.4), platform: 'UBER', status: 'PENDING',
          date: mondayWeeksAgo(1), notes: 'Semana passada, extrato da Uber.',
        },
        {
          userId: u.id, amount: dec(455.9), platform: 'BOLT', status: 'PENDING',
          date: mondayWeeksAgo(1),
        },
      ],
    });

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: u.id, subject: 'Retirada aprovada mas sem transferência',
        category: 'FINANCIAL', status: 'OPEN',
        message: 'A retirada de 350 € foi aprovada há quatro dias e ainda não recebi nada.',
        createdAt: daysFromNow(-1),
      },
    });
    await prisma.ticketReply.create({
      data: {
        ticketId: ticket.id, authorId: admin.id,
        message: 'A transferência sai na próxima ordem de pagamentos. Obrigado pela paciência.',
      },
    });

    created.push({
      nome: u.name, email: u.email,
      pergunta: 'Caminho do dinheiro: 4 retiradas, IBAN congelado difere do pendente, 1 rascunho.',
    });
  }

  // ── Resumo ────────────────────────────────────────────────────────────────
  //
  // Os saldos vêm da vista, e não de contas feitas aqui: se a fórmula mudar, o
  // resumo acompanha em vez de mentir.
  const balances = await prisma.$queryRaw<
    { user_name: string; available: string }[]
  >`SELECT user_name, available FROM driver_balances
    WHERE user_email LIKE ${'%' + SEED_DOMAIN} ORDER BY user_name`;

  const saldo = new Map(balances.map((b) => [b.user_name, Number(b.available)]));

  console.log('\n[seed-demo] Cenários criados:\n');
  for (const c of created) {
    const s = saldo.get(c.nome);
    const eur = s === undefined ? '—' : `${s.toFixed(2)} €`;
    console.log(`  ${c.nome.padEnd(16)} ${eur.padStart(11)}   ${c.email}`);
    console.log(`  ${' '.repeat(16)} ${' '.repeat(11)}   ↳ ${c.pergunta}\n`);
  }
  console.log(`  Password de todos: (a que definiu em SEED_DEMO_PASSWORD)`);
  console.log(`  Para limpar: volte a correr este script.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
