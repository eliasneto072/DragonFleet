// src/test/projects.integration.test.ts
//
// Projetos de investimento, do princípio ao fim: angariar, apurar o lucro dos
// fechos do carro, distribuir todos os meses, liquidar na venda.
//
// Os dois testes que mais interessam:
//
//   • "as distribuições NÃO abatem o capital" — é a regra que toda a gente
//     assume ao contrário, e se ela partir o investidor deixa de receber
//     quando devia continuar a receber;
//   • "a soma das partes é o valor apurado" — se a repartição perder um
//     cêntimo por mês, ao fim de anos as contas não fecham e ninguém sabe
//     porquê.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaAdmin, criaMotorista, criaFecho, criaVeiculo } from './factories';
import { UserRole } from '../shared/types/enums';
import { monthStart } from '../modules/projects/projects.math';

let admin: Awaited<ReturnType<typeof criaAdmin>>;

const asAdmin = () => authHeader(admin.id, UserRole.ADMIN);
const asInvestor = (id: string) => authHeader(id, UserRole.INVESTOR);

/** Cria um investidor com capital já depositado e disponível. */
async function investidorCom(capital: number) {
  const criado = await request(app).post('/investors/accounts').set(asAdmin()).send({
    name: 'Investidor',
    email: `inv-${Math.random().toString(36).slice(2, 10)}@teste.local`,
    password: 'palavra-passe-segura',
    annualRate: 0, // sem juro, para os números dos projetos ficarem limpos
  }).expect(201);

  const { userId, accountId } = criado.body.data;
  await request(app).post(`/investors/accounts/${accountId}/deposits`).set(asAdmin())
    .send({ amount: capital }).expect(201);

  return { userId, accountId };
}

/** Cria um projeto já aberto a subscrições, com carro. */
async function projetoAberto(opts: {
  target?: number; profitShare?: number; minTicket?: number;
} = {}) {
  const veiculo = await criaVeiculo({ plate: `AA-${Math.floor(Math.random() * 90 + 10)}-BB` });

  const res = await request(app).post('/investors/projects').set(asAdmin()).send({
    name: 'Peugeot 308 nº 4',
    targetAmount: opts.target ?? 20000,
    profitShare: opts.profitShare ?? 50,
    minTicket: opts.minTicket ?? 0,
    vehicleId: veiculo.id,
  }).expect(201);

  const projeto = res.body.data.project;
  await request(app).post(`/investors/projects/${projeto.id}/open`).set(asAdmin()).expect(200);
  return { projeto, veiculo };
}

