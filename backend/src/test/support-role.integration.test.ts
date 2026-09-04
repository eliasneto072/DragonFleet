// src/test/support-role.integration.test.ts
//
// O papel SUPPORT: vê o que precisa para responder a um ticket, não mexe em
// nada que envolva dinheiro.
//
// A maior parte destes testes verifica RECUSAS, e é de propósito. Este papel
// nasceu de partir em duas as funções que guardavam módulos de dinheiro — as
// mesmas linhas que decidiam quem lê uma retirada decidiam quem a aprova. Um
// `podeVer` escrito onde devia estar `podeGerir` dá aprovação de dinheiro ao
// suporte, e nada na interface o mostraria: o botão aparece, o clique resulta,
// e ninguém dá por isso até alguém verificar as contas.
//
// Por isso cada recusa é testada uma a uma, e não em bloco.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader, assertSameDatabase } from './harness';
import { criaMotorista, criaAdmin } from './factories';
import { UserRole } from '../shared/types/enums';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let suporte: Awaited<ReturnType<typeof criaMotorista>>;
let motorista: Awaited<ReturnType<typeof criaMotorista>>;

const comoSuporte = () => authHeader(suporte.id, UserRole.SUPPORT);

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  motorista = await criaMotorista();
  const s = await criaMotorista({ name: 'Suporte de Teste' });
  suporte = await testDb.user.update({
    where: { id: s.id }, data: { role: 'SUPPORT' },
  }) as typeof s;
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe('SUPPORT — o que vê', () => {
  it('a aplicacao e os testes falam com a MESMA base de dados', async () => {
    await assertSameDatabase();
  });

  it('a lista de motoristas e a ficha de cada um', async () => {
    await request(app).get('/users').set(comoSuporte()).expect(200);
    await request(app).get(`/users/${motorista.id}`).set(comoSuporte()).expect(200);
    await request(app).get('/users/all').set(comoSuporte()).expect(200);
  });

  it('as retiradas', async () => {
    await request(app).get('/withdrawals').set(comoSuporte()).expect(200);
  });

  it('os fechos semanais', async () => {
    await request(app).get('/settlements').set(comoSuporte()).expect(200);
  });

  it('os documentos', async () => {
    await request(app).get('/documents').set(comoSuporte()).expect(200);
  });

  it('os lancamentos', async () => {
    await request(app).get('/earnings').set(comoSuporte()).expect(200);
  });

  it('o saldo de um motorista', async () => {
    await request(app).get(`/balance/${motorista.id}`).set(comoSuporte()).expect(200);
  });

  it('os tickets, que sao o trabalho dele', async () => {
    await request(app).get('/support').set(comoSuporte()).expect(200);
  });
});

