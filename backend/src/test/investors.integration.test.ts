// src/test/investors.integration.test.ts
//
// O portal do investidor, de ponta a ponta: criar a conta, depositar, render,
// resgatar — e, sobretudo, o muro entre uma conta de investidor e a frota.
//
// O teste mais importante deste ficheiro é o do isolamento. Se alguém um dia
// registar uma rota nova acima da linha do `denyInvestor` no routes.ts, é aqui
// que isso se descobre — e não quando um investidor vir a lista de motoristas.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaAdmin, criaMotorista } from './factories';
import { UserRole } from '../shared/types/enums';
import { investorsService } from '../modules/investors/investors.service';
import { dayToDate, addDays, lisbonDay } from '../modules/investors/investors.math';

let admin: Awaited<ReturnType<typeof criaAdmin>>;

const asAdmin = () => authHeader(admin.id, UserRole.ADMIN);
const asInvestor = (id: string) => authHeader(id, UserRole.INVESTOR);

/** Cria um investidor pela API e devolve os ids. */
// Sem `async` de propósito: uma função async envolve o objeto do supertest
// numa Promise normal e perde o `.expect()` encadeado.
function criaInvestidor(body: Record<string, unknown> = {}) {
  return request(app).post('/investors/accounts').set(asAdmin()).send({
    name: 'Investidor de Teste',
    email: `investidor-${Math.random().toString(36).slice(2, 10)}@teste.local`,
    password: 'palavra-passe-segura',
    annualRate: 5,
    ...body,
  });
}

