// src/test/money-rules.integration.test.ts
//
// As regras que custam dinheiro se partirem.
//
// Todas elas foram decisões de desenho documentadas no projeto, e nenhuma
// estava protegida por nada até agora. São exatamente as que um refactor
// distraído quebra sem dar erro nenhum — o sistema continua a responder 200,
// só que com o número errado.
//
// Cada teste vai pelo HTTP a sério: Express, autenticação, zod, service,
// Prisma, Postgres. Nada é substituído por imitações.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader, assertSameDatabase } from './harness';
import {
  criaMotorista, criaAdmin, criaContaAprovada, criaContaPendente,
  criaFecho, criaLancamento, criaRetirada,
} from './factories';
import { UserRole } from '../shared/types/enums';

let admin: Awaited<ReturnType<typeof criaAdmin>>;

beforeEach(async () => {
  // Antes e não depois: se um teste rebentar a meio, o seguinte arranca limpo
  // em vez de herdar os destroços.
  await resetDb();
  admin = await criaAdmin();
});

afterAll(async () => {
  await testDb.$disconnect();
});

// ─── Antes de tudo ────────────────────────────────────────────────────────────

describe('sanidade', () => {
  it('a aplicacao e os testes falam com a MESMA base de dados', async () => {
    // Este é o primeiro teste de propósito. Se falhar, nenhum dos seguintes
    // significa nada — e da primeira vez que esta suite correu foi exatamente
    // isto que estava errado, com seis testes a passar pela razão errada.
    await assertSameDatabase();

    // Cria pelas fábricas e vai buscar pela aplicação. Se as duas metades
    // estiverem em bases diferentes, isto dá 404 e a suite para aqui — em vez
    // de doze testes falharem com sintomas que apontam para o sítio errado.
    const motorista = await criaMotorista({ name: 'Sanidade' });
    const res = await request(app)
      .get(`/balance/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBeDefined();
  });
});

// ─── De onde vem o dinheiro ───────────────────────────────────────────────────

describe('saldo — origem do dinheiro', () => {
  it('um lancamento comunicado pelo motorista NAO credita saldo', async () => {
    // A regra mais importante do sistema e a menos óbvia: o que o motorista
    // comunica é informação para a administração conferir, não dinheiro. Se um
    // dia isto creditar, cada motorista passa a poder escrever o próprio saldo.
    const motorista = await criaMotorista();
    await criaLancamento({ userId: motorista.id, amount: 5000 });

    const res = await request(app)
      .get(`/balance/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.data.balance.available).toBe(0);
  });

  it('nem sequer quando o lancamento ja foi aprovado', async () => {
    // Aprovar um lançamento confirma que os números batem com o extrato. Não é
    // um pagamento — esse só acontece no fecho da semana.
    const motorista = await criaMotorista();
    await criaLancamento({ userId: motorista.id, amount: 5000, status: 'APPROVED' });

    const res = await request(app)
      .get(`/balance/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN));

    expect(res.body.data.balance.available).toBe(0);
  });

  it('so o fecho REGISTADO credita', async () => {
    const motorista = await criaMotorista();
    await criaFecho({
      userId: motorista.id, createdById: admin.id,
      uberAmount: 1000, fuelAmount: 200, status: 'REGISTERED',
    });

    const res = await request(app)
      .get(`/balance/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN));

    expect(res.body.data.balance.available).toBe(800);
  });

  it('um fecho em RASCUNHO nao credita', async () => {
    // O rascunho existe para se preparar a semana e conferir antes de a fechar.
    // Se creditasse, o motorista via dinheiro que ainda podia ser corrigido.
    const motorista = await criaMotorista();
    await criaFecho({
      userId: motorista.id, createdById: admin.id,
      uberAmount: 1000, status: 'DRAFT',
    });

    const res = await request(app)
      .get(`/balance/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN));

    expect(res.body.data.balance.available).toBe(0);
  });

  it('o saldo pode ficar NEGATIVO', async () => {
    // Não é um erro a corrigir com um Math.max(0, ...). A despesa foi real e
    // alguém a pagou; o motorista fica a dever e desconta-se na semana
    // seguinte. Truncar em zero apagava a dívida.
    const motorista = await criaMotorista();
    await criaFecho({
      userId: motorista.id, createdById: admin.id,
      uberAmount: 100, fuelAmount: 400, status: 'REGISTERED',
    });

    const res = await request(app)
      .get(`/balance/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN));

    expect(res.body.data.balance.available).toBe(-300);
  });
});

