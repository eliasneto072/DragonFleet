// backend/prisma/seed-perf.ts
//
// Popula a base à escala real: 2000 motoristas, um ano de histórico, e mede.
//
// Uso:
//   SEED_PERF=1 npm run seed:perf
//   SEED_PERF=1 SEED_PERF_DRIVERS=500 SEED_PERF_WEEKS=12 npm run seed:perf
//   SEED_PERF=1 SEED_PERF_ONLY=medir npm run seed:perf   (só cronometra)
//   SEED_PERF=1 SEED_PERF_ONLY=limpar npm run seed:perf  (só apaga)
//
// ─── PARA QUE SERVE, E EM QUE DIFERE DO seed-demo ────────────────────────────
//
// O seed-demo tem seis motoristas, um por cenário, para se ver cada estado da
// aplicação com olhos. Este não serve para olhar: serve para MEDIR. Os dados
// são repetitivos de propósito, porque o que interessa é o volume.
//
// ─── O QUE SE ESPERA QUE ELE MOSTRE ──────────────────────────────────────────
//
// Há uma suspeita concreta a confirmar ou desmentir: a `driver_balances` é uma
// VIEW e não uma tabela materializada, ou seja, é recalculada a cada leitura. O
// painel do administrador varre-a INTEIRA duas vezes por carregamento — uma
// para somar o devido a motoristas, outra para listar quem está negativo.
//
// Com seis motoristas isso é instantâneo. Com dois mil e um ano de fechos, cada
// leitura junta e agrega centenas de milhares de linhas. Se for lento, o
// número aparece no fim deste script em vez de aparecer ao cliente.
//
// ─── OS NÚMEROS NÃO SÃO ALEATÓRIOS ───────────────────────────────────────────
//
// O gerador é semeado com um valor fixo. Duas execuções produzem os mesmos
// dados, e por isso duas medições são comparáveis: se um índice melhorar um
// tempo, a diferença é do índice e não de outros dados terem saído.

import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
// A verificação corre ANTES deste import: se corresse depois, o
// MODULE_NOT_FOUND acontecia primeiro e a mensagem nunca apareceria.
import { assertTemCodigoFonte } from './seed-guard';
assertTemCodigoFonte();
// eslint-disable-next-line import/first
import { computeTotals } from '../src/modules/settlements/settlements.types';

const prisma = new PrismaClient();

/** Domínio próprio, separado do seed-demo: cada um limpa só o seu. */
const PERF_DOMAIN = '@perf.dragonfleet.local';

const DRIVERS = Number(process.env.SEED_PERF_DRIVERS ?? 2000);
const WEEKS = Number(process.env.SEED_PERF_WEEKS ?? 52);
const COMMISSION = 15;
const TAX = 6;

/**
 * Linhas por instrução de inserção.
 *
 * Um `createMany` de cem mil linhas monta uma instrução SQL enorme e arrisca
 * estourar o limite de parâmetros do driver. Mil é grande o suficiente para o
 * custo por linha ser desprezável e pequeno o suficiente para nunca lá chegar.
 */
const LOTE = 1000;

// ─── Gerador determinístico ───────────────────────────────────────────────────

/**
 * `Math.random()` não serve: duas execuções dariam dados diferentes e as
 * medições deixavam de ser comparáveis. Este é um gerador simples com semente
 * fixa — não precisa de qualidade estatística, precisa de repetir-se.
 */
let semente = 42;
function aleatorio(): number {
  semente = (semente * 1664525 + 1013904223) % 4294967296;
  return semente / 4294967296;
}
function entre(min: number, max: number): number {
  return min + aleatorio() * (max - min);
}
function inteiroEntre(min: number, max: number): number {
  return Math.floor(entre(min, max + 1));
}

// ─── Datas ────────────────────────────────────────────────────────────────────

const DIA = 86_400_000;

function segundaHaSemanas(n: number): Date {
  const hoje = new Date();
  const meiaNoite = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  const diaDaSemana = meiaNoite.getUTCDay() || 7;
  const estaSegunda = new Date(meiaNoite.getTime() - (diaDaSemana - 1) * DIA);
  return new Date(estaSegunda.getTime() - n * 7 * DIA);
}