async function investidorComDeposito(valor: number, opts: {
  startDate?: string; annualRate?: number; noticeDays?: number;
} = {}) {
  const criado = await criaInvestidor(opts).expect(201);
  const { userId, accountId } = criado.body.data;

  await request(app).post(`/investors/accounts/${accountId}/deposits`).set(asAdmin())
    .send({ amount: valor, day: opts.startDate }).expect(201);

  return { userId, accountId };
}

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Isolamento — um investidor não vê a frota', () => {
  it('leva 403 em todas as rotas da frota, com token válido', async () => {
    const { userId } = await investidorComDeposito(1000);
    const h = asInvestor(userId);

    const rotas = [
      '/users', '/vehicles', '/earnings', '/withdrawals', '/documents',
      '/notifications', '/analytics/overview', '/settlements', '/balance',
      '/investments/plans', '/ranks/configs', '/support', '/companies', '/bank',
    ];

    for (const rota of rotas) {
      const res = await request(app).get(rota).set(h);
      expect(
        res.status,
        `A rota ${rota} respondeu ${res.status} a um investidor — devia ser 403.`,
      ).toBe(403);
      expect(res.body.code).toBe('INVESTOR_SCOPE');
    }
  });

  it('também é recusado a escrever na frota', async () => {
    const { userId } = await investidorComDeposito(1000);
    const res = await request(app).post('/withdrawals').set(asInvestor(userId))
      .send({ amount: 100 });
    expect(res.status).toBe(403);
  });

  it('mas entra no seu próprio portal', async () => {
    const { userId } = await investidorComDeposito(1000);
    const res = await request(app).get('/investors/me').set(asInvestor(userId)).expect(200);
    expect(res.body.data.balance.capital).toBe(1000);
  });

  it('não vê a conta de outro investidor', async () => {
    const a = await investidorComDeposito(1000);
    const b = await investidorComDeposito(5000);

    const res = await request(app)
      .get(`/investors/statement?accountId=${b.accountId}`)
      .set(asInvestor(a.userId));
    expect(res.status).toBe(404);
  });

  it('não vê a lista de contas nem os totais da empresa', async () => {
    const { userId } = await investidorComDeposito(1000);
    await request(app).get('/investors/accounts').set(asInvestor(userId)).expect(403);
    await request(app).get('/investors/overview').set(asInvestor(userId)).expect(403);
  });

  it('um motorista não entra no portal do investidor', async () => {
    const motorista = await criaMotorista();
    const res = await request(app).get('/investors/me')
      .set(authHeader(motorista.id, UserRole.DRIVER));
    // Não tem conta de investidor: 404, e não uma conta vazia.
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Criar contas', () => {
  it('cria o utilizador com o papel INVESTOR e a taxa inicial', async () => {
    const res = await criaInvestidor({ annualRate: 7.5, noticeDays: 30 }).expect(201);
    const { userId, accountId } = res.body.data;

    const user = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.role).toBe('INVESTOR');

    const taxas = await testDb.investorRate.findMany({ where: { accountId } });
    expect(taxas).toHaveLength(1);
    expect(Number(taxas[0].annualRate)).toBe(7.5);

    const conta = await testDb.investorAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(conta.noticeDays).toBe(30);
  });

  it('recusa email repetido', async () => {
    const email = 'repetido@teste.local';
    await criaInvestidor({ email }).expect(201);
    await criaInvestidor({ email }).expect(409);
  });

  it('só a administração cria contas', async () => {
    const motorista = await criaMotorista();
    await request(app).post('/investors/accounts')
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .send({ name: 'X', email: 'x@y.pt', password: '12345678', annualRate: 5 })
      .expect(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Depósitos e saldo', () => {
  it('o depósito entra no capital e não no rendimento', async () => {
    const { accountId } = await investidorComDeposito(10000);
    const res = await request(app).get(`/investors/accounts/${accountId}`)
      .set(asAdmin()).expect(200);

    expect(res.body.data.balance.capital).toBe(10000);
    expect(res.body.data.balance.earnings).toBe(0);
    expect(res.body.data.balance.total).toBe(10000);
    expect(res.body.data.balance.deposited).toBe(10000);
  });

  it('vários depósitos somam', async () => {
    const { accountId } = await investidorComDeposito(1000);
    await request(app).post(`/investors/accounts/${accountId}/deposits`).set(asAdmin())
      .send({ amount: 2500 }).expect(201);

    const res = await request(app).get(`/investors/accounts/${accountId}`).set(asAdmin());
    expect(res.body.data.balance.capital).toBe(3500);
  });

  it('recusa valores não positivos', async () => {
    const { accountId } = await investidorComDeposito(1000);
    await request(app).post(`/investors/accounts/${accountId}/deposits`).set(asAdmin())
      .send({ amount: 0 }).expect(400);
    await request(app).post(`/investors/accounts/${accountId}/deposits`).set(asAdmin())
      .send({ amount: -50 }).expect(400);
  });

  it('o investidor não regista depósitos a si próprio', async () => {
    const { userId, accountId } = await investidorComDeposito(1000);
    await request(app).post(`/investors/accounts/${accountId}/deposits`)
      .set(asInvestor(userId)).send({ amount: 999999 }).expect(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Juro diário', () => {
  /** Recua o início da conta e limpa o que já foi pago, para haver dias. */
  async function comecouHa(accountId: string, dias: number) {
    const inicio = addDays(lisbonDay(), -dias);
    await testDb.investorAccount.update({
      where: { id: accountId },
      data: { startDate: dayToDate(inicio), accruedThrough: null },
    });
    await testDb.investorMovement.updateMany({
      where: { accountId, kind: 'DEPOSIT' },
      data: { day: dayToDate(inicio) },
    });
    await testDb.investorRate.updateMany({
      where: { accountId },
      data: { effectiveFrom: dayToDate(inicio) },
    });
    await testDb.investorMovement.deleteMany({ where: { accountId, kind: 'ACCRUAL' } });
    return inicio;
  }

  it('paga um dia por cada dia decorrido, até ontem', async () => {
    const { accountId } = await investidorComDeposito(10000, { annualRate: 5 });
    await comecouHa(accountId, 10);

    await investorsService.catchUp(accountId);

    const linhas = await testDb.investorMovement.findMany({
      where: { accountId, kind: 'ACCRUAL' }, orderBy: { day: 'asc' },
    });
    // Dez dias decorridos: rende do primeiro (inclusive) até ontem.
    expect(linhas).toHaveLength(10);
    // 10 000 × 5% ÷ 365 = 1,369863 por dia
    expect(Number(linhas[0].amount)).toBeCloseTo(1.369863, 5);
  });

  it('correr duas vezes não paga a dobrar', async () => {
    const { accountId } = await investidorComDeposito(10000);
    await comecouHa(accountId, 5);

    await investorsService.catchUp(accountId);
    const depois = await investorsService.catchUp(accountId);

    expect(depois).toBe(0);
    const linhas = await testDb.investorMovement.count({ where: { accountId, kind: 'ACCRUAL' } });
    expect(linhas).toBe(5);
  });

  it('o rendimento vai para o bolso do rendimento, não para o capital', async () => {
    const { accountId } = await investidorComDeposito(10000);
    await comecouHa(accountId, 30);
    await investorsService.catchUp(accountId);

    const res = await request(app).get(`/investors/accounts/${accountId}`).set(asAdmin());
    expect(res.body.data.balance.capital).toBe(10000);
    expect(res.body.data.balance.earnings).toBeGreaterThan(0);
    // 30 dias a 5% sobre 10 000 € ≈ 41,10 €
    expect(res.body.data.balance.earnings).toBeCloseTo(41.1, 1);
  });

  it('uma conta fechada não rende', async () => {
    const { accountId } = await investidorComDeposito(10000);
    await comecouHa(accountId, 10);
    await testDb.investorAccount.update({ where: { id: accountId }, data: { status: 'CLOSED' } });

    await investorsService.catchUp(accountId);
    const linhas = await testDb.investorMovement.count({ where: { accountId, kind: 'ACCRUAL' } });
    expect(linhas).toBe(0);
  });

  it('abrir o portal paga os dias em falta sem esperar pelo job', async () => {
    const { userId, accountId } = await investidorComDeposito(10000);
    await comecouHa(accountId, 7);

    const res = await request(app).get('/investors/me').set(asInvestor(userId)).expect(200);
    expect(res.body.data.balance.earnings).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Taxas', () => {
  it('a taxa nova vale a partir da data, sem mexer no passado', async () => {
    const { accountId } = await investidorComDeposito(10000, { annualRate: 5 });
    const amanha = addDays(lisbonDay(), 1);

    await request(app).post(`/investors/accounts/${accountId}/rates`).set(asAdmin())
      .send({ annualRate: 10, effectiveFrom: amanha }).expect(200);

    const taxas = await testDb.investorRate.findMany({
      where: { accountId }, orderBy: { effectiveFrom: 'asc' },
    });
    expect(taxas).toHaveLength(2);
    expect(Number(taxas[0].annualRate)).toBe(5);
    expect(Number(taxas[1].annualRate)).toBe(10);
  });

  it('recusa mudar a taxa de dias já pagos', async () => {
    const { accountId } = await investidorComDeposito(10000);
    await testDb.investorAccount.update({
      where: { id: accountId },
      data: { accruedThrough: dayToDate(lisbonDay()) },
    });

    const res = await request(app).post(`/investors/accounts/${accountId}/rates`).set(asAdmin())
      .send({ annualRate: 10, effectiveFrom: addDays(lisbonDay(), -5) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RATE_IN_THE_PAST');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Resgates', () => {
  async function comRendimento(valor = 10000, dias = 30) {
    const { userId, accountId } = await investidorComDeposito(valor);
    const inicio = addDays(lisbonDay(), -dias);
    await testDb.investorAccount.update({
      where: { id: accountId },
      data: { startDate: dayToDate(inicio), accruedThrough: null },
    });
    await testDb.investorMovement.updateMany({
      where: { accountId, kind: 'DEPOSIT' }, data: { day: dayToDate(inicio) },
    });
    await testDb.investorRate.updateMany({
      where: { accountId }, data: { effectiveFrom: dayToDate(inicio) },
    });
    await investorsService.catchUp(accountId);
    return { userId, accountId };
  }

  it('o pedido reserva o dinheiro mas ainda não o tira', async () => {
    const { userId } = await comRendimento();

    await request(app).post('/investors/withdrawals').set(asInvestor(userId))
      .send({ bucket: 'CAPITAL', amount: 4000 }).expect(201);

    const res = await request(app).get('/investors/me').set(asInvestor(userId));
    expect(res.body.data.balance.capital).toBe(10000);          // ainda lá está
    expect(res.body.data.balance.pendingCapital).toBe(4000);
    expect(res.body.data.balance.availableCapital).toBe(6000);  // mas já não é dele
  });

  it('não deixa pedir duas vezes o mesmo dinheiro', async () => {
    const { userId } = await comRendimento();

    await request(app).post('/investors/withdrawals').set(asInvestor(userId))
      .send({ bucket: 'CAPITAL', amount: 10000 }).expect(201);

    const segundo = await request(app).post('/investors/withdrawals').set(asInvestor(userId))
      .send({ bucket: 'CAPITAL', amount: 100 });
    expect(segundo.status).toBe(409);
    expect(segundo.body.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('pagar cria o movimento negativo e baixa o saldo', async () => {
    const { userId, accountId } = await comRendimento();

    const pedido = await request(app).post('/investors/withdrawals').set(asInvestor(userId))
      .send({ bucket: 'CAPITAL', amount: 2500 }).expect(201);

    await request(app).patch(`/investors/withdrawals/${pedido.body.data.withdrawal.id}/decide`)
      .set(asAdmin()).send({ approve: true }).expect(200);

    const res = await request(app).get(`/investors/accounts/${accountId}`).set(asAdmin());
    expect(res.body.data.balance.capital).toBe(7500);
    expect(res.body.data.balance.pendingCapital).toBe(0);
    expect(res.body.data.balance.withdrawn).toBe(2500);
  });

  it('recusar devolve o dinheiro ao disponível sem mexer no saldo', async () => {
    const { userId, accountId } = await comRendimento();

    const pedido = await request(app).post('/investors/withdrawals').set(asInvestor(userId))
      .send({ bucket: 'CAPITAL', amount: 2500 }).expect(201);

    await request(app).patch(`/investors/withdrawals/${pedido.body.data.withdrawal.id}/decide`)
      .set(asAdmin()).send({ approve: false, decision: 'Fora de prazo' }).expect(200);

    const res = await request(app).get(`/investors/accounts/${accountId}`).set(asAdmin());
    expect(res.body.data.balance.capital).toBe(10000);
    expect(res.body.data.balance.availableCapital).toBe(10000);
  });

  it('o rendimento sai sem tocar no capital', async () => {
    const { userId, accountId } = await comRendimento();
    const antes = await request(app).get('/investors/me').set(asInvestor(userId));
    const rendimento = antes.body.data.balance.earnings;
    expect(rendimento).toBeGreaterThan(1);

    const pedido = await request(app).post('/investors/withdrawals').set(asInvestor(userId))
      .send({ bucket: 'EARNINGS', amount: 1 }).expect(201);
    await request(app).patch(`/investors/withdrawals/${pedido.body.data.withdrawal.id}/decide`)
      .set(asAdmin()).send({ approve: true }).expect(200);

    const res = await request(app).get(`/investors/accounts/${accountId}`).set(asAdmin());
    expect(res.body.data.balance.capital).toBe(10000);
    expect(res.body.data.balance.earnings).toBeCloseTo(rendimento - 1, 2);
  });

  it('o aviso prévio adia a data de pagamento do capital', async () => {
    const { userId } = await investidorComDeposito(10000, { noticeDays: 30 });

    const capital = await request(app).post('/investors/withdrawals').set(asInvestor(userId))
      .send({ bucket: 'CAPITAL', amount: 100 }).expect(201);
    expect(capital.body.data.withdrawal.availableOn).toBe(addDays(lisbonDay(), 30));
  });

  it('o próprio pode desistir de um pedido por decidir', async () => {
    const { userId } = await comRendimento();
    const pedido = await request(app).post('/investors/withdrawals').set(asInvestor(userId))
      .send({ bucket: 'CAPITAL', amount: 2500 }).expect(201);

    await request(app).delete(`/investors/withdrawals/${pedido.body.data.withdrawal.id}`)
      .set(asInvestor(userId)).expect(200);

    const res = await request(app).get('/investors/me').set(asInvestor(userId));
    expect(res.body.data.balance.availableCapital).toBe(10000);
  });

  it('um pedido já decidido não se decide outra vez', async () => {
    const { userId } = await comRendimento();
    const pedido = await request(app).post('/investors/withdrawals').set(asInvestor(userId))
      .send({ bucket: 'CAPITAL', amount: 100 }).expect(201);
    const id = pedido.body.data.withdrawal.id;

    await request(app).patch(`/investors/withdrawals/${id}/decide`).set(asAdmin())
      .send({ approve: true }).expect(200);
    await request(app).patch(`/investors/withdrawals/${id}/decide`).set(asAdmin())
      .send({ approve: false }).expect(409);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Acertos manuais', () => {
  it('exigem motivo escrito', async () => {
    const { accountId } = await investidorComDeposito(1000);
    await request(app).post(`/investors/accounts/${accountId}/adjustments`).set(asAdmin())
      .send({ bucket: 'CAPITAL', amount: 50 }).expect(400);
  });

  it('não deixam o bolso negativo', async () => {
    const { accountId } = await investidorComDeposito(1000);
    const res = await request(app).post(`/investors/accounts/${accountId}/adjustments`)
      .set(asAdmin()).send({ bucket: 'CAPITAL', amount: -2000, description: 'Erro de registo' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WOULD_GO_NEGATIVE');
  });

  it('corrigem para cima e para baixo', async () => {
    const { accountId } = await investidorComDeposito(1000);
    await request(app).post(`/investors/accounts/${accountId}/adjustments`).set(asAdmin())
      .send({ bucket: 'CAPITAL', amount: -100, description: 'Depósito registado a mais' })
      .expect(201);

    const res = await request(app).get(`/investors/accounts/${accountId}`).set(asAdmin());
    expect(res.body.data.balance.capital).toBe(900);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Totais da empresa', () => {
  it('somam o que se deve a investidores e a motoristas', async () => {
    await investidorComDeposito(10000);
    await investidorComDeposito(5000);

    const res = await request(app).get('/investors/overview').set(asAdmin()).expect(200);
    expect(res.body.data.investors.accounts).toBe(2);
    expect(res.body.data.investors.capital).toBe(15000);
    expect(res.body.data.totalLiability).toBeGreaterThanOrEqual(15000);
  });

  it('não deixam fechar uma conta com dinheiro lá dentro', async () => {
    const { accountId } = await investidorComDeposito(1000);
    const res = await request(app).patch(`/investors/accounts/${accountId}`).set(asAdmin())
      .send({ status: 'CLOSED' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACCOUNT_NOT_EMPTY');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Destaques e filtros', () => {
  it('os destaques respondem a quem está há mais tempo e quem tem mais', async () => {
    const antigo = await investidorComDeposito(5000, { startDate: '2024-01-15' });
    const rico = await investidorComDeposito(50000);

    const res = await request(app).get('/investors/stats').set(asAdmin()).expect(200);
    const d = res.body.data;

    expect(d.oldest.since).toBe('2024-01-15');
    expect(d.topCapital.capital).toBe(50000);
    expect(antigo.accountId).toBeTruthy();
    expect(rico.accountId).toBeTruthy();
  });

  it('a pesquisa encontra por nome e por email', async () => {
    await request(app).post('/investors/accounts').set(asAdmin()).send({
      name: 'Maria Investidora', email: 'maria@teste.local',
      password: 'palavra-passe-segura', annualRate: 5,
    }).expect(201);
    await investidorComDeposito(1000);

    const porNome = await request(app).get('/investors/accounts?search=maria')
      .set(asAdmin()).expect(200);
    expect(porNome.body.data.accounts).toHaveLength(1);
    expect(porNome.body.data.accounts[0].userName).toBe('Maria Investidora');

    const porEmail = await request(app).get('/investors/accounts?search=maria@teste')
      .set(asAdmin()).expect(200);
    expect(porEmail.body.data.accounts).toHaveLength(1);
  });

  it('a ordenação muda mesmo a ordem', async () => {
    await investidorComDeposito(1000);
    await investidorComDeposito(9000);

    const porCapital = await request(app).get('/investors/accounts?sort=capital')
      .set(asAdmin()).expect(200);
    expect(porCapital.body.data.accounts[0].capital).toBe(9000);
  });

  it('um investidor não vê os destaques dos outros', async () => {
    const { userId } = await investidorComDeposito(1000);
    await request(app).get('/investors/stats').set(asInvestor(userId)).expect(403);
  });
});
