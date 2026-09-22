// src/test/investments.integration.test.ts
//
// Investimentos: aplicar, render, resgatar — e o saldo principal a acompanhar.
//
// ─── O QUE TEM DE SER VERDADE ────────────────────────────────────────────────
//
// 1. Aplicar tira do saldo; resgatar devolve. Nunca se aplica o que não há.
// 2. Cada dia rende uma vez, à taxa desse dia, e nunca duas vezes.
// 3. O extrato continua a bater com a view depois de aplicar e resgatar.
// 4. Só o ADMIN mexe nos planos; só o titular (ou o ADMIN) resgata.
//
// Os dias passam mexendo diretamente no `startDate` na base: o serviço usa a
// data de hoje em Lisboa, e recuar a aplicação N dias é a forma honesta de
// simular N dias sem trocar o relógio do processo.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaMotorista, criaAdmin, criaFecho } from './factories';
import { UserRole } from '../shared/types/enums';
import { investmentsService } from '../modules/investments/investments.service';
import { withdrawalsService } from '../modules/withdrawals/withdrawals.service';
import { addDays, dayToDate, lisbonDay } from '../modules/investments/investments.math';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let motorista: Awaited<ReturnType<typeof criaMotorista>>;

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  motorista = await criaMotorista();
  // 1000 € de saldo: um fecho de 1000 sem despesas nem comissão.
  await criaFecho({ userId: motorista.id, createdById: admin.id, uberAmount: 1000 });
});

const asAdmin = () => authHeader(admin.id, UserRole.ADMIN);
const asDriver = (id = motorista.id) => authHeader(id, UserRole.DRIVER);

async function criaPlano(body: Record<string, unknown>) {
  const r = await request(app).post('/investments/plans').set(asAdmin()).send(body).expect(201);
  return r.body.data.plan as { id: string };
}

const flexivel = (annualRate = 3.65) =>
  criaPlano({ name: 'Flexível', type: 'FLEXIBLE', annualRate });

const fixo = (opts: { annualRate?: number; termDays?: number; penalty?: number } = {}) =>
  criaPlano({
    name: 'Fixo',
    type: 'FIXED',
    annualRate: opts.annualRate ?? 3.65,
    termDays: opts.termDays ?? 90,
    earlyWithdrawalPenalty: opts.penalty ?? 2,
  });

// SEM `async`: um `async` embrulhava o pedido numa Promise simples e perdia o
// `.expect()` do supertest — foi o erro de tipos na primeira ida à CI.
function aplica(planId: string, amount: number, userId = motorista.id) {
  return request(app).post('/investments').set(asDriver(userId)).send({ planId, amount });
}

async function saldo(userId = motorista.id) {
  const r = await request(app).get(`/balance/${userId}`).set(asAdmin()).expect(200);
  return r.body.data.balance;
}