function dec(v: number): Prisma.Decimal {
  return new Prisma.Decimal(v.toFixed(2));
}

// ─── Guardas ──────────────────────────────────────────────────────────────────

function assertSafeToRun(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('\n[seed-perf] Recusado: NODE_ENV=production.\n');
    process.exit(1);
  }
  if (process.env.SEED_PERF !== '1') {
    console.error(
      '\n[seed-perf] Recusado: falta SEED_PERF=1.\n' +
      'Este script cria dezenas de milhares de linhas e apaga as anteriores.\n',
    );
    process.exit(1);
  }
}

// ─── Nomes ────────────────────────────────────────────────────────────────────

const PROPRIOS = [
  'Ana', 'Bruno', 'Carla', 'Diogo', 'Eva', 'Filipe', 'Gonçalo', 'Helena',
  'Inês', 'João', 'Leonor', 'Miguel', 'Mónica', 'Nuno', 'Olga', 'Paulo',
  'Rita', 'Rui', 'Sofia', 'Tiago', 'Vera', 'Xavier',
];
const APELIDOS = [
  'Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues',
  'Martins', 'Jesus', 'Sousa', 'Fernandes', 'Gonçalves', 'Gomes', 'Lopes',
  'Marques', 'Alves', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho',
];

/**
 * Nomes com acentos e repetições de propósito.
 *
 * Os acentos exercitam o emparelhamento de nomes da extensão. E com 2000
 * motoristas tirados de 22 nomes próprios e 20 apelidos, vão existir
 * homónimos — que é exatamente o caso em que o emparelhamento tem de devolver
 * ambiguidade em vez de escolher. Aqui isso aparece sozinho, à escala.
 */
function nome(i: number): string {
  return `${PROPRIOS[i % PROPRIOS.length]} ${APELIDOS[Math.floor(i / PROPRIOS.length) % APELIDOS.length]}`;
}

// ─── Limpeza ──────────────────────────────────────────────────────────────────

async function limpar(): Promise<number> {
  const anteriores = await prisma.user.findMany({
    where: { email: { endsWith: PERF_DOMAIN } },
    select: { id: true },
  });
  if (anteriores.length === 0) return 0;

  const ids = anteriores.map((u) => u.id);
  process.stdout.write(`[seed-perf] A apagar ${ids.length} motoristas anteriores… `);

  // Em lotes: um `IN` com dois mil identificadores é uma instrução pesada, e o
  // cascade de cada utilizador arrasta centenas de linhas.
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    await prisma.weeklySettlement.deleteMany({ where: { createdById: { in: lote } } });
    await prisma.user.deleteMany({ where: { id: { in: lote } } });
  }
  await prisma.vehicle.deleteMany({ where: { plate: { startsWith: 'PERF-' } } });

  console.log('feito.');
  return ids.length;
}

// ─── Construção ───────────────────────────────────────────────────────────────

function barra(feito: number, total: number): string {
  const pct = Math.round((feito / total) * 100);
  const cheios = Math.round(pct / 5);
  return `[${'█'.repeat(cheios)}${'░'.repeat(20 - cheios)}] ${pct}%`;
}

