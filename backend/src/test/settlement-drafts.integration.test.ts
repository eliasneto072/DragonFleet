// src/test/settlement-drafts.integration.test.ts
//
// "Gerar rascunhos da semana": do que a extensão importou a um fecho por
// registar, contra Postgres.
//
// As três decisões do cliente estão aqui como testes, para não mudarem em
// silêncio: só quem tem dados, quem já tem fecho é saltado, e nada é
// registado — o dinheiro continua a exigir uma pessoa.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaMotorista, criaAdmin, criaVeiculo, criaFecho } from './factories';
import { UserRole } from '../shared/types/enums';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let ana: Awaited<ReturnType<typeof criaMotorista>>;
let seq = 0;

const SEMANA = '2026-09-21';
const dia = (d: string) => new Date(`${d}T00:00:00Z`);
const comoAdmin = () => authHeader(admin.id, UserRole.ADMIN);

const gerar = (weekStart = SEMANA) =>
  request(app).post('/settlements/drafts').set(comoAdmin()).send({ weekStart });

async function ganho(userId: string, platform: 'UBER' | 'BOLT' | 'FREE_NOW', amount: number,
  status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING', date = '2026-09-27') {
  return testDb.earning.create({ data: { userId, platform, amount, status, date: dia(date) } });
}

async function despesa(o: {
  userId: string | null; source: 'PRIO' | 'VIA_VERDE'; amount: number;
  week?: string; chargeable?: boolean;
}) {
  seq += 1;
  const semana = o.week ?? SEMANA;
  return testDb.expenseMovement.create({
    data: {
      source: o.source,
      category: o.source === 'PRIO' ? 'FUEL' : 'TOLL',
      occurredAt: new Date(`${semana}T10:00:00Z`),
      day: dia(semana),
      settlementWeek: dia(semana),
      description: `movimento ${seq}`,
      amount: o.amount,
      chargeable: o.chargeable ?? true,
      userId: o.userId,
      externalKey: `teste-${seq}`,
      importedById: admin.id,
    },
  });
}

async function atribui(vehicleId: string, userId: string, desde: string, ate: string | null = null) {
  return testDb.vehicleAssignment.create({
    data: { vehicleId, userId, startedAt: new Date(desde), endedAt: ate ? new Date(ate) : null },
  });
}

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  ana = await criaMotorista({ name: 'Ana Martins' });
});

afterAll(async () => { await testDb.$disconnect(); });