/** Recua a aplicação `dias` dias, como se tivesse sido feita nessa altura. */
async function envelhece(investmentId: string, dias: number) {
  const inv = await testDb.investment.findUniqueOrThrow({ where: { id: investmentId } });
  const start = addDays(lisbonDay(), -dias);
  await testDb.investment.update({
    where: { id: investmentId },
    data: {
      startDate: dayToDate(start),
      maturityDate: inv.termDays ? dayToDate(addDays(start, inv.termDays)) : null,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('aplicar', () => {
  it('tira o valor do saldo disponível', async () => {
    const p = await flexivel();
    await aplica(p.id, 400).expect(201);

    const s = await saldo();
    expect(s.available).toBeCloseTo(600, 2);
    expect(s.investedActive).toBeCloseTo(400, 2);
  });

  it('recusa aplicar mais do que o disponível, e não cria nada', async () => {
    const p = await flexivel();
    const r = await aplica(p.id, 1000.01).expect(400);
    expect(r.body.code).toBe('INSUFFICIENT_BALANCE');
    expect(await testDb.investment.count()).toBe(0);
  });

  it('dois pedidos em simultâneo não gastam o mesmo saldo duas vezes', async () => {
    const p = await flexivel();
    const [a, b] = await Promise.all([aplica(p.id, 700), aplica(p.id, 700)]);

    const codigos = [a.status, b.status].sort();
    expect(codigos).toEqual([201, 400]);
    expect(await testDb.investment.count()).toBe(1);
    expect((await saldo()).available).toBeCloseTo(300, 2);
  });

  it('recusa planos desativados e valores abaixo do mínimo', async () => {
    const inativo = await criaPlano({ name: 'X', type: 'FLEXIBLE', annualRate: 2, active: false });
    expect((await aplica(inativo.id, 100).expect(400)).body.code).toBe('PLAN_UNAVAILABLE');

    const minimo = await criaPlano({ name: 'Y', type: 'FLEXIBLE', annualRate: 2, minAmount: 500 });
    expect((await aplica(minimo.id, 100).expect(400)).body.code).toBe('BELOW_MIN_AMOUNT');
  });

  it('as retiradas passam a ver o saldo sem o que está aplicado', async () => {
    const p = await flexivel();
    await aplica(p.id, 900).expect(201);

    // Pelo serviço e não por HTTP: a rota das retiradas exige um ficheiro em
    // multipart, e o que interessa aqui é a verificação de saldo, que vem
    // antes de tudo o resto.
    await expect(
      withdrawalsService.create(
        { id: motorista.id, role: UserRole.DRIVER },
        motorista.id,
        { amount: 200, receiptUrl: 'https://x.local/r.pdf', receiptKey: 'k' } as never,
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
  });

  it('um fixo congela taxa, prazo e penalização no momento da aplicação', async () => {
    const p = await fixo({ annualRate: 5, termDays: 30, penalty: 3 });
    const r = await aplica(p.id, 100).expect(201);

    // O plano muda depois — a aplicação feita não.
    await request(app).patch(`/investments/plans/${p.id}`).set(asAdmin())
      .send({ annualRate: 1, termDays: 365, earlyWithdrawalPenalty: 50 }).expect(200);

    const inv = await testDb.investment.findUniqueOrThrow({ where: { id: r.body.data.investment.id } });
    expect(Number(inv.annualRate)).toBe(5);
    expect(inv.termDays).toBe(30);
    expect(Number(inv.penaltyRate)).toBe(3);
  });
});

describe('render', () => {
  it('paga um dia por cada dia que passou, e só uma vez', async () => {
    const p = await flexivel(3.65); // 1000 € → 0,10 €/dia; 500 € → 0,05 €/dia
    const r = await aplica(p.id, 500).expect(201);
    await envelhece(r.body.data.investment.id, 10);

    await investmentsService.runDailyAccrual();
    await investmentsService.runDailyAccrual(); // segunda vez: nada muda

    const inv = await testDb.investment.findUniqueOrThrow({ where: { id: r.body.data.investment.id } });
    expect(await testDb.investmentAccrual.count({ where: { investmentId: inv.id } })).toBe(10);
    expect(Number(inv.accrued)).toBeCloseTo(0.5, 6);
  });

  it('nos flexíveis cada dia rende à taxa desse dia', async () => {
    const p = await flexivel(3.65);
    const r = await aplica(p.id, 1000).expect(201);
    const id = r.body.data.investment.id;
    await envelhece(id, 4);

    // Histórico: 3,65% desde há 4 dias, 7,3% desde há 2 dias.
    await testDb.investmentPlanRate.deleteMany({ where: { planId: p.id } });
    await testDb.investmentPlanRate.createMany({
      data: [
        { planId: p.id, annualRate: 3.65, effectiveFrom: dayToDate(addDays(lisbonDay(), -4)) },
        { planId: p.id, annualRate: 7.3, effectiveFrom: dayToDate(addDays(lisbonDay(), -2)) },
      ],
    });

    await investmentsService.runDailyAccrual();

    const dias = await testDb.investmentAccrual.findMany({ where: { investmentId: id }, orderBy: { day: 'asc' } });
    expect(dias.map((d) => Number(d.amount))).toEqual([0.1, 0.1, 0.2, 0.2]);
  });

  it('não aceita taxas com data no passado', async () => {
    const p = await flexivel();
    const r = await request(app).post(`/investments/plans/${p.id}/rates`).set(asAdmin())
      .send({ annualRate: 9, effectiveFrom: addDays(lisbonDay(), -1) }).expect(400);
    expect(r.body.code).toBe('RATE_IN_PAST');
  });

  it('um fixo vencido fecha sozinho, sem penalização, e o dinheiro volta ao saldo', async () => {
    const p = await fixo({ annualRate: 3.65, termDays: 30, penalty: 10 });
    const r = await aplica(p.id, 1000).expect(201);
    await envelhece(r.body.data.investment.id, 31);

    await investmentsService.runDailyAccrual();

    const inv = await testDb.investment.findUniqueOrThrow({ where: { id: r.body.data.investment.id } });
    expect(inv.status).toBe('CLOSED');
    expect(inv.closeReason).toBe('MATURED');
    expect(Number(inv.payout)).toBeCloseTo(1003, 2); // 30 dias × 0,10
    expect((await saldo()).available).toBeCloseTo(1003, 2);
  });
});

describe('resgatar', () => {
  it('flexível: devolve principal e ganhos ao saldo', async () => {
    const p = await flexivel(3.65);
    const r = await aplica(p.id, 1000).expect(201);
    const id = r.body.data.investment.id;
    await envelhece(id, 5);

    const prev = await request(app).get(`/investments/${id}/withdraw-preview`).set(asDriver()).expect(200);
    expect(prev.body.data.preview.payout).toBeCloseTo(1000.5, 2);

    await request(app).post(`/investments/${id}/withdraw`).set(asDriver()).expect(200);

    const s = await saldo();
    expect(s.available).toBeCloseTo(1000.5, 2);
    expect(s.investedActive).toBe(0);
  });

  it('fixo antes do prazo: aplica a penalização sobre o valor aplicado', async () => {
    const p = await fixo({ annualRate: 3.65, termDays: 90, penalty: 2 });
    const r = await aplica(p.id, 1000).expect(201);
    const id = r.body.data.investment.id;
    await envelhece(id, 10);

    await request(app).post(`/investments/${id}/withdraw`).set(asDriver()).expect(200);

    const inv = await testDb.investment.findUniqueOrThrow({ where: { id } });
    expect(inv.closeReason).toBe('EARLY');
    expect(Number(inv.penaltyAmount)).toBeCloseTo(20, 2);
    expect(Number(inv.payout)).toBeCloseTo(981, 2); // 1000 + 1 − 20
  });

  it('não se resgata duas vezes', async () => {
    const p = await flexivel();
    const r = await aplica(p.id, 100).expect(201);
    const id = r.body.data.investment.id;
    await request(app).post(`/investments/${id}/withdraw`).set(asDriver()).expect(200);
    const again = await request(app).post(`/investments/${id}/withdraw`).set(asDriver()).expect(400);
    expect(again.body.code).toBe('ALREADY_CLOSED');
  });

  it('o extrato continua a bater com a view depois de aplicar e resgatar', async () => {
    const p = await flexivel(3.65);
    const r1 = await aplica(p.id, 300).expect(201);
    await aplica(p.id, 200).expect(201);
    await envelhece(r1.body.data.investment.id, 7);
    await request(app).post(`/investments/${r1.body.data.investment.id}/withdraw`).set(asDriver()).expect(200);

    const ext = await request(app).get(`/balance/${motorista.id}/ledger`).set(asAdmin()).expect(200);
    const v = await saldo();
    const rec = ext.body.data.reconciliation;

    expect(rec.accountBalance).toBeCloseTo(v.available + v.pendingWithdrawals, 2);
    const kinds = ext.body.data.entries.map((e: { kind: string }) => e.kind);
    expect(kinds.filter((k: string) => k === 'INVESTMENT')).toHaveLength(2);
    expect(kinds.filter((k: string) => k === 'REDEMPTION')).toHaveLength(1);
  });
});

describe('permissões', () => {
  const planoValido = { name: 'P', type: 'FLEXIBLE', annualRate: 2 };

  it('só o ADMIN cria planos', async () => {
    const gestor = await testDb.user.create({
      data: { name: 'G', email: 'g@teste.local', password: 'x', role: 'MANAGER' },
    });
    await request(app).post('/investments/plans').set(authHeader(gestor.id, UserRole.MANAGER))
      .send(planoValido).expect(403);
    await request(app).post('/investments/plans').set(asDriver()).send(planoValido).expect(403);
  });

  it('um motorista não vê nem resgata a aplicação de outro', async () => {
    const outro = await criaMotorista({ name: 'Outro' });
    const p = await flexivel();
    const r = await aplica(p.id, 100).expect(201);
    const id = r.body.data.investment.id;

    await request(app).get(`/investments/${id}`).set(asDriver(outro.id)).expect(403);
    await request(app).post(`/investments/${id}/withdraw`).set(asDriver(outro.id)).expect(403);

    const inv = await testDb.investment.findUniqueOrThrow({ where: { id } });
    expect(inv.status).toBe('ACTIVE');
  });

  it('o suporte vê a vista geral mas não aplica', async () => {
    const sup = await testDb.user.create({
      data: { name: 'S', email: 's@teste.local', password: 'x', role: 'SUPPORT' },
    });
    await request(app).get('/investments/overview').set(authHeader(sup.id, UserRole.SUPPORT)).expect(200);
    const p = await flexivel();
    await request(app).post('/investments').set(authHeader(sup.id, UserRole.SUPPORT))
      .send({ planId: p.id, amount: 1 }).expect(403);
  });

  it('não se apaga uma conta com aplicações ativas', async () => {
    const p = await flexivel();
    await aplica(p.id, 100).expect(201);
    const r = await request(app).delete(`/users/${motorista.id}`).set(asAdmin());
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('HAS_ACTIVE_INVESTMENTS');
  });
});