async function construir(adminId: string, hash: string) {
  const t0 = Date.now();

  // ── Motoristas ──
  process.stdout.write(`[seed-perf] ${DRIVERS} motoristas… `);
  const utilizadores = Array.from({ length: DRIVERS }, (_, i) => ({
    name: nome(i),
    email: `m${i}${PERF_DOMAIN}`,
    password: hash,
    role: 'DRIVER' as const,
    // 5% inativos: a listagem e o emparelhamento têm de os tratar à parte.
    status: (i % 20 === 0 ? 'INACTIVE' : 'ACTIVE') as 'INACTIVE' | 'ACTIVE',
  }));
  for (let i = 0; i < utilizadores.length; i += LOTE) {
    await prisma.user.createMany({ data: utilizadores.slice(i, i + LOTE) });
  }
  const criados = await prisma.user.findMany({
    where: { email: { endsWith: PERF_DOMAIN } },
    select: { id: true },
    orderBy: { email: 'asc' },
  });
  console.log(`${criados.length} criados.`);

  // ── Contas bancárias ──
  //
  // 90% aprovadas, 10% pendentes. As pendentes alimentam a fila do painel, que
  // as conta com uma consulta própria.
  process.stdout.write('[seed-perf] Contas bancárias… ');
  const contas = criados.map((u, i) => (i % 10 === 0
    ? {
        userId: u.id,
        pendingIban: 'PT50002700000001234567833',
        pendingHolderName: 'Titular de Teste',
        pendingProofUrl: 'https://exemplo.invalido/perf/comprovativo.pdf',
        pendingProofKey: `perf/comprovativos/${u.id}`,
        pendingAt: new Date(),
      }
    : {
        userId: u.id,
        iban: 'PT50003300004567890123437',
        holderName: 'Titular de Teste',
        reviewedAt: new Date(),
      }));
  for (let i = 0; i < contas.length; i += LOTE) {
    await prisma.bankAccount.createMany({ data: contas.slice(i, i + LOTE) });
  }
  console.log(`${contas.length} criadas.`);

  // ── Fechos e lançamentos ──
  //
  // A parte pesada. Gerados semana a semana e escritos em lotes: acumular
  // tudo em memória antes de escrever seriam centenas de milhares de objetos
  // vivos ao mesmo tempo.
  console.log(`[seed-perf] ${WEEKS} semanas de fechos e lançamentos:`);

  let fechosTotal = 0;
  let lancamentosTotal = 0;

  for (let w = WEEKS; w >= 1; w--) {
    const weekStart = segundaHaSemanas(w);
    const weekEnd = new Date(weekStart.getTime() + 6 * DIA);

    const fechos: Prisma.WeeklySettlementCreateManyInput[] = [];
    const lancamentos: Prisma.EarningCreateManyInput[] = [];

    for (const u of criados) {
      // Nem toda a gente trabalha todas as semanas. 15% de faltas dá buracos
      // no histórico, que é o que faz a métrica de "motoristas que faturaram"
      // significar alguma coisa.
      if (aleatorio() < 0.15) continue;

      const uber = Math.round(entre(180, 750) * 100) / 100;
      const bolt = Math.round(entre(120, 620) * 100) / 100;
      const amounts = {
        uberAmount: uber,
        boltAmount: bolt,
        otherRevenue: 0,
        tollsAmount: Math.round(entre(15, 70) * 100) / 100,
        fuelAmount: Math.round(entre(60, 160) * 100) / 100,
        vehicleFee: 180,
        // 8% das semanas levam uma despesa extra pesada: é o que produz
        // fechos negativos e, com eles, saldos negativos para o painel listar.
        otherDeductions: aleatorio() < 0.08 ? Math.round(entre(200, 600) * 100) / 100 : 0,
      };

      const totals = computeTotals({ ...amounts, commissionRate: COMMISSION, taxRate: TAX });

      fechos.push({
        userId: u.id,
        createdById: adminId,
        weekStart, weekEnd,
        uberAmount: dec(amounts.uberAmount),
        boltAmount: dec(amounts.boltAmount),
        otherRevenue: dec(0),
        tollsAmount: dec(amounts.tollsAmount),
        fuelAmount: dec(amounts.fuelAmount),
        vehicleFee: dec(amounts.vehicleFee),
        otherDeductions: dec(amounts.otherDeductions),
        commissionRate: dec(COMMISSION),
        taxRate: dec(TAX),
        taxBase: dec(totals.taxBase),
        taxAmount: dec(totals.taxAmount),
        grossRevenue: dec(totals.grossRevenue),
        totalDeductions: dec(totals.totalDeductions),
        profitBase: dec(totals.profitBase),
        commissionAmount: dec(totals.commissionAmount),
        netToDriver: dec(totals.netToDriver),
        status: 'REGISTERED',
        registeredAt: weekEnd,
      });

      lancamentos.push(
        { userId: u.id, amount: dec(uber), platform: 'UBER', status: 'APPROVED', date: weekEnd },
        { userId: u.id, amount: dec(bolt), platform: 'BOLT', status: 'APPROVED', date: weekEnd },
      );
    }

    for (let i = 0; i < fechos.length; i += LOTE) {
      await prisma.weeklySettlement.createMany({ data: fechos.slice(i, i + LOTE) });
    }
    for (let i = 0; i < lancamentos.length; i += LOTE) {
      await prisma.earning.createMany({ data: lancamentos.slice(i, i + LOTE) });
    }

    fechosTotal += fechos.length;
    lancamentosTotal += lancamentos.length;
    process.stdout.write(`\r  ${barra(WEEKS - w + 1, WEEKS)}  ${fechosTotal} fechos, ${lancamentosTotal} lançamentos   `);
  }
  console.log('');

  // ── Retiradas ──
  //
  // Metade dos motoristas retira, com quatro pedidos ao longo do ano. O recibo
  // é uma referência fictícia: cem mil envios reais para o Cloudinary eram
  // impensáveis, e o que se quer medir é o peso na base de dados.
  process.stdout.write('[seed-perf] Retiradas… ');
  const retiradas: Prisma.WithdrawalCreateManyInput[] = [];
  for (const [i, u] of criados.entries()) {
    if (i % 2 !== 0) continue;
    for (let k = 0; k < 4; k++) {
      const semanasAtras = inteiroEntre(1, Math.max(1, WEEKS - 1));
      const estados = ['PAID', 'PAID', 'PAID', 'APPROVED', 'PENDING', 'REJECTED'] as const;
      const status = estados[inteiroEntre(0, estados.length - 1)];
      retiradas.push({
        userId: u.id,
        amount: dec(Math.round(entre(50, 400) * 100) / 100),
        status,
        requestedAt: segundaHaSemanas(semanasAtras),
        processedAt: status === 'PENDING' ? null : segundaHaSemanas(semanasAtras - 0),
        receiptUrl: 'https://exemplo.invalido/perf/recibo.pdf',
        receiptKey: `perf/recibos/${u.id}-${k}`,
        paidToIban: status === 'PENDING' || status === 'REJECTED'
          ? null : 'PT50003300004567890123437',
        paidToHolder: status === 'PENDING' || status === 'REJECTED' ? null : 'Titular de Teste',
        notes: status === 'REJECTED' ? 'Recibo ilegível.' : null,
      });
    }
  }
  for (let i = 0; i < retiradas.length; i += LOTE) {
    await prisma.withdrawal.createMany({ data: retiradas.slice(i, i + LOTE) });
  }
  console.log(`${retiradas.length} criadas.`);

  const segundos = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[seed-perf] Inserção concluída em ${segundos}s.`);
  console.log(`  ${criados.length} motoristas · ${fechosTotal} fechos · ${lancamentosTotal} lançamentos · ${retiradas.length} retiradas\n`);
}

// ─── Medição ──────────────────────────────────────────────────────────────────

/**
 * Corre a consulta três vezes e fica com a mediana.
 *
 * A primeira execução paga o aquecimento das caches do Postgres e é sempre a
 * mais lenta; uma medição única sobre ela exagera o problema. A mediana de três
 * é estável o suficiente para comparar antes e depois de uma alteração.
 */
async function cronometrar(nome: string, fn: () => Promise<unknown>): Promise<number> {
  const tempos: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    await fn();
    tempos.push(Date.now() - t);
  }
  tempos.sort((a, b) => a - b);
  const mediana = tempos[1];

  const marca = mediana < 100 ? 'ok  ' : mediana < 500 ? 'LENTO' : 'MAU  ';
  console.log(`  [${marca}] ${mediana.toString().padStart(5)}ms  ${nome}`);
  return mediana;
}

async function medir() {
  const total = await prisma.weeklySettlement.count();
  console.log(`\n[seed-perf] Medições — ${total} fechos na base\n`);

  const umAnoAtras = segundaHaSemanas(52);
  const agora = new Date();

  console.log('  ── A vista de saldos ──');
  await cronometrar('saldo de UM motorista', () => prisma.$queryRaw`
    SELECT available FROM driver_balances LIMIT 1
  `);
  await cronometrar('somar o devido a TODOS (painel)', () => prisma.$queryRaw`
    SELECT
      COALESCE(SUM(CASE WHEN available > 0 THEN available ELSE 0 END), 0) AS owed_to,
      COALESCE(SUM(CASE WHEN available < 0 THEN -available ELSE 0 END), 0) AS owed_by
    FROM driver_balances b JOIN users u ON u.id = b.user_id AND u.role = 'DRIVER'
  `);
  await cronometrar('listar quem está negativo (painel)', () => prisma.$queryRaw`
    SELECT b.user_id, b.user_name, b.available
    FROM driver_balances b JOIN users u ON u.id = b.user_id AND u.role = 'DRIVER'
    WHERE b.available < 0 ORDER BY b.available ASC
  `);

  console.log('\n  ── As Análises, sobre um ano ──');
  await cronometrar('agregado dos fechos', () => prisma.weeklySettlement.aggregate({
    where: { status: 'REGISTERED', weekEnd: { gte: umAnoAtras, lte: agora } },
    _sum: { grossRevenue: true, commissionAmount: true, netToDriver: true },
    _count: { _all: true },
  }));
  await cronometrar('série do gráfico', () => prisma.$queryRaw`
    SELECT TO_CHAR(week_start, 'YYYY-MM') AS bucket, SUM(gross_revenue) AS total
    FROM weekly_settlements
    WHERE status = 'REGISTERED' AND week_end >= ${umAnoAtras} AND week_end <= ${agora}
    GROUP BY bucket ORDER BY bucket
  `);
  await cronometrar('top 10 motoristas', () => prisma.$queryRaw`
    SELECT u.name, SUM(s.gross_revenue) AS total
    FROM weekly_settlements s JOIN users u ON u.id = s.user_id
    WHERE s.status = 'REGISTERED' AND s.week_end >= ${umAnoAtras} AND s.week_end <= ${agora}
    GROUP BY u.id, u.name ORDER BY total DESC LIMIT 10
  `);

  console.log('\n  ── Outras da fila do painel ──');
  await cronometrar('motoristas sem fecho da semana passada', () => prisma.$queryRaw`
    SELECT u.id FROM users u
    WHERE u.role = 'DRIVER' AND u.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM weekly_settlements s
        WHERE s.user_id = u.id AND s.week_start = ${segundaHaSemanas(1)}
      )
  `);
  await cronometrar('contar retiradas pendentes', () =>
    prisma.withdrawal.count({ where: { status: 'PENDING' } }));
  await cronometrar('emparelhamento: carregar motoristas ativos', () =>
    prisma.user.findMany({
      where: { role: 'DRIVER', status: 'ACTIVE' },
      select: { id: true, name: true },
    }));

  console.log('\n  ok = abaixo de 100ms · LENTO = acima de 100ms · MAU = acima de 500ms');
  console.log('  Uma tela que faça várias destas soma os tempos.\n');
}

// ─── Principal ────────────────────────────────────────────────────────────────

async function main() {
  assertSafeToRun();
  const so = process.env.SEED_PERF_ONLY;

  if (so === 'medir') { await medir(); return; }

  if (so === 'limpar') {
    const n = await limpar();
    console.log(`[seed-perf] ${n} motoristas de desempenho removidos.`);
    return;
  }

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.error(
      '\n[seed-perf] Não há nenhum administrador na base, e os fechos precisam de\n' +
      'um autor. Corra primeiro o prisma/seed-admin.ts.\n',
    );
    process.exit(1);
  }

  await limpar();
  // Um hash só, reutilizado: o bcrypt é lento de propósito e gerar dois mil
  // levaria mais tempo do que todo o resto do script.
  const hash = await bcrypt.hash('perf-nao-usar', 10);
  await construir(admin.id, hash);
  await medir();

  console.log('[seed-perf] Para remover tudo isto:');
  console.log('  SEED_PERF=1 SEED_PERF_ONLY=limpar npm run seed:perf\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
