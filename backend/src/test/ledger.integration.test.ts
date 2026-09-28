// src/test/ledger.integration.test.ts
//
// O extrato acumulado de um motorista.
//
// ─── O TESTE QUE JUSTIFICA O FICHEIRO ────────────────────────────────────────
//
// O saldo do motorista e calculado em DOIS sitios: a view `driver_balances`, em
// SQL, que e o que o portal dele mostra; e este extrato, em TypeScript, que
// explica como se chegou la.
//
// Duas contas da mesma coisa divergem no dia em que alguem corrige uma. E o
// sintoma seria o pior possivel: o motorista ve um numero no portal, a
// administracao ve outro no extrato, ninguem consegue dizer qual esta certo, e
// a conversa e sobre o dinheiro dele.
//
// O ultimo bloco deste ficheiro compara as duas diretamente. E a razao de ser
// de tudo o resto.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaMotorista, criaAdmin, criaRetirada, criaContaAprovada } from './factories';
import { UserRole, SettlementStatus, AdjustmentType } from '../shared/types/enums';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let motorista: Awaited<ReturnType<typeof criaMotorista>>;

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function criaFecho(opts: {
  weekStart: string;
  netToDriver: number;
  status?: SettlementStatus;
  userId?: string;
}) {
  return testDb.weeklySettlement.create({
    data: {
      userId: opts.userId ?? motorista.id,
      createdById: admin.id,
      weekStart: dia(opts.weekStart),
      weekEnd: dia(opts.weekStart),
      grossRevenue: opts.netToDriver + 100,
      commissionRate: 15,
      commissionAmount: 50,
      totalDeductions: 50,
      profitBase: opts.netToDriver,
      netToDriver: opts.netToDriver,
      status: opts.status ?? SettlementStatus.REGISTERED,
    },
  });
}

async function criaAjuste(type: AdjustmentType, amount: number, reason = 'teste') {
  return testDb.balanceAdjustment.create({
    data: { userId: motorista.id, amount, type, reason, createdBy: admin.id },
  });
}

/** Retirada num estado e com a data de pedido controlada. */
async function criaRetiradaEm(
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED',
  amount: number,
  requestedAt: string,
) {
  const w = await criaRetirada({ userId: motorista.id, status, amount });
  return testDb.withdrawal.update({
    where: { id: w.id },
    data: { requestedAt: dia(requestedAt) },
  });
}

// O `role` vai ANOTADO como UserRole e nao deixado a inferencia. Com um valor
// por omissao e sem anotacao, o TypeScript infere o tipo LITERAL 'ADMIN' e
// passar UserRole.DRIVER deixa de encaixar.
const extrato = (userId?: string, actorId?: string, role: UserRole = UserRole.ADMIN) =>
  request(app)
    .get(`/balance/${userId ?? motorista.id}/ledger`)
    .set(authHeader(actorId ?? admin.id, role));

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  motorista = await criaMotorista({ name: 'Monica Condutora' });
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe('quem pode ver', () => {
  it('o proprio motorista ve o seu extrato', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 400 });
    await extrato(motorista.id, motorista.id, UserRole.DRIVER).expect(200);
  });

  it('um motorista NAO ve o extrato de outro', async () => {
    const outro = await criaMotorista({ name: 'Segundo Condutor' });
    await extrato(outro.id, motorista.id, UserRole.DRIVER).expect(403);
  });

  it('a gestao ve o de qualquer um', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 400 });
    await extrato(motorista.id, admin.id, UserRole.ADMIN).expect(200);
  });

  it('sem autenticacao, 401', async () => {
    await request(app).get(`/balance/${motorista.id}/ledger`).expect(401);
  });
});