// ─── Congelamento ─────────────────────────────────────────────────────────────

describe('fecho — valores congelados', () => {
  it('alterar a comissao nas configuracoes nao mexe num fecho ja registado', async () => {
    // O recibo foi emitido com uma percentagem. Se recalcular, o histórico
    // passa a mostrar contas que nunca foram pagas — e um motorista que guarde
    // o recibo antigo vê um número diferente do da aplicação.
    const motorista = await criaMotorista();
    const fecho = await criaFecho({
      userId: motorista.id, createdById: admin.id,
      uberAmount: 1000, commissionRate: 15, status: 'REGISTERED',
    });

    // O estado do PATCH é verificado de propósito: sem isto, o teste passava
    // mesmo que a alteração das configurações tivesse falhado — não teria
    // provado o congelamento, apenas que nada aconteceu.
    const alterou = await request(app)
      .put('/settings')
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ companyCommission: 30 });
    expect(alterou.status).toBe(200);

    const depois = await testDb.weeklySettlement.findUnique({ where: { id: fecho.id } });

    expect(Number(depois!.commissionRate)).toBe(15);
    expect(Number(depois!.commissionAmount)).toBe(150);
    expect(Number(depois!.netToDriver)).toBe(850);
  });

  it('alterar o imposto nas configuracoes nao mexe num fecho ja registado', async () => {
    const motorista = await criaMotorista();
    const fecho = await criaFecho({
      userId: motorista.id, createdById: admin.id,
      uberAmount: 500, boltAmount: 500, taxRate: 6, status: 'REGISTERED',
    });

    const alterou = await request(app)
      .put('/settings')
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ settlementTaxRate: 23 });
    expect(alterou.status).toBe(200);

    const depois = await testDb.weeklySettlement.findUnique({ where: { id: fecho.id } });

    expect(Number(depois!.taxRate)).toBe(6);
    expect(Number(depois!.taxAmount)).toBe(60);
  });
});

// ─── Retiradas ────────────────────────────────────────────────────────────────

