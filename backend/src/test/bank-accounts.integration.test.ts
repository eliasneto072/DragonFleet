// src/test/bank-accounts.integration.test.ts
//
// Até três contas bancárias por motorista, e a retirada escolher uma.
//
// O teste que mais interessa aqui é o de mandar o dinheiro para a conta de
// outra pessoa: o identificador da conta vem do browser, e sem verificação do
// lado do servidor bastava trocar um valor no pedido para a transferência sair
// para fora. Os restantes protegem o teto de três e o congelamento do IBAN.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaMotorista, criaAdmin, criaFecho } from './factories';
import { UserRole } from '../shared/types/enums';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let motorista: Awaited<ReturnType<typeof criaMotorista>>;

const asAdmin = () => authHeader(admin.id, UserRole.ADMIN);
const asDriver = (id?: string) => authHeader(id ?? motorista.id, UserRole.DRIVER);

// IBANs portugueses válidos (o serviço confirma o resto 97 — um número
// inventado seria recusado antes de chegar à regra que se quer testar).
const IBAN_A = 'PT50003300004567890123437';
const IBAN_B = 'PT50001000004567890123438';
const IBAN_C = 'PT50000201231234567890154';

/** Cria uma conta já aprovada, sem passar pelo upload do comprovativo. */
async function contaAprovada(userId: string, iban: string, opts: {
  label?: string; isPrimary?: boolean;
} = {}) {
  return testDb.bankAccount.create({
    data: {
      userId,
      label: opts.label ?? 'Conta',
      isPrimary: opts.isPrimary ?? false,
      iban,
      holderName: 'Motorista de Teste',
      reviewedAt: new Date(),
    },
  });
}

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  motorista = await criaMotorista();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Lista de contas', () => {
  it('devolve as contas ativas, principal primeiro', async () => {
    await contaAprovada(motorista.id, IBAN_A, { label: 'Antiga' });
    await contaAprovada(motorista.id, IBAN_B, { label: 'Nova', isPrimary: true });

    const res = await request(app).get('/bank/me').set(asDriver()).expect(200);
    const contas = res.body.data.accounts;

    expect(contas).toHaveLength(2);
    expect(contas[0].label).toBe('Nova');
    expect(contas[0].isPrimary).toBe(true);
  });

  it('não mostra as arquivadas', async () => {
    await contaAprovada(motorista.id, IBAN_A, { isPrimary: true });
    const velha = await contaAprovada(motorista.id, IBAN_B);
    await testDb.bankAccount.update({
      where: { id: velha.id }, data: { archivedAt: new Date() },
    });

    const res = await request(app).get('/bank/me').set(asDriver()).expect(200);
    expect(res.body.data.accounts).toHaveLength(1);
  });

  it('um motorista não vê as contas de outro', async () => {
    const outro = await criaMotorista({ name: 'Outro' });
    await contaAprovada(outro.id, IBAN_A, { isPrimary: true });

    const res = await request(app).get(`/bank/${outro.id}`).set(asDriver());
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(IBAN_A);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Definir a principal', () => {
  it('só há uma principal de cada vez', async () => {
    const a = await contaAprovada(motorista.id, IBAN_A, { isPrimary: true });
    const b = await contaAprovada(motorista.id, IBAN_B);

    await request(app).patch(`/bank/accounts/${b.id}/primary`).set(asDriver()).expect(200);

    const contas = await testDb.bankAccount.findMany({ where: { userId: motorista.id } });
    expect(contas.filter((c) => c.isPrimary)).toHaveLength(1);
    expect(contas.find((c) => c.id === b.id)!.isPrimary).toBe(true);
    expect(contas.find((c) => c.id === a.id)!.isPrimary).toBe(false);
  });

  it('uma conta ainda não aprovada não pode ser a principal', async () => {
    await contaAprovada(motorista.id, IBAN_A, { isPrimary: true });
    const pendente = await testDb.bankAccount.create({
      data: {
        userId: motorista.id,
        label: 'Por aprovar',
        pendingIban: IBAN_B,
        pendingHolderName: 'Motorista de Teste',
        pendingAt: new Date(),
      },
    });

    const res = await request(app)
      .patch(`/bank/accounts/${pendente.id}/primary`).set(asDriver());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACCOUNT_NOT_APPROVED');
  });

  it('não deixa promover a conta de outra pessoa', async () => {
    const outro = await criaMotorista({ name: 'Outro' });
    const dele = await contaAprovada(outro.id, IBAN_A);

    await request(app).patch(`/bank/accounts/${dele.id}/primary`).set(asDriver()).expect(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Arquivar', () => {
  it('não deixa remover a única conta', async () => {
    const unica = await contaAprovada(motorista.id, IBAN_A, { isPrimary: true });

    const res = await request(app).delete(`/bank/accounts/${unica.id}`).set(asDriver());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LAST_BANK_ACCOUNT');
  });

  it('promove outra quando a principal é arquivada', async () => {
    const a = await contaAprovada(motorista.id, IBAN_A, { isPrimary: true });
    const b = await contaAprovada(motorista.id, IBAN_B);

    await request(app).delete(`/bank/accounts/${a.id}`).set(asDriver()).expect(200);

    const restante = await testDb.bankAccount.findUniqueOrThrow({ where: { id: b.id } });
    expect(restante.isPrimary).toBe(true);
  });

  it('não deixa remover uma conta com uma retirada por decidir', async () => {
    const a = await contaAprovada(motorista.id, IBAN_A, { isPrimary: true });
    await contaAprovada(motorista.id, IBAN_B);
    await testDb.withdrawal.create({
      data: {
        userId: motorista.id,
        amount: 50,
        bankAccountId: a.id,
        receiptUrl: 'https://exemplo.local/r.pdf',
        receiptKey: 'teste/r',
      },
    });

    const res = await request(app).delete(`/bank/accounts/${a.id}`).set(asDriver());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WITHDRAWAL_PENDING');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Aprovação por conta', () => {
  it('aprovar uma conta não aprova as outras', async () => {
    const primeira = await contaAprovada(motorista.id, IBAN_A, { isPrimary: true });
    const segunda = await testDb.bankAccount.create({
      data: {
        userId: motorista.id,
        label: 'Segunda',
        pendingIban: IBAN_B,
        pendingHolderName: 'Motorista de Teste',
        pendingAt: new Date(),
      },
    });
    const terceira = await testDb.bankAccount.create({
      data: {
        userId: motorista.id,
        label: 'Terceira',
        pendingIban: IBAN_C,
        pendingHolderName: 'Motorista de Teste',
        pendingAt: new Date(),
      },
    });

    await request(app).patch(`/bank/accounts/${segunda.id}/review`)
      .set(asAdmin()).send({ approve: true }).expect(200);

    const depois = await testDb.bankAccount.findMany({ where: { userId: motorista.id } });
    expect(depois.find((c) => c.id === segunda.id)!.iban).toBe(IBAN_B);
    expect(depois.find((c) => c.id === terceira.id)!.iban).toBeNull();
    expect(depois.find((c) => c.id === primeira.id)!.iban).toBe(IBAN_A);
  });

  it('recusar exige motivo e deixa o IBAN anterior intacto', async () => {
    const conta = await testDb.bankAccount.create({
      data: {
        userId: motorista.id,
        label: 'Conta',
        isPrimary: true,
        iban: IBAN_A,
        holderName: 'Motorista de Teste',
        pendingIban: IBAN_B,
        pendingHolderName: 'Motorista de Teste',
        pendingAt: new Date(),
      },
    });

    await request(app).patch(`/bank/accounts/${conta.id}/review`)
      .set(asAdmin()).send({ approve: false }).expect(400);

    await request(app).patch(`/bank/accounts/${conta.id}/review`)
      .set(asAdmin()).send({ approve: false, reason: 'Comprovativo ilegível' }).expect(200);

    const depois = await testDb.bankAccount.findUniqueOrThrow({ where: { id: conta.id } });
    expect(depois.iban).toBe(IBAN_A);
    expect(depois.pendingIban).toBeNull();
    expect(depois.rejectionReason).toBe('Comprovativo ilegível');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('A retirada escolhe a conta', () => {
  async function comSaldo() {
    await criaFecho({ userId: motorista.id, createdById: admin.id, uberAmount: 2000 });
  }

  it('sem escolha, usa a principal', async () => {
    await contaAprovada(motorista.id, IBAN_A);
    const principal = await contaAprovada(motorista.id, IBAN_B, { isPrimary: true });
    await comSaldo();

    const retirada = await testDb.withdrawal.create({
      data: {
        userId: motorista.id, amount: 100,
        receiptUrl: 'https://exemplo.local/r.pdf', receiptKey: 'teste/r',
      },
    });

    await request(app).patch(`/withdrawals/${retirada.id}/status`)
      .set(asAdmin()).send({ status: 'APPROVED' }).expect(200);

    const depois = await testDb.withdrawal.findUniqueOrThrow({ where: { id: retirada.id } });
    expect(depois.paidToIban).toBe(IBAN_B);
    expect(principal.iban).toBe(IBAN_B);
  });

  it('paga para a conta escolhida, e não para a principal', async () => {
    await contaAprovada(motorista.id, IBAN_A, { isPrimary: true, label: 'Principal' });
    const outra = await contaAprovada(motorista.id, IBAN_B, { label: 'Millennium' });
    await comSaldo();

    const retirada = await testDb.withdrawal.create({
      data: {
        userId: motorista.id, amount: 100, bankAccountId: outra.id,
        receiptUrl: 'https://exemplo.local/r.pdf', receiptKey: 'teste/r',
      },
    });

    await request(app).patch(`/withdrawals/${retirada.id}/status`)
      .set(asAdmin()).send({ status: 'APPROVED' }).expect(200);

    const depois = await testDb.withdrawal.findUniqueOrThrow({ where: { id: retirada.id } });
    expect(depois.paidToIban).toBe(IBAN_B);
  });

  it('NÃO paga para a conta de outra pessoa', async () => {
    // O teste mais importante deste ficheiro. O identificador da conta vem do
    // browser; sem verificação do lado do servidor, trocar este valor mandava
    // a transferência para fora.
    await contaAprovada(motorista.id, IBAN_A, { isPrimary: true });
    const outro = await criaMotorista({ name: 'Outro' });
    const contaDoOutro = await contaAprovada(outro.id, IBAN_B, { isPrimary: true });
    await comSaldo();

    const retirada = await testDb.withdrawal.create({
      data: {
        userId: motorista.id, amount: 100, bankAccountId: contaDoOutro.id,
        receiptUrl: 'https://exemplo.local/r.pdf', receiptKey: 'teste/r',
      },
    });

    await request(app).patch(`/withdrawals/${retirada.id}/status`)
      .set(asAdmin()).send({ status: 'APPROVED' }).expect(200);

    const depois = await testDb.withdrawal.findUniqueOrThrow({ where: { id: retirada.id } });
    // Caiu na principal DELE, não no IBAN do outro.
    expect(depois.paidToIban).toBe(IBAN_A);
    expect(depois.paidToIban).not.toBe(IBAN_B);
  });

  it('o IBAN continua a congelar na aprovação', async () => {
    const conta = await contaAprovada(motorista.id, IBAN_A, { isPrimary: true });
    await comSaldo();

    const retirada = await testDb.withdrawal.create({
      data: {
        userId: motorista.id, amount: 100, bankAccountId: conta.id,
        receiptUrl: 'https://exemplo.local/r.pdf', receiptKey: 'teste/r',
      },
    });

    await request(app).patch(`/withdrawals/${retirada.id}/status`)
      .set(asAdmin()).send({ status: 'APPROVED' }).expect(200);

    await testDb.bankAccount.update({
      where: { id: conta.id }, data: { iban: IBAN_C },
    });

    const depois = await testDb.withdrawal.findUniqueOrThrow({ where: { id: retirada.id } });
    expect(depois.paidToIban).toBe(IBAN_A);
  });
});