describe('que movimentos entram', () => {
  it('um fecho REGISTERED entra', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 420 });
    const r = await extrato().expect(200);

    expect(r.body.data.entries).toHaveLength(1);
    expect(r.body.data.entries[0].kind).toBe('SETTLEMENT');
    expect(r.body.data.entries[0].amount).toBe(420);
    expect(r.body.data.entries[0].balance).toBe(420);
  });

  it('um fecho em RASCUNHO nao entra — nao creditou nada', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 420, status: SettlementStatus.DRAFT });
    const r = await extrato().expect(200);
    expect(r.body.data.entries).toHaveLength(0);
  });

  it('um fecho CANCELADO nao entra', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 420, status: SettlementStatus.CANCELLED });
    const r = await extrato().expect(200);
    expect(r.body.data.entries).toHaveLength(0);
  });

  it('credito soma e debito subtrai', async () => {
    await criaAjuste(AdjustmentType.CREDIT, 100, 'bonus');
    await criaAjuste(AdjustmentType.DEBIT, 30, 'multa');

    const r = await extrato().expect(200);
    const [c, d] = r.body.data.entries;

    // Na base o `amount` e sempre positivo e o sinal vem do tipo. O extrato
    // devolve-o ASSINADO, para a tela nao ter de reimplementar essa regra.
    expect(c.amount).toBe(100);
    expect(d.amount).toBe(-30);
    expect(d.balance).toBe(70);
  });

  it('uma retirada PAGA subtrai', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 500 });
    await criaRetiradaEm('PAID', 200, '2026-03-10');

    const r = await extrato().expect(200);
    expect(r.body.data.entries[1].kind).toBe('WITHDRAWAL');
    expect(r.body.data.entries[1].amount).toBe(-200);
    expect(r.body.data.entries[1].balance).toBe(300);
  });

  it('uma retirada APROVADA tambem subtrai', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 500 });
    await criaRetiradaEm('APPROVED', 150, '2026-03-10');

    const r = await extrato().expect(200);
    expect(r.body.data.entries[1].amount).toBe(-150);
    expect(r.body.data.reconciliation.accountBalance).toBe(350);
  });

  it('uma retirada PENDENTE nao entra no extrato', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 500 });
    await criaRetiradaEm('PENDING', 300, '2026-03-10');

    const r = await extrato().expect(200);

    // Decisao do cliente: uma pendente ainda pode ser recusada, e uma linha que
    // pode desaparecer e pior do que nao a mostrar.
    expect(r.body.data.entries).toHaveLength(1);
    expect(r.body.data.reconciliation.accountBalance).toBe(500);
  });

  it('uma retirada RECUSADA nao entra', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 500 });
    await criaRetiradaEm('REJECTED', 300, '2026-03-10');

    const r = await extrato().expect(200);
    expect(r.body.data.entries).toHaveLength(1);
  });

  it('os movimentos de OUTRO motorista nao entram', async () => {
    const outro = await criaMotorista({ name: 'Segundo Condutor' });
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 400 });
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 999, userId: outro.id });

    const r = await extrato().expect(200);
    expect(r.body.data.entries).toHaveLength(1);
    expect(r.body.data.reconciliation.accountBalance).toBe(400);
  });
});