describe('o rascunho leva o que foi importado', () => {
  it('ganhos, combustível, portagens e a viatura, com o cálculo do servidor', async () => {
    const carro = await criaVeiculo({ plate: 'AA-01-DF', weeklyFee: 150, userId: ana.id });
    await atribui(carro.id, ana.id, '2026-09-01T00:00:00Z');

    await ganho(ana.id, 'UBER', 612.40);
    await ganho(ana.id, 'BOLT', 160.10, 'APPROVED');
    await despesa({ userId: ana.id, source: 'PRIO', amount: 82.93 });
    await despesa({ userId: ana.id, source: 'PRIO', amount: 55.35 });
    await despesa({ userId: ana.id, source: 'VIA_VERDE', amount: 1.00 });
    await despesa({ userId: ana.id, source: 'VIA_VERDE', amount: 1.00 });

    const r = await gerar().expect(201);
    expect(r.body.data.created).toHaveLength(1);

    const s = await testDb.weeklySettlement.findFirstOrThrow({ where: { userId: ana.id } });
    expect(s.status).toBe('DRAFT');
    expect(Number(s.uberAmount)).toBe(612.40);
    expect(Number(s.boltAmount)).toBe(160.10);
    expect(Number(s.fuelAmount)).toBe(138.28);
    expect(Number(s.tollsAmount)).toBe(2.00);
    expect(Number(s.vehicleFee)).toBe(150);
    expect(s.vehicleId).toBe(carro.id);
    // 15% e 6% — os valores por omissão das Configurações.
    expect(Number(s.netToDriver)).toBe(370.49);
    expect(s.weekEnd.toISOString().slice(0, 10)).toBe('2026-09-27');
  });

  it('deixa nas notas internas de onde veio, e nada nas do motorista', async () => {
    await ganho(ana.id, 'UBER', 100);
    await despesa({ userId: ana.id, source: 'PRIO', amount: 40 });

    await gerar().expect(201);
    const s = await testDb.weeklySettlement.findFirstOrThrow({ where: { userId: ana.id } });
    expect(s.internalNotes).toMatch(/Rascunho gerado dos portais/);
    expect(s.internalNotes).toMatch(/Uber/);
    expect(s.internalNotes).toMatch(/Prio/);
    expect(s.notes).toBeNull();
  });

  it('os recusados não entram, e as despesas que não se descontam também não', async () => {
    await ganho(ana.id, 'UBER', 100);
    await ganho(ana.id, 'UBER', 999, 'REJECTED');
    await despesa({ userId: ana.id, source: 'VIA_VERDE', amount: 1.00 });
    await despesa({ userId: ana.id, source: 'VIA_VERDE', amount: 1.49, chargeable: false });

    await gerar().expect(201);
    const s = await testDb.weeklySettlement.findFirstOrThrow({ where: { userId: ana.id } });
    expect(Number(s.uberAmount)).toBe(100);
    expect(Number(s.tollsAmount)).toBe(1.00);
  });

  it('as despesas entram pela semana de FECHO gravada, não pela data do movimento', async () => {
    await despesa({ userId: ana.id, source: 'VIA_VERDE', amount: 2.50 });
    await despesa({ userId: ana.id, source: 'VIA_VERDE', amount: 9.99, week: '2026-09-28' });

    await gerar().expect(201);
    const s = await testDb.weeklySettlement.findFirstOrThrow({ where: { userId: ana.id } });
    expect(Number(s.tollsAmount)).toBe(2.50);
  });

  it('outras plataformas vão para Outras receitas', async () => {
    await ganho(ana.id, 'FREE_NOW', 80);
    await gerar().expect(201);
    const s = await testDb.weeklySettlement.findFirstOrThrow({ where: { userId: ana.id } });
    expect(Number(s.otherRevenue)).toBe(80);
    expect(Number(s.uberAmount)).toBe(0);
  });

  it('trocou de carro a meio: fica o que teve mais tempo, e a nota diz o outro', async () => {
    const curto = await criaVeiculo({ plate: 'CU-00-RT', weeklyFee: 100 });
    const longo = await criaVeiculo({ plate: 'LO-00-NG', weeklyFee: 200, userId: ana.id });
    await atribui(curto.id, ana.id, '2026-09-01T00:00:00Z', '2026-09-23T00:00:00Z');
    await atribui(longo.id, ana.id, '2026-09-23T00:00:00Z');
    await ganho(ana.id, 'UBER', 300);

    await gerar().expect(201);
    const s = await testDb.weeklySettlement.findFirstOrThrow({ where: { userId: ana.id } });
    expect(s.vehicleId).toBe(longo.id);
    expect(Number(s.vehicleFee)).toBe(200);
    expect(s.internalNotes).toMatch(/CU-00-RT/);
  });
});