/** Saldo de uma conta de investidor, lido da view. */
async function saldo(accountId: string) {
  const [row] = await testDb.$queryRawUnsafe<{
    capital: number; earnings: number; available_capital: number; invested_in_projects: number;
  }[]>(`
    SELECT CAST(capital AS FLOAT) AS capital,
           CAST(earnings AS FLOAT) AS earnings,
           CAST(available_capital AS FLOAT) AS available_capital,
           CAST(invested_in_projects AS FLOAT) AS invested_in_projects
    FROM investor_balances WHERE account_id = '${accountId}'`);
  return row;
}

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Angariação', () => {
  it('a subscrição tranca o capital sem o tirar da conta', async () => {
    const inv = await investidorCom(15000);
    const { projeto } = await projetoAberto();

    await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 10000 }).expect(201);

    const s = await saldo(inv.accountId);
    expect(s.capital).toBe(15000);              // continua a ser devido
    expect(s.invested_in_projects).toBe(10000); // mas trancado
    expect(s.available_capital).toBe(5000);     // e fora do disponível
  });

  it('não deixa subscrever mais do que o disponível', async () => {
    const inv = await investidorCom(5000);
    const { projeto } = await projetoAberto();

    const res = await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 8000 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT');
  });

  it('não deixa subscrever o mesmo dinheiro duas vezes', async () => {
    const inv = await investidorCom(10000);
    const a = await projetoAberto();
    const b = await projetoAberto();

    await request(app).post(`/investors/projects/${a.projeto.id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 10000 }).expect(201);

    const res = await request(app).post(`/investors/projects/${b.projeto.id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 1000 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT');
  });

  it('não deixa ultrapassar a meta, e diz quanto falta', async () => {
    const a = await investidorCom(20000);
    const b = await investidorCom(20000);
    const { projeto } = await projetoAberto({ target: 20000 });

    await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(a.userId)).send({ amount: 15000 }).expect(201);

    const res = await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(b.userId)).send({ amount: 8000 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EXCEEDS_TARGET');
    expect(res.body.message).toContain('5');
  });

  it('respeita o mínimo por participação', async () => {
    const inv = await investidorCom(10000);
    const { projeto } = await projetoAberto({ minTicket: 1000 });

    const res = await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 500 });
    expect(res.body.code).toBe('BELOW_MIN');
  });

  it('um projeto em rascunho não aceita subscrições nem aparece ao investidor', async () => {
    const inv = await investidorCom(10000);
    const res = await request(app).post('/investors/projects').set(asAdmin()).send({
      name: 'Rascunho', targetAmount: 10000,
    }).expect(201);
    const id = res.body.data.project.id;

    const sub = await request(app).post(`/investors/projects/${id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 1000 });
    expect(sub.status).toBe(409);
    expect(sub.body.code).toBe('NOT_FUNDING');

    const lista = await request(app).get('/investors/projects')
      .set(asInvestor(inv.userId)).expect(200);
    expect(lista.body.data.projects.map((p: { id: string }) => p.id)).not.toContain(id);
  });

  it('cancelar liberta o capital', async () => {
    const inv = await investidorCom(10000);
    const { projeto } = await projetoAberto();
    await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 10000 }).expect(201);

    await request(app).post(`/investors/projects/${projeto.id}/cancel`)
      .set(asAdmin()).send({ reason: 'Carro já não está à venda' }).expect(200);

    const s = await saldo(inv.accountId);
    expect(s.invested_in_projects).toBe(0);
    expect(s.available_capital).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Arranque', () => {
  it('não arranca sem carro escolhido', async () => {
    const inv = await investidorCom(10000);
    const criado = await request(app).post('/investors/projects').set(asAdmin())
      .send({ name: 'Sem carro', targetAmount: 10000 }).expect(201);
    const id = criado.body.data.project.id;

    await request(app).post(`/investors/projects/${id}/open`).set(asAdmin()).expect(200);
    await request(app).post(`/investors/projects/${id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 10000 }).expect(201);

    const res = await request(app).post(`/investors/projects/${id}/activate`)
      .set(asAdmin()).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('VEHICLE_REQUIRED');
  });

  it('não arranca sem subscrições', async () => {
    const { projeto } = await projetoAberto();
    const res = await request(app).post(`/investors/projects/${projeto.id}/activate`)
      .set(asAdmin()).send({});
    expect(res.body.code).toBe('NO_SHARES');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Apuramento do lucro', () => {
  /** Um projeto a render, com um carro e um motorista. */
  async function aRender(opts: { profitShare?: number } = {}) {
    const inv = await investidorCom(20000);
    const { projeto, veiculo } = await projetoAberto({ profitShare: opts.profitShare });
    await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 20000 }).expect(201);
    await request(app).post(`/investors/projects/${projeto.id}/activate`)
      .set(asAdmin()).send({ startedOn: '2026-03' }).expect(200);

    const motorista = await criaMotorista();
    return { inv, projeto, veiculo, motorista };
  }

  it('soma a comissão e o aluguer dos fechos registados desse mês', async () => {
    const { projeto, veiculo, motorista } = await aRender();

    // Duas semanas de março, com comissão e aluguer.
    //
    // O `commissionRate` tem de ir explícito: a fábrica usa 0% por omissão, e
    // sem ele os fechos saíam com comissão zero. O código somava corretamente
    // zero mais zero e o teste falhava no `commissionTotal > 0` — parecia um
    // erro do apuramento e era um erro da preparação.
    await criaFecho({
      userId: motorista.id, createdById: admin.id, vehicleId: veiculo.id,
      weekStart: new Date('2026-03-02T00:00:00Z'), uberAmount: 1000, vehicleFee: 200,
      commissionRate: 15,
    });
    await criaFecho({
      userId: motorista.id, createdById: admin.id, vehicleId: veiculo.id,
      weekStart: new Date('2026-03-09T00:00:00Z'), uberAmount: 1000, vehicleFee: 200,
      commissionRate: 15,
    });

    const res = await request(app)
      .post(`/investors/projects/${projeto.id}/periods/2026-03/compute`)
      .set(asAdmin()).expect(200);

    const p = res.body.data.period;
    expect(p.settlementsCount).toBe(2);
    expect(p.vehicleFeeTotal).toBe(400);
    expect(p.commissionTotal).toBeGreaterThan(0);
    expect(p.profit).toBe(p.commissionTotal + p.vehicleFeeTotal);
    expect(p.investorsAmount).toBeCloseTo(p.profit / 2, 2);
  });

  it('não conta fechos de outro carro nem de outro mês', async () => {
    const { projeto, veiculo, motorista } = await aRender();
    const outro = await criaVeiculo({ plate: 'ZZ-99-ZZ' });
    const outroMotorista = await criaMotorista({ name: 'Outro' });

    await criaFecho({
      userId: motorista.id, createdById: admin.id, vehicleId: veiculo.id,
      weekStart: new Date('2026-04-06T00:00:00Z'), uberAmount: 1000, vehicleFee: 500,
    });
    await criaFecho({
      userId: outroMotorista.id, createdById: admin.id, vehicleId: outro.id,
      weekStart: new Date('2026-03-02T00:00:00Z'), uberAmount: 1000, vehicleFee: 500,
    });

    const res = await request(app)
      .post(`/investors/projects/${projeto.id}/periods/2026-03/compute`)
      .set(asAdmin()).expect(200);

    expect(res.body.data.period.settlementsCount).toBe(0);
    expect(res.body.data.period.profit).toBe(0);
  });

  it('as despesas lançadas à mão descontam do lucro', async () => {
    const { projeto, veiculo, motorista } = await aRender();
    await criaFecho({
      userId: motorista.id, createdById: admin.id, vehicleId: veiculo.id,
      weekStart: new Date('2026-03-02T00:00:00Z'), uberAmount: 1000, vehicleFee: 1000,
    });

    const antes = await request(app)
      .post(`/investors/projects/${projeto.id}/periods/2026-03/compute`)
      .set(asAdmin()).expect(200);

    const res = await request(app).post(`/investors/projects/${projeto.id}/expenses`)
      .set(asAdmin()).send({ month: '2026-03', amount: 300, description: 'Seguro' })
      .expect(201);

    expect(res.body.data.period.expensesTotal).toBe(300);
    expect(res.body.data.period.profit).toBe(antes.body.data.period.profit - 300);
  });

  it('um mês de prejuízo distribui zero, não cobra ao investidor', async () => {
    const { projeto } = await aRender();
    await request(app).post(`/investors/projects/${projeto.id}/expenses`)
      .set(asAdmin()).send({ month: '2026-03', amount: 500, description: 'Revisão' })
      .expect(201);

    const res = await request(app)
      .post(`/investors/projects/${projeto.id}/periods/2026-03/compute`)
      .set(asAdmin()).expect(200);

    expect(res.body.data.period.profit).toBe(-500);
    expect(res.body.data.period.investorsAmount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Distribuição', () => {
  /** Três investidores com 50%, 25% e 25% de um projeto a render. */
  async function comTresInvestidores() {
    const a = await investidorCom(10000);
    const b = await investidorCom(5000);
    const c = await investidorCom(5000);
    const { projeto, veiculo } = await projetoAberto({ target: 20000, profitShare: 50 });

    for (const [inv, valor] of [[a, 10000], [b, 5000], [c, 5000]] as const) {
      await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
        .set(asInvestor(inv.userId)).send({ amount: valor }).expect(201);
    }

    await request(app).post(`/investors/projects/${projeto.id}/activate`)
      .set(asAdmin()).send({ startedOn: '2026-03' }).expect(200);

    return { a, b, c, projeto, veiculo };
  }

  it('reparte na proporção e a soma bate certo ao cêntimo', async () => {
    const { a, b, c, projeto } = await comTresInvestidores();

    // Um lucro que não divide bem por três: 1000,01 €.
    await testDb.projectPeriod.create({
      data: {
        projectId: projeto.id, month: monthStart('2026-03'),
        profit: 2000.02, investorsAmount: 1000.01, profitShare: 50,
      },
    });

    await request(app)
      .post(`/investors/projects/${projeto.id}/periods/2026-03/distribute`)
      .set(asAdmin()).expect(200);

    const partes = await Promise.all([a, b, c].map(async (inv) => {
      const r = await testDb.investorMovement.aggregate({
        where: { accountId: inv.accountId, kind: 'PROFIT_SHARE' },
        _sum: { amount: true },
      });
      return Number(r._sum.amount ?? 0);
    }));

    const total = Math.round(partes.reduce((s, x) => s + x, 0) * 100) / 100;
    expect(total).toBe(1000.01);
    expect(partes[0]).toBeCloseTo(500, 1);   // 50%
    expect(partes[1]).toBeCloseTo(250, 1);   // 25%
    expect(partes[2]).toBeCloseTo(250, 1);   // 25%
  });

  it('AS DISTRIBUIÇÕES NÃO ABATEM O CAPITAL', async () => {
    // A regra que toda a gente assume ao contrário. Se isto partir, o
    // investidor deixa de receber quando devia continuar a receber.
    const { a, projeto } = await comTresInvestidores();

    await testDb.projectPeriod.create({
      data: {
        projectId: projeto.id, month: monthStart('2026-03'),
        profit: 20000, investorsAmount: 10000, profitShare: 50,
      },
    });
    await request(app)
      .post(`/investors/projects/${projeto.id}/periods/2026-03/distribute`)
      .set(asAdmin()).expect(200);

    const s = await saldo(a.accountId);
    // Recebeu 5000 € de lucro (50% de 10 000)...
    expect(s.earnings).toBe(5000);
    // ...e continua com os 10 000 € de capital aplicados, na íntegra.
    expect(s.invested_in_projects).toBe(10000);
    expect(s.capital).toBe(10000);
  });

  it('o lucro vai para o rendimento e não para o capital', async () => {
    const { a, projeto } = await comTresInvestidores();
    await testDb.projectPeriod.create({
      data: {
        projectId: projeto.id, month: monthStart('2026-03'),
        profit: 800, investorsAmount: 400, profitShare: 50,
      },
    });
    await request(app)
      .post(`/investors/projects/${projeto.id}/periods/2026-03/distribute`)
      .set(asAdmin()).expect(200);

    const s = await saldo(a.accountId);
    expect(s.earnings).toBe(200);
    expect(s.capital).toBe(10000);
  });

  it('não distribui o mesmo mês duas vezes', async () => {
    const { projeto } = await comTresInvestidores();
    await testDb.projectPeriod.create({
      data: {
        projectId: projeto.id, month: monthStart('2026-03'),
        profit: 800, investorsAmount: 400, profitShare: 50,
      },
    });

    await request(app).post(`/investors/projects/${projeto.id}/periods/2026-03/distribute`)
      .set(asAdmin()).expect(200);
    const res = await request(app)
      .post(`/investors/projects/${projeto.id}/periods/2026-03/distribute`).set(asAdmin());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_DISTRIBUTED');
  });

  it('não reapura um mês já distribuído', async () => {
    const { projeto } = await comTresInvestidores();
    await testDb.projectPeriod.create({
      data: {
        projectId: projeto.id, month: monthStart('2026-03'),
        profit: 800, investorsAmount: 400, profitShare: 50,
      },
    });
    await request(app).post(`/investors/projects/${projeto.id}/periods/2026-03/distribute`)
      .set(asAdmin()).expect(200);

    const res = await request(app)
      .post(`/investors/projects/${projeto.id}/periods/2026-03/compute`).set(asAdmin());
    expect(res.body.code).toBe('ALREADY_DISTRIBUTED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Liquidação', () => {
  async function aRenderCom(a: number, b: number, target = 20000) {
    const i1 = await investidorCom(a);
    const i2 = await investidorCom(b);
    const { projeto } = await projetoAberto({ target });

    await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(i1.userId)).send({ amount: a }).expect(201);
    await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(i2.userId)).send({ amount: b }).expect(201);
    await request(app).post(`/investors/projects/${projeto.id}/activate`)
      .set(asAdmin()).send({ startedOn: '2026-03' }).expect(200);

    return { i1, i2, projeto };
  }

  it('o carro desvalorizou: devolve menos e liberta o capital', async () => {
    const { i1, i2, projeto } = await aRenderCom(10000, 10000);

    await request(app).post(`/investors/projects/${projeto.id}/close`)
      .set(asAdmin()).send({ saleAmount: 12000 }).expect(200);

    const s1 = await saldo(i1.accountId);
    expect(s1.invested_in_projects).toBe(0);      // deixou de estar trancado
    expect(s1.capital).toBe(6000);                // 10 000 − 4 000 de perda
    expect(s1.available_capital).toBe(6000);

    const s2 = await saldo(i2.accountId);
    expect(s2.capital).toBe(6000);
  });

  it('o carro valorizou: devolve mais', async () => {
    const { i1, projeto } = await aRenderCom(10000, 10000);

    await request(app).post(`/investors/projects/${projeto.id}/close`)
      .set(asAdmin()).send({ saleAmount: 26000 }).expect(200);

    const s = await saldo(i1.accountId);
    expect(s.capital).toBe(13000);
  });

  it('sem venda, devolve o capital tal como entrou', async () => {
    const { i1, projeto } = await aRenderCom(10000, 10000);

    await request(app).post(`/investors/projects/${projeto.id}/close`)
      .set(asAdmin()).send({}).expect(200);

    const s = await saldo(i1.accountId);
    expect(s.capital).toBe(10000);
    expect(s.invested_in_projects).toBe(0);
  });

  it('financiado em parte, reparte só a fração que financiaram', async () => {
    // Meta 20 000 €, angariados 15 000 €: são donos de 75% do carro.
    const { i1, projeto } = await aRenderCom(10000, 5000, 20000);

    await request(app).post(`/investors/projects/${projeto.id}/close`)
      .set(asAdmin()).send({ saleAmount: 12000 }).expect(200);

    // 75% de 12 000 = 9 000 para repartir; 2/3 disso = 6 000 para o primeiro.
    const s = await saldo(i1.accountId);
    expect(s.capital).toBe(6000);
  });

  it('recusa fechar com meses apurados por distribuir', async () => {
    const { projeto } = await aRenderCom(10000, 10000);
    await testDb.projectPeriod.create({
      data: {
        projectId: projeto.id, month: monthStart('2026-03'),
        profit: 800, investorsAmount: 400, profitShare: 50,
      },
    });

    const res = await request(app).post(`/investors/projects/${projeto.id}/close`)
      .set(asAdmin()).send({ saleAmount: 15000 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PENDING_PERIODS');
  });

  it('depois de liquidado, o capital pode ser resgatado', async () => {
    const { i1, projeto } = await aRenderCom(10000, 10000);
    await request(app).post(`/investors/projects/${projeto.id}/close`)
      .set(asAdmin()).send({ saleAmount: 20000 }).expect(200);

    await request(app).post('/investors/withdrawals').set(asInvestor(i1.userId))
      .send({ bucket: 'CAPITAL', amount: 10000 }).expect(201);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Permissões', () => {
  it('um investidor não cria nem distribui projetos', async () => {
    const inv = await investidorCom(1000);
    const { projeto } = await projetoAberto();

    await request(app).post('/investors/projects').set(asInvestor(inv.userId))
      .send({ name: 'Meu projeto', targetAmount: 1000 }).expect(403);

    await request(app).post(`/investors/projects/${projeto.id}/periods/2026-03/distribute`)
      .set(asInvestor(inv.userId)).expect(403);

    await request(app).post(`/investors/projects/${projeto.id}/close`)
      .set(asInvestor(inv.userId)).send({ saleAmount: 100 }).expect(403);
  });

  it('um investidor não vê as participações dos outros', async () => {
    const a = await investidorCom(10000);
    const b = await investidorCom(10000);
    const { projeto } = await projetoAberto();

    await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(a.userId)).send({ amount: 10000 }).expect(201);
    await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(b.userId)).send({ amount: 10000 }).expect(201);

    const res = await request(app).get(`/investors/projects/${projeto.id}`)
      .set(asInvestor(a.userId)).expect(200);

    expect(res.body.data.shares).toEqual([]);          // nada dos outros
    expect(res.body.data.mine.amount).toBe(10000);     // a dele, sim
    expect(res.body.data.project.investorsCount).toBe(2);
  });

  it('um motorista não entra nos projetos', async () => {
    const motorista = await criaMotorista();
    await request(app).get('/investors/projects')
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .expect(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Diário de bordo', () => {
  it('fechar o financiamento abre o diário sozinho e avisa os participantes', async () => {
    // É o momento em que o investidor passa a ter dinheiro parado à espera de
    // um carro. Se o diário só abrisse à mão, seria precisamente aí que ele
    // ficaria sem nada para ver.
    const inv = await investidorCom(20000);
    const { projeto } = await projetoAberto({ target: 20000 });

    await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 20000 }).expect(201);

    const entradas = await testDb.projectUpdate.findMany({ where: { projectId: projeto.id } });
    expect(entradas).toHaveLength(1);
    expect(entradas[0].stage).toBe('FUNDING_COMPLETE');

    const avisos = await testDb.notification.count({
      where: { userId: inv.userId, title: 'Financiamento concluído' },
    });
    expect(avisos).toBe(1);
  });

  it('não abre o diário enquanto faltar dinheiro', async () => {
    const inv = await investidorCom(20000);
    const { projeto } = await projetoAberto({ target: 20000 });

    await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 19999 }).expect(201);

    const entradas = await testDb.projectUpdate.count({ where: { projectId: projeto.id } });
    expect(entradas).toBe(0);
  });

  it('o investidor vê as entradas visíveis e NÃO vê as notas internas', async () => {
    const inv = await investidorCom(10000);
    const { projeto } = await projetoAberto();
    await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 10000 }).expect(201);

    await request(app).post(`/investors/projects/${projeto.id}/updates`).set(asAdmin())
      .send({ stage: 'VEHICLE_PAID', title: 'Carro pago', happenedOn: '2026-03-10' })
      .expect(201);
    await request(app).post(`/investors/projects/${projeto.id}/updates`).set(asAdmin())
      .send({ title: 'Negociação do stand', visible: false, happenedOn: '2026-03-11' })
      .expect(201);

    const dele = await request(app).get(`/investors/projects/${projeto.id}`)
      .set(asInvestor(inv.userId)).expect(200);
    expect(dele.body.data.updates).toHaveLength(1);
    expect(dele.body.data.updates[0].title).toBe('Carro pago');

    const daGestao = await request(app).get(`/investors/projects/${projeto.id}`)
      .set(asAdmin()).expect(200);
    expect(daGestao.body.data.updates).toHaveLength(2);
  });

  it('um investidor não escreve no diário', async () => {
    const inv = await investidorCom(10000);
    const { projeto } = await projetoAberto();
    await request(app).post(`/investors/projects/${projeto.id}/updates`)
      .set(asInvestor(inv.userId)).send({ title: 'Está tudo bem' })
      .expect(403);
  });

  it('diz se o carro tem motorista, e desde quando, sem dizer quem', async () => {
    const inv = await investidorCom(10000);
    const { projeto, veiculo } = await projetoAberto();
    await request(app).post(`/investors/projects/${projeto.id}/subscribe`)
      .set(asInvestor(inv.userId)).send({ amount: 10000 }).expect(201);

    const semMotorista = await request(app).get(`/investors/projects/${projeto.id}`)
      .set(asInvestor(inv.userId)).expect(200);
    expect(semMotorista.body.data.driver.active).toBe(false);

    const motorista = await criaMotorista({ name: 'João Condutor' });
    await testDb.vehicleAssignment.create({
      data: { vehicleId: veiculo.id, userId: motorista.id, startedAt: new Date('2026-03-01') },
    });

    const comMotorista = await request(app).get(`/investors/projects/${projeto.id}`)
      .set(asInvestor(inv.userId)).expect(200);
    expect(comMotorista.body.data.driver.active).toBe(true);
    expect(comMotorista.body.data.driver.since).toBe('2026-03-01');
    // O nome do motorista não sai para fora da empresa.
    expect(JSON.stringify(comMotorista.body)).not.toContain('João Condutor');
  });
});
