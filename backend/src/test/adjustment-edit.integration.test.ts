// src/test/adjustment-edit.integration.test.ts
//
// Corrigir a data de um ajuste de saldo pelo painel.
//
// ─── O CASO REAL ────────────────────────────────────────────────────────────
//
// O saldo de abertura de um motorista é lançado no dia em que alguém se
// lembra, quase sempre DEPOIS dos primeiros fechos já registados. Fica a meio
// do extrato, e as linhas anteriores mostram um saldo corrido que nunca
// existiu. O total está certo — a ordem é que não.
//
// ─── O QUE ESTES TESTES PROTEGEM ────────────────────────────────────────────
//
// Um: que corrigir a data NÃO mexe um cêntimo no saldo. É a promessa toda
// desta funcionalidade, e se ela se partir o sintoma é dinheiro a mudar
// sozinho.
//
// Dois: que o valor e o tipo não se conseguem editar por aqui, nem enviando-os
// à mão no corpo do pedido. Um valor editável mudaria o saldo sem deixar
// rasto.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaMotorista, criaAdmin } from './factories';
import { UserRole, SettlementStatus, AdjustmentType } from '../shared/types/enums';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let motorista: Awaited<ReturnType<typeof criaMotorista>>;

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const asAdmin = () => authHeader(admin.id, UserRole.ADMIN);

async function criaFecho(weekStart: string, netToDriver: number) {
  return testDb.weeklySettlement.create({
    data: {
      userId: motorista.id,
      createdById: admin.id,
      weekStart: dia(weekStart),
      weekEnd: dia(weekStart),
      grossRevenue: netToDriver + 100,
      commissionRate: 15,
      commissionAmount: 50,
      totalDeductions: 50,
      profitBase: netToDriver,
      netToDriver,
      status: SettlementStatus.REGISTERED,
    },
  });
}

async function criaAjuste(amount: number, createdAt: string, reason = 'Saldo inicial em banca') {
  return testDb.balanceAdjustment.create({
    data: {
      userId: motorista.id,
      amount,
      type: AdjustmentType.CREDIT,
      reason,
      createdBy: admin.id,
      createdAt: dia(createdAt),
    },
  });
}

const extrato = () => request(app)
  .get(`/balance/${motorista.id}/ledger`)
  .set(asAdmin());

const editar = (id: string, body: Record<string, unknown>) =>
  request(app).patch(`/balance/adjustments/${id}`).set(asAdmin()).send(body);

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  motorista = await criaMotorista();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('O saldo de abertura vai para o princípio', () => {
  it('muda a ordem e NÃO muda o saldo', async () => {
    await criaFecho('2026-09-01', 300);
    await criaFecho('2026-09-08', 341.67);
    const abertura = await criaAjuste(3693.10, '2026-09-13');

    const antes = await extrato().expect(200);
    const saldoAntes = antes.body.data.reconciliation.accountBalance;

    // Estava em terceiro.
    expect(antes.body.data.entries[2].id).toBe(`a:${abertura.id}`);

    await editar(abertura.id, { createdAt: '2026-08-31T09:00:00.000Z' }).expect(200);

    const depois = await extrato().expect(200);

    // Passou a primeiro...
    expect(depois.body.data.entries[0].id).toBe(`a:${abertura.id}`);
    // ...e o saldo final é exatamente o mesmo.
    expect(depois.body.data.reconciliation.accountBalance).toBe(saldoAntes);
  });

  it('os saldos corridos passam a fazer sentido', async () => {
    await criaFecho('2026-09-01', 300);
    const abertura = await criaAjuste(1000, '2026-09-13');

    await editar(abertura.id, { createdAt: '2026-08-31T09:00:00.000Z' }).expect(200);

    const { body } = await extrato().expect(200);
    const [primeiro, segundo] = body.data.entries;

    // A abertura abre em 1000, e o fecho soma-lhe por cima.
    expect(primeiro.balance).toBe(1000);
    expect(segundo.balance).toBe(1300);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('O que não se edita por aqui', () => {
  it('o valor enviado no corpo é ignorado', async () => {
    const a = await criaAjuste(100, '2026-09-10');

    await editar(a.id, { createdAt: '2026-09-01T09:00:00.000Z', amount: 999999 }).expect(200);

    const depois = await testDb.balanceAdjustment.findUnique({ where: { id: a.id } });
    expect(Number(depois!.amount)).toBe(100);
  });

  it('o tipo enviado no corpo é ignorado', async () => {
    const a = await criaAjuste(100, '2026-09-10');

    await editar(a.id, { createdAt: '2026-09-01T09:00:00.000Z', type: 'DEBIT' }).expect(200);

    const depois = await testDb.balanceAdjustment.findUnique({ where: { id: a.id } });
    expect(depois!.type).toBe('CREDIT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('As recusas', () => {
  it('recusa uma data no futuro', async () => {
    const a = await criaAjuste(100, '2026-09-10');
    const daquiAUmAno = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const res = await editar(a.id, { createdAt: daquiAUmAno });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DATE_IN_FUTURE');
  });

  it('recusa um ano mal escrito', async () => {
    const a = await criaAjuste(100, '2026-09-10');
    const res = await editar(a.id, { createdAt: '2016-09-01T00:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('DATE_TOO_OLD');
  });

  it('recusa um pedido que não altera nada', async () => {
    const a = await criaAjuste(100, '2026-09-10');
    const res = await editar(a.id, {});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('404 num ajuste que não existe', async () => {
    const res = await editar('nao-existe', { createdAt: '2026-09-01T09:00:00.000Z' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ADJUSTMENT_NOT_FOUND');
  });

  it('o motorista não edita os ajustes dele', async () => {
    const a = await criaAjuste(100, '2026-09-10');
    const res = await request(app)
      .patch(`/balance/adjustments/${a.id}`)
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .send({ createdAt: '2026-09-01T09:00:00.000Z' });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('O rasto', () => {
  it('fica quem editou e quando', async () => {
    const a = await criaAjuste(100, '2026-09-10');
    expect(a.editedAt).toBeNull();

    await editar(a.id, { createdAt: '2026-09-01T09:00:00.000Z' }).expect(200);

    const depois = await testDb.balanceAdjustment.findUnique({ where: { id: a.id } });
    expect(depois!.editedAt).not.toBeNull();
    expect(depois!.editedBy).toBe(admin.id);
  });

  it('o motivo também se corrige, e conta como edição', async () => {
    const a = await criaAjuste(100, '2026-09-10', 'motivo errado');

    const res = await editar(a.id, { reason: 'Saldo inicial em banca' }).expect(200);
    expect(res.body.data.adjustment.reason).toBe('Saldo inicial em banca');

    const depois = await testDb.balanceAdjustment.findUnique({ where: { id: a.id } });
    expect(depois!.editedAt).not.toBeNull();
  });
});