describe('SUPPORT — o que NAO pode', () => {
  it('nao aprova nem rejeita uma retirada', async () => {
    const w = await testDb.withdrawal.create({
      data: {
        userId: motorista.id, amount: 5000, status: 'PENDING',
        // Obrigatórios no schema: nenhuma retirada existe sem recibo verde
        // anexado. É a regra do negócio a aparecer no tipo.
        receiptUrl: 'https://exemplo.invalido/recibo.pdf',
        receiptKey: 'teste/recibo',
      },
    });

    await request(app)
      .patch(`/withdrawals/${w.id}/status`)
      .set(comoSuporte())
      .send({ status: 'APPROVED' })
      .expect(403);

    const depois = await testDb.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    expect(depois.status).toBe('PENDING');
  });

  it('nao aprova um IBAN', async () => {
    await request(app)
      .patch(`/bank/${motorista.id}/review`)
      .set(comoSuporte())
      .send({ decision: 'APPROVE' })
      .expect(403);
  });

  it('nao cria um fecho semanal', async () => {
    await request(app)
      .post('/settlements')
      .set(comoSuporte())
      // Payload VÁLIDO de propósito. Com um inválido, o Zod devolve 400 antes
      // de a permissão ser verificada, e o teste passaria a provar que o corpo
      // estava malformado — não que o suporte está barrado.
      // Só o obrigatório: os valores do fecho são todos opcionais no schema.
      .send({ userId: motorista.id, weekStart: '2026-08-17', weekEnd: '2026-08-23' })
      .expect(403);
  });

  it('nao aprova um documento', async () => {
    const doc = await testDb.document.create({
      data: {
        type: 'CARTA_CONDUCAO', fileUrl: 'https://x.invalido/a.pdf',
        fileKey: 'k', status: 'PENDING', userId: motorista.id,
      },
    });

    await request(app)
      .patch(`/documents/${doc.id}/status`)
      .set(comoSuporte())
      .send({ status: 'APPROVED', expiresAt: '2030-01-01T00:00:00.000Z' })
      .expect(403);

    const depois = await testDb.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(depois.status).toBe('PENDING');
  });

  it('nao confirma um lancamento comunicado', async () => {
    const e = await testDb.earning.create({
      data: {
        userId: motorista.id, amount: 5000, platform: 'UBER',
        date: new Date('2026-08-18'), status: 'PENDING',
      },
    });

    await request(app)
      .patch(`/earnings/${e.id}/review`)
      .set(comoSuporte())
      .send({ status: 'APPROVED' })
      .expect(403);

    const depois = await testDb.earning.findUniqueOrThrow({ where: { id: e.id } });
    expect(depois.status).toBe('PENDING');
  });

  it('nao ajusta o saldo de ninguem', async () => {
    await request(app)
      .post(`/balance/${motorista.id}/adjustments`)
      .set(comoSuporte())
      .send({ type: 'CREDIT', amount: 10000, reason: 'porque sim' })
      .expect(403);
  });

  it('nao importa ganhos das plataformas', async () => {
    await request(app)
      .post('/earnings/ingest')
      .set(comoSuporte())
      .send({
        platform: 'UBER', periodStart: '2026-08-17', periodEnd: '2026-08-23',
        rows: [{ driverName: 'Alguém', amount: 100 }],   // min(1)
      })
      .expect(403);
  });

  it('nao muda as configuracoes nem os papeis', async () => {
    await request(app).put('/settings').set(comoSuporte())
      .send({ companyCommissionPercent: 1 }).expect(403);

    await request(app).patch(`/users/${motorista.id}`).set(comoSuporte())
      .send({ role: 'ADMIN' }).expect(403);
  });

  it('nao ve as analises nem o relatorio financeiro', async () => {
    await request(app).get('/analytics/stats').set(comoSuporte()).expect(403);
  });

  it('nao gere viaturas', async () => {
    // Passava com 201 antes de o service ser corrigido. A condição de criar
    // viaturas aceitava "para mim", regra que existe para o motorista registar
    // o seu carro, e o suporte entrava por aí.
    await request(app).post('/vehicles').set(comoSuporte())
      .send({ brand: 'Renault', model: 'Clio', plate: 'AA-00-BB', year: 2020 })
      .expect(403);

    const criadas = await testDb.vehicle.count({ where: { plate: 'AA-00-BB' } });
    expect(criadas).toBe(0);
  });

  it('nao envia notificacoes', async () => {
    await request(app).post('/notifications').set(comoSuporte())
      // O userId vai no corpo: o controller verifica-o à mão antes do schema
      // e antes da permissão, e sem ele o 403 nunca chega a ser alcançado.
      .send({ userId: motorista.id, title: 'Olá', message: 'teste' })
      .expect(403);
  });
});

describe('SUPPORT — o IBAN', () => {
  it('ve apenas os ultimos quatro digitos', async () => {
    const IBAN = 'PT50000201231234567890154';
    await testDb.bankAccount.create({
      data: { userId: motorista.id, iban: IBAN, holderName: 'Motorista Teste' },
    });

    const res = await request(app)
      .get(`/bank/${motorista.id}`)
      .set(comoSuporte())
      .expect(200);

    // ok(res, { account }) envolve tudo: { ok: true, data: { account } }.
    const visto: string = res.body.data.account.iban;
    expect(visto).not.toBe(IBAN);
    expect(visto).toContain('0154');   // os últimos quatro, para confirmar
    expect(visto).toContain('•');      // o resto escondido
  });

  it('o ADMIN continua a ver o IBAN inteiro', async () => {
    // A outra metade: a máscara não pode alastrar a quem faz as transferências.
    const IBAN = 'PT50000201231234567890154';
    await testDb.bankAccount.create({
      data: { userId: motorista.id, iban: IBAN, holderName: 'Motorista Teste' },
    });

    const res = await request(app)
      .get(`/bank/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .expect(200);

    // ok(res, { account }) envolve tudo: { ok: true, data: { account } }.
    const visto: string = res.body.data.account.iban;
    expect(visto).toBe(IBAN);
  });

  it('o proprio motorista continua a ver o seu', async () => {
    const IBAN = 'PT50000201231234567890154';
    await testDb.bankAccount.create({
      data: { userId: motorista.id, iban: IBAN, holderName: 'Motorista Teste' },
    });

    const res = await request(app)
      .get(`/bank/${motorista.id}`)
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .expect(200);

    // ok(res, { account }) envolve tudo: { ok: true, data: { account } }.
    const visto: string = res.body.data.account.iban;
    expect(visto).toBe(IBAN);
  });
});