describe('as decisões do cliente', () => {
  it('é um RASCUNHO: não credita nada até alguém registar', async () => {
    await ganho(ana.id, 'UBER', 500);
    await gerar().expect(201);

    const s = await testDb.weeklySettlement.findFirstOrThrow({ where: { userId: ana.id } });
    expect(s.status).toBe('DRAFT');
    expect(s.registeredAt).toBeNull();
    const [saldo] = await testDb.$queryRaw<{ settlements: number }[]>`
      SELECT CAST(settlements AS FLOAT) AS settlements FROM driver_balances WHERE user_id = ${ana.id}`;
    expect(Number(saldo.settlements)).toBe(0);
  });

  it('só para quem tem dados na semana — ter carro não chega', async () => {
    const semDados = await criaMotorista({ name: 'Sem Dados' });
    const carro = await criaVeiculo({ weeklyFee: 150, userId: semDados.id });
    await atribui(carro.id, semDados.id, '2026-09-01T00:00:00Z');
    const soMensalidade = await criaMotorista({ name: 'So Mensalidade' });
    await despesa({ userId: soMensalidade.id, source: 'VIA_VERDE', amount: 1.49, chargeable: false });
    await ganho(ana.id, 'UBER', 100);

    const r = await gerar().expect(201);
    expect(r.body.data.created.map((c: any) => c.userId)).toEqual([ana.id]);
  });

  it('quem já tem fecho na semana é saltado, e o fecho dele fica intacto', async () => {
    const bruno = await criaMotorista({ name: 'Bruno Sousa' });
    const existente = await criaFecho({
      userId: bruno.id, createdById: admin.id, weekStart: dia(SEMANA), status: 'DRAFT', uberAmount: 42,
    });
    await ganho(bruno.id, 'UBER', 455.10);
    await ganho(ana.id, 'UBER', 100);

    const r = await gerar().expect(201);
    expect(r.body.data.created).toHaveLength(1);
    expect(r.body.data.skipped).toEqual([
      expect.objectContaining({ userId: bruno.id, settlementId: existente.id, status: 'DRAFT' }),
    ]);
    const intacto = await testDb.weeklySettlement.findUniqueOrThrow({ where: { id: existente.id } });
    expect(Number(intacto.uberAmount)).toBe(42);
  });

  it('um fecho registado também faz saltar', async () => {
    await criaFecho({ userId: ana.id, createdById: admin.id, weekStart: dia(SEMANA), status: 'REGISTERED' });
    await ganho(ana.id, 'UBER', 100);

    const r = await gerar().expect(201);
    expect(r.body.data.created).toHaveLength(0);
    expect(r.body.data.skipped[0].status).toBe('REGISTERED');
  });

  it('um cancelado na mesma segunda-feira ainda ocupa a semana — e diz-se qual', async () => {
    // O índice único (motorista, início) conta os cancelados. Até isso mudar,
    // o caminho é apagar o cancelado; a lista tem de o mostrar como motivo.
    const cancelado = await criaFecho({
      userId: ana.id, createdById: admin.id, weekStart: dia(SEMANA), status: 'CANCELLED',
    });
    await ganho(ana.id, 'UBER', 100);

    const r = await gerar().expect(201);
    expect(r.body.data.created).toHaveLength(0);
    expect(r.body.data.skipped).toEqual([
      expect.objectContaining({ settlementId: cancelado.id, status: 'CANCELLED' }),
    ]);
  });

  it('o formulário manual, na mesma situação, responde 409 com o que fazer — e não 500', async () => {
    await criaFecho({ userId: ana.id, createdById: admin.id, weekStart: dia(SEMANA), status: 'CANCELLED' });

    const r = await request(app).post('/settlements').set(comoAdmin()).send({
      userId: ana.id, weekStart: SEMANA, weekEnd: '2026-09-27', uberAmount: 100,
    }).expect(409);
    expect(r.body.code).toBe('WEEK_TAKEN_BY_CANCELLED');
  });

  it('correr duas vezes não duplica', async () => {
    await ganho(ana.id, 'UBER', 100);
    await gerar().expect(201);
    const r = await gerar().expect(201);

    expect(r.body.data.created).toHaveLength(0);
    expect(r.body.data.skipped).toHaveLength(1);
    expect(await testDb.weeklySettlement.count()).toBe(1);
  });
});

describe('pré-visualizar', () => {
  it('diz quem e quanto, sem gravar nada', async () => {
    await ganho(ana.id, 'UBER', 612.40);
    await ganho(ana.id, 'BOLT', 160.10);

    const r = await request(app).post('/settlements/drafts/preview')
      .set(comoAdmin()).send({ weekStart: SEMANA }).expect(200);

    expect(r.body.data.toCreate).toHaveLength(1);
    expect(r.body.data.toCreate[0]).toMatchObject({ userName: 'Ana Martins', uberAmount: 612.40, boltAmount: 160.10 });
    expect(r.body.data.toCreate[0].netToDriver).toBeGreaterThan(0);
    expect(r.body.data.commissionRate).toBe(15);
    expect(await testDb.weeklySettlement.count()).toBe(0);
  });
});

describe('guardas', () => {
  it('a semana tem de começar à segunda', async () => {
    const r = await gerar('2026-09-22').expect(400);
    expect(r.body.code).toBe('WEEK_START_NOT_MONDAY');
  });

  it('um motorista não gera nada', async () => {
    await request(app).post('/settlements/drafts')
      .set(authHeader(ana.id, UserRole.DRIVER)).send({ weekStart: SEMANA }).expect(403);
    await request(app).post('/settlements/drafts/preview')
      .set(authHeader(ana.id, UserRole.DRIVER)).send({ weekStart: SEMANA }).expect(403);
  });

  it('sem sessão, 401', async () => {
    await request(app).post('/settlements/drafts').send({ weekStart: SEMANA }).expect(401);
  });
});