describe('a ordem e o acumulado', () => {
  it('acumula linha a linha, por ordem cronologica', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 420 });
    await criaRetiradaEm('PAID', 300, '2026-03-03');
    await criaFecho({ weekStart: '2026-03-09', netToDriver: 380 });
    await criaFecho({ weekStart: '2026-03-16', netToDriver: 350 });

    const r = await extrato().expect(200);
    const saldos = r.body.data.entries.map((e: any) => e.balance);

    // 420, −300, +380, +350
    expect(saldos).toEqual([420, 120, 500, 850]);
  });

  it('a retirada assenta na data do PEDIDO e nao na da decisao', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 420 });
    const w = await criaRetiradaEm('APPROVED', 300, '2026-03-03');
    await criaFecho({ weekStart: '2026-03-16', netToDriver: 350 });

    // A decisao foi tomada muito depois. Com `processedAt` a linha saltava para
    // o fim e o saldo do meio mudava; com `requestedAt` fica onde esta.
    await testDb.withdrawal.update({
      where: { id: w.id },
      data: { processedAt: dia('2026-03-20') },
    });

    const r = await extrato().expect(200);
    expect(r.body.data.entries.map((e: any) => e.balance)).toEqual([420, 120, 470]);
  });

  it('marcar como paga NAO reordena o extrato', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 420 });
    const w = await criaRetiradaEm('APPROVED', 300, '2026-03-03');
    await criaFecho({ weekStart: '2026-03-16', netToDriver: 350 });

    const antes = await extrato().expect(200);

    await request(app)
      .patch(`/withdrawals/${w.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ status: 'PAID' })
      .expect(200);

    const depois = await extrato().expect(200);

    // Um documento que se reordena entre duas consultas nao serve para explicar
    // nada a ninguem. Os valores sao os mesmos; so a etiqueta muda.
    expect(depois.body.data.entries.map((e: any) => e.balance))
      .toEqual(antes.body.data.entries.map((e: any) => e.balance));
    expect(depois.body.data.entries[1].label).toContain('paga');
  });

  it('a ordem e estavel quando movimentos de tipos diferentes caem no mesmo dia', async () => {
    // ─── PORQUE NAO SAO TRES FECHOS ────────────────────────────────────────
    //
    // A primeira versao deste teste criava tres fechos na mesma semana e
    // rebentava com `Unique constraint failed on (user_id, week_start)`. A base
    // impede dois fechos do mesmo motorista na mesma semana, e bem — mas isso
    // significa que o empate de datas NUNCA acontece entre fechos.
    //
    // Acontece entre TIPOS diferentes, e e para isso que o desempate serve: um
    // fecho da semana de 2 de marco, uma retirada pedida a 2 de marco, e um
    // ajuste lancado a 2 de marco sao tres movimentos com a mesma data e sem
    // ordem natural entre si.
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 500 });
    await criaRetiradaEm('PAID', 100, '2026-03-02');

    const ajuste = await criaAjuste(AdjustmentType.CREDIT, 50, 'bonus');
    await testDb.balanceAdjustment.update({
      where: { id: ajuste.id },
      data: { createdAt: dia('2026-03-02') },
    });

    const a = await extrato().expect(200);
    const b = await extrato().expect(200);

    expect(a.body.data.entries).toHaveLength(3);

    // Sem desempate, duas consultas podiam devolver ordens diferentes — e o
    // saldo das linhas pelo meio mudava sem nada ter mudado.
    expect(a.body.data.entries.map((e: any) => e.id))
      .toEqual(b.body.data.entries.map((e: any) => e.id));
    expect(a.body.data.entries.map((e: any) => e.balance))
      .toEqual(b.body.data.entries.map((e: any) => e.balance));

    // E o total nao depende da ordem: 500 − 100 + 50.
    expect(a.body.data.reconciliation.accountBalance).toBe(450);
  });

  it('saldo negativo e devolvido como tal', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 100 });
    await criaAjuste(AdjustmentType.DEBIT, 250, 'despesas acima dos ganhos');

    const r = await extrato().expect(200);

    // A view permite negativo de proposito: quem gasta mais do que ganha fica a
    // dever, e desconta-se dos fechos seguintes. O extrato nao pode truncar.
    expect(r.body.data.reconciliation.accountBalance).toBe(-150);
  });

  it('sem movimentos, extrato vazio e saldo zero', async () => {
    const r = await extrato().expect(200);
    expect(r.body.data.entries).toEqual([]);
    expect(r.body.data.reconciliation.accountBalance).toBe(0);
  });
});

describe('a reconciliacao', () => {
  it('separa o saldo em conta do disponivel para retirada', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 1000 });
    await criaRetiradaEm('PAID', 240, '2026-03-05');
    await criaRetiradaEm('PENDING', 300, '2026-03-10');

    const r = await extrato().expect(200);
    const rec = r.body.data.reconciliation;

    // Os tres numeros da linha que vai por cima da tabela. E a unica forma de a
    // administracao e o motorista nao discordarem: aparecem juntos, com a conta
    // a vista.
    expect(rec.accountBalance).toBe(760);
    expect(rec.pendingWithdrawals).toBe(300);
    expect(rec.availableToWithdraw).toBe(460);
  });

  it('sem pendentes, o saldo em conta e o disponivel coincidem', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 500 });

    const r = await extrato().expect(200);
    const rec = r.body.data.reconciliation;

    expect(rec.accountBalance).toBe(rec.availableToWithdraw);
    expect(rec.pendingWithdrawals).toBe(0);
  });
});

describe('o extrato CONCORDA com a view driver_balances', () => {
  it('a ultima linha e settlements + credits − debits − withdrawn', async () => {
    // Um cenario com um de cada tipo, incluindo os que NAO devem contar.
    await criaFecho({ weekStart: '2026-02-02', netToDriver: 700 });
    await criaFecho({ weekStart: '2026-02-09', netToDriver: 650 });
    await criaFecho({ weekStart: '2026-02-16', netToDriver: 500, status: SettlementStatus.DRAFT });
    await criaAjuste(AdjustmentType.CREDIT, 120, 'bonus');
    await criaAjuste(AdjustmentType.DEBIT, 45.5, 'portagem');
    await criaRetiradaEm('PAID', 300, '2026-02-20');
    await criaRetiradaEm('APPROVED', 200, '2026-02-25');
    await criaRetiradaEm('PENDING', 150, '2026-03-01');
    await criaRetiradaEm('REJECTED', 900, '2026-03-02');

    const r = await extrato().expect(200);
    const rec = r.body.data.reconciliation;

    const saldoDaView = await request(app)
      .get(`/balance/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .expect(200);

    const v = saldoDaView.body.data.balance;

    // A primeira forma: a conta explicita.
    const esperado = v.totalSettlements + v.totalCredits - v.totalDebits - v.totalWithdrawn;
    expect(rec.accountBalance).toBeCloseTo(esperado, 2);

    // A segunda forma, equivalente, e a que apanha uma divergencia se alguem
    // mexer na view sem mexer aqui: o saldo em conta e o `available` mais o que
    // esta reservado.
    expect(rec.accountBalance).toBeCloseTo(v.available + v.pendingWithdrawals, 2);

    // E o disponivel do extrato e exatamente o que o portal do motorista mostra.
    expect(rec.availableToWithdraw).toBeCloseTo(v.available, 2);
  });

  it('continua a bater depois de a pendente ser aprovada', async () => {
    // Sem dados bancarios aprovados a aprovacao da 400, e com razao: nao ha
    // destino para a transferencia. Era o que faltava a primeira versao deste
    // teste — uma regra do dominio que o extrato nao conhecia.
    await criaContaAprovada(motorista.id);

    await criaFecho({ weekStart: '2026-03-02', netToDriver: 1000 });
    const w = await criaRetiradaEm('PENDING', 300, '2026-03-05');

    await request(app)
      .patch(`/withdrawals/${w.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ status: 'APPROVED' })
      .expect(200);

    const r = await extrato().expect(200);
    const v = (await request(app)
      .get(`/balance/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .expect(200)).body.data.balance;

    // A retirada mudou de lado: saiu do reservado e entrou no extrato. O saldo
    // disponivel nao se mexe — e o que o motorista nota, ou nao nota.
    expect(r.body.data.entries).toHaveLength(2);
    expect(r.body.data.reconciliation.accountBalance).toBeCloseTo(700, 2);
    expect(r.body.data.reconciliation.availableToWithdraw).toBeCloseTo(v.available, 2);
  });

  it('bate tambem com valores de centimos que nao fecham redondo', async () => {
    await criaFecho({ weekStart: '2026-03-02', netToDriver: 333.33 });
    await criaFecho({ weekStart: '2026-03-09', netToDriver: 166.67 });
    await criaAjuste(AdjustmentType.DEBIT, 0.01, 'arredondamento');

    const r = await extrato().expect(200);
    const v = (await request(app)
      .get(`/balance/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .expect(200)).body.data.balance;

    expect(r.body.data.reconciliation.accountBalance).toBe(499.99);
    expect(r.body.data.reconciliation.accountBalance)
      .toBeCloseTo(v.available + v.pendingWithdrawals, 2);
  });
});

describe('o extrato CONCORDA com a view — com investimentos', () => {
  // ─── PORQUE ESTE BLOCO EXISTE ─────────────────────────────────────────────
  //
  // O bloco acima compara o extrato com a view, e era a unica garantia de que
  // os dois nao divergem. Mas foi escrito antes de haver investimentos: so cria
  // fechos, ajustes e retiradas. Com INVESTMENT e REDEMPTION a entrar pelos dois
  // lados — no extrato por codigo, na view por migracao —, esse teste continuava
  // a passar SEM os ver. Uma divergencia nas linhas novas passava em silencio.
  //
  // Estes casos poem investimentos em todos os estados e voltam a exigir as duas
  // formas da igualdade.

  async function plano() {
    return testDb.investmentPlan.create({
      data: { name: 'Flexivel', type: 'FLEXIBLE', annualRate: 3.65 },
    });
  }

  async function aplicacao(planoId: string, o: {
    principal: number;
    fechada?: { payout: number; reason: 'MATURED' | 'EARLY' | 'WITHDRAWN'; closedAt: string | null };
  }) {
    return testDb.investment.create({
      data: {
        userId: motorista.id,
        planId: planoId,
        principal: o.principal,
        planType: 'FLEXIBLE',
        annualRate: 3.65,
        startDate: dia('2026-02-01'),
        createdAt: dia('2026-02-01'),
        ...(o.fechada
          ? {
              status: 'CLOSED',
              payout: o.fechada.payout,
              closeReason: o.fechada.reason,
              closedAt: o.fechada.closedAt ? dia(o.fechada.closedAt) : null,
            }
          : { status: 'ACTIVE' }),
      },
    });
  }

  async function comparar() {
    const r = await extrato().expect(200);
    const v = (await request(app)
      .get(`/balance/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .expect(200)).body.data.balance;
    return { rec: r.body.data.reconciliation, entries: r.body.data.entries, v };
  }

  it('bate com aplicacoes ativas, resgatadas e terminadas', async () => {
    await criaFecho({ weekStart: '2026-01-05', netToDriver: 2000 });
    const p = await plano();

    await aplicacao(p.id, { principal: 200 });                                                          // ativa
    await aplicacao(p.id, { principal: 300, fechada: { payout: 310.5, reason: 'WITHDRAWN', closedAt: '2026-03-01' } }); // resgatada com ganho
    await aplicacao(p.id, { principal: 100, fechada: { payout: 98, reason: 'EARLY', closedAt: '2026-03-02' } });        // penalizada
    await aplicacao(p.id, { principal: 400, fechada: { payout: 412.2, reason: 'MATURED', closedAt: '2026-03-03' } });   // terminada

    const { rec, v } = await comparar();

    // A forma explicita, agora com as duas parcelas dos investimentos.
    const esperado = v.totalSettlements + v.totalCredits - v.totalDebits - v.totalWithdrawn
                   - v.totalInvested + v.totalInvestmentReturns;
    expect(rec.accountBalance).toBeCloseTo(esperado, 2);

    // E a forma que apanha uma divergencia se alguem mexer na view.
    expect(rec.accountBalance).toBeCloseTo(v.available + v.pendingWithdrawals, 2);

    // Conta a mao, para nao depender so da view: 2000 - 1000 aplicado + 820.7 devolvido.
    expect(rec.accountBalance).toBeCloseTo(1820.7, 2);
  });

  it('uma aplicacao fechada sem closedAt continua contada no extrato', async () => {
    // O estado e impossivel pela aplicacao — o unico sitio que fecha grava
    // payout e closedAt juntos. Mas nao ha restricao na base. Antes desta
    // correcao, a view contava o payout e o extrato deixava-o cair.
    await criaFecho({ weekStart: '2026-01-05', netToDriver: 1000 });
    const p = await plano();
    await aplicacao(p.id, { principal: 500, fechada: { payout: 520, reason: 'WITHDRAWN', closedAt: null } });

    const { rec, entries, v } = await comparar();

    expect(entries.some((e: any) => e.kind === 'REDEMPTION')).toBe(true);
    expect(rec.accountBalance).toBeCloseTo(v.available + v.pendingWithdrawals, 2);
    expect(rec.accountBalance).toBeCloseTo(1020, 2);
  });

  it('os ganhos diarios de uma aplicacao ativa NAO sao linhas do extrato', async () => {
    // Acumulam na aplicacao e so entram no saldo no resgate, dentro do payout.
    // E o que a view faz, e o extrato tem de explicar esse numero e nao outro.
    await criaFecho({ weekStart: '2026-01-05', netToDriver: 1000 });
    const p = await plano();
    const inv = await aplicacao(p.id, { principal: 300 });
    await testDb.investment.update({ where: { id: inv.id }, data: { accrued: 12.5 } });

    const { rec, entries, v } = await comparar();

    expect(entries.map((e: any) => e.kind)).toEqual(['SETTLEMENT', 'INVESTMENT']);
    expect(rec.accountBalance).toBeCloseTo(700, 2);
    expect(rec.accountBalance).toBeCloseTo(v.available + v.pendingWithdrawals, 2);
  });
});