describe('retirada — o que impede um pedido', () => {
  it('recusa um pedido acima do saldo disponivel', async () => {
    const motorista = await criaMotorista();
    await criaContaAprovada(motorista.id);
    await criaFecho({
      userId: motorista.id, createdById: admin.id,
      uberAmount: 100, status: 'REGISTERED',
    });

    const res = await request(app)
      .post('/withdrawals')
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .field('amount', '5000')
      // O ficheiro nao vai a lado nenhum: sem credenciais de Cloudinary o
      // uploadToCloudinary devolve uma referencia ficticia em vez de rebentar.
      // Sem isso, este teste recebia 500 do envio falhado em vez do 400 da
      // validacao de saldo — porque o controller envia o ficheiro ANTES de
      // validar o valor.
      .attach('receipt', Buffer.from('recibo'), 'recibo.pdf');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('recusa um pedido sem recibo verde anexado', async () => {
    const motorista = await criaMotorista();
    await criaContaAprovada(motorista.id);
    await criaFecho({ userId: motorista.id, createdById: admin.id, uberAmount: 1000 });

    const res = await request(app)
      .post('/withdrawals')
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .field('amount', '100');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_RECEIPT');
  });
});

describe('retirada — o IBAN de destino', () => {
  it('recusa aprovar sem IBAN aprovado: nao ha destino para a transferencia', async () => {
    const motorista = await criaMotorista();
    await criaFecho({ userId: motorista.id, createdById: admin.id, uberAmount: 1000 });
    const retirada = await criaRetirada({ userId: motorista.id, amount: 100 });

    const res = await request(app)
      .patch(`/withdrawals/${retirada.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BANK_ACCOUNT_REQUIRED');
  });

  it('uma conta apenas PENDENTE nao serve para aprovar', async () => {
    // hasPending não é isUsable. Um IBAN submetido e por decidir não é destino
    // válido — foi por isso que a submissão passou a exigir aprovação.
    const motorista = await criaMotorista();
    await criaContaPendente(motorista.id);
    await criaFecho({ userId: motorista.id, createdById: admin.id, uberAmount: 1000 });
    const retirada = await criaRetirada({ userId: motorista.id, amount: 100 });

    const res = await request(app)
      .patch(`/withdrawals/${retirada.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ status: 'APPROVED' });

    expect(res.body.code).toBe('BANK_ACCOUNT_REQUIRED');
  });

  it('o IBAN CONGELA na aprovacao e nao muda quando o motorista troca de conta', async () => {
    // O teste que mais me interessa desta lista. Se isto partir, uma
    // transferência já decidida muda de destino sem ninguém reparar — e o
    // dinheiro sai para uma conta que ninguém aprovou.
    const motorista = await criaMotorista();
    await criaContaAprovada(motorista.id, { iban: 'PT50003300004567890123437' });
    await criaFecho({ userId: motorista.id, createdById: admin.id, uberAmount: 1000 });
    const retirada = await criaRetirada({ userId: motorista.id, amount: 100 });

    await request(app)
      .patch(`/withdrawals/${retirada.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ status: 'APPROVED' });

    // O motorista muda de banco, e a administração aprova a alteração.
    await testDb.bankAccount.update({
      where: { userId: motorista.id },
      data: { iban: 'PT50001000004567890123438', reviewedAt: new Date() },
    });

    const depois = await testDb.withdrawal.findUnique({ where: { id: retirada.id } });

    expect(depois!.paidToIban).toBe('PT50003300004567890123437');
  });
});

describe('retirada — transicoes de estado', () => {
  it('recusa marcar como paga uma retirada que nunca foi aprovada', async () => {
    // O salto direto saltava por cima do congelamento do IBAN e da
    // classificação do recibo, deixando uma retirada paga sem registo de para
    // onde o dinheiro foi.
    const motorista = await criaMotorista();
    await criaContaAprovada(motorista.id);
    const retirada = await criaRetirada({ userId: motorista.id, status: 'PENDING' });

    const res = await request(app)
      .patch(`/withdrawals/${retirada.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ status: 'PAID' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('APPROVAL_REQUIRED');
  });

  it('recusa mexer numa retirada ja paga', async () => {
    const motorista = await criaMotorista();
    const retirada = await criaRetirada({ userId: motorista.id, status: 'PAID' });

    const res = await request(app)
      .patch(`/withdrawals/${retirada.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ status: 'REJECTED', notes: 'enganei-me' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('exige motivo ao rejeitar', async () => {
    const motorista = await criaMotorista();
    const retirada = await criaRetirada({ userId: motorista.id, status: 'PENDING' });

    const res = await request(app)
      .patch(`/withdrawals/${retirada.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ status: 'REJECTED' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOTES_REQUIRED');
  });
});

// ─── Quem vê o quê ────────────────────────────────────────────────────────────

describe('permissoes — dados bancarios de terceiros', () => {
  it('um motorista NAO ve os dados bancarios de outro', async () => {
    // A única regra desta lista cuja falha não dá erro nenhum: dá dados a quem
    // não devia vê-los, com resposta 200, e ninguém repara.
    const alice = await criaMotorista({ name: 'Alice' });
    const bruno = await criaMotorista({ name: 'Bruno' });
    await criaContaAprovada(bruno.id, { iban: 'PT50001000004567890123438' });

    const res = await request(app)
      .get(`/bank/${bruno.id}`)
      .set(authHeader(alice.id, UserRole.DRIVER));

    // 403 exato e não ">= 403". Um 404 também satisfazia o maior-ou-igual, e
    // foi assim que este teste passou enquanto a aplicação lia de outra base:
    // dizia "recusado" quando na verdade dizia "não encontrei".
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(JSON.stringify(res.body)).not.toContain('PT50001000004567890123438');
  });

  it('um motorista NAO ve o saldo de outro', async () => {
    const alice = await criaMotorista({ name: 'Alice' });
    const bruno = await criaMotorista({ name: 'Bruno' });
    await criaFecho({ userId: bruno.id, createdById: admin.id, uberAmount: 5000 });

    const res = await request(app)
      .get(`/balance/${bruno.id}`)
      .set(authHeader(alice.id, UserRole.DRIVER));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('um motorista NAO aprova a propria retirada', async () => {
    const motorista = await criaMotorista();
    await criaContaAprovada(motorista.id);
    const retirada = await criaRetirada({ userId: motorista.id, status: 'PENDING' });

    const res = await request(app)
      .patch(`/withdrawals/${retirada.id}/status`)
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(403);
  });
});
