// src/test/expenses.integration.test.ts
//
// Prio e Via Verde, da tabela do portal ao fecho, contra Postgres.
//
// As linhas destes testes imitam o TEXTO CRU que a extensão envia — com as
// datas, valores e descrições tal como aparecem nas capturas do cliente.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaMotorista, criaAdmin } from './factories';
import { UserRole } from '../shared/types/enums';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let ana: Awaited<ReturnType<typeof criaMotorista>>;
let bruno: Awaited<ReturnType<typeof criaMotorista>>;

const t = (iso: string) => new Date(iso);

async function carro(plate: string) {
  return testDb.vehicle.create({ data: { brand: 'Toyota', model: 'Corolla', plate, year: 2022 } });
}

async function atribui(vehicleId: string, userId: string, desde: string, ate: string | null = null) {
  return testDb.vehicleAssignment.create({
    data: { vehicleId, userId, startedAt: t(desde), endedAt: ate ? t(ate) : null },
  });
}

const comoAdmin = () => authHeader(admin.id, UserRole.ADMIN);

const envia = (source: 'PRIO' | 'VIA_VERDE', rows: object[], rota = '/expenses/ingest') =>
  request(app).post(rota).set(comoAdmin()).send({ source, rows });

// Linhas no formato das capturas.
const prio = (o: Partial<Record<string, string>> = {}) => ({
  date: '23/09/2026\n14:02', card: '7824000011112222\nXY-27-QZ',
  station: 'CD Cascais Torre', fuel: 'ECO DIESEL', amount: '29,74€',
  status: 'Ativo', receipt: '45615', ...o,
});

const vv = (o: Partial<Record<string, string>> = {}) => ({
  identifier: '601000000011', plate: 'XY-27-QZ',
  description: 'Pontinha >> Belas PV\n2026-09-15 09:23:20 > 2026-09-15 09:26:23',
  amount: '1,00 €', status: 'Pendente', ...o,
});

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  ana = await criaMotorista({ name: 'Ana Condutora' });
  bruno = await criaMotorista({ name: 'Bruno Condutor' });
});

afterAll(async () => { await testDb.$disconnect(); });

describe('quem pode', () => {
  it('motorista nao importa nem ve despesas', async () => {
    await request(app).post('/expenses/ingest/preview')
      .set(authHeader(ana.id, UserRole.DRIVER)).send({ source: 'PRIO', rows: [prio()] }).expect(403);
  });

  it('sem sessao, 401', async () => {
    await request(app).post('/expenses/ingest/preview').send({ source: 'PRIO', rows: [prio()] }).expect(401);
  });
});

describe('pre-visualizar nao grava', () => {
  it('devolve o resumo e deixa a base intacta', async () => {
    const r = await envia('PRIO', [prio()], '/expenses/ingest/preview').expect(200);
    expect(r.body.data.total).toBe(1);
    expect(await testDb.expenseMovement.count()).toBe(0);
  });
});

describe('Prio — o cartao vai com o motorista', () => {
  it('cartao associado a um motorista vai para ele', async () => {
    await testDb.fuelCard.create({ data: { number: '7824000011112222', userId: ana.id } });

    const r = await envia('PRIO', [prio()]).expect(201);

    expect(r.body.data.matched).toBe(1);
    const m = await testDb.expenseMovement.findFirstOrThrow();
    expect(m.userId).toBe(ana.id);
    expect(m.matchedBy).toBe('CARD');
    expect(Number(m.amount)).toBe(29.74);
    expect(m.category).toBe('FUEL');
  });

  it('o cartao ganha a matricula — mesmo que o carro esteja com outro', async () => {
    // Decisao do cliente: o cartao vai com a PESSOA.
    const v = await carro('XY-27-QZ');
    await atribui(v.id, bruno.id, '2026-09-01T00:00:00Z');
    await testDb.fuelCard.create({ data: { number: '7824000011112222', userId: ana.id } });

    await envia('PRIO', [prio()]).expect(201);
    expect((await testDb.expenseMovement.findFirstOrThrow()).userId).toBe(ana.id);
  });

  it('cartao associado a um VEICULO vai para quem tinha o carro nesse instante', async () => {
    // A outra hipotese — se se descobrir que o cartao fica no carro, basta
    // mudar a associacao no painel, e isto passa a ser o que acontece.
    const v = await carro('XY-27-QZ');
    await atribui(v.id, bruno.id, '2026-09-01T00:00:00Z');
    await testDb.fuelCard.create({ data: { number: '7824000011112222', vehicleId: v.id } });

    await envia('PRIO', [prio()]).expect(201);
    const m = await testDb.expenseMovement.findFirstOrThrow();
    expect(m.userId).toBe(bruno.id);
    expect(m.matchedBy).toBe('CARD');
  });

  it('cartao desconhecido cai para a matricula da mesma celula', async () => {
    const v = await carro('XY-27-QZ');
    await atribui(v.id, ana.id, '2026-09-01T00:00:00Z');

    await envia('PRIO', [prio()]).expect(201);
    const m = await testDb.expenseMovement.findFirstOrThrow();
    expect(m.userId).toBe(ana.id);
    expect(m.matchedBy).toBe('PLATE');
  });

  it('a Prio desconta na PROPRIA semana', async () => {
    await testDb.fuelCard.create({ data: { number: '7824000011112222', userId: ana.id } });
    await envia('PRIO', [prio()]).expect(201); // 23/09/2026, quarta
    const m = await testDb.expenseMovement.findFirstOrThrow();
    expect(m.settlementWeek.toISOString().slice(0, 10)).toBe('2026-09-21');
  });
});

describe('Via Verde — pela matricula, e a semana seguinte', () => {
  it('a portagem vai para quem tinha o carro no instante', async () => {
    const v = await carro('XY-27-QZ');
    await atribui(v.id, ana.id, '2026-09-01T00:00:00Z');

    const r = await envia('VIA_VERDE', [vv()]).expect(201);
    expect(r.body.data.matched).toBe(1);

    const m = await testDb.expenseMovement.findFirstOrThrow();
    expect(m.userId).toBe(ana.id);
    expect(m.category).toBe('TOLL');
    expect(m.description).toBe('Pontinha >> Belas PV');
  });

  it('o carro mudou de maos: cada portagem vai para quem o tinha na hora', async () => {
    const v = await carro('XY-27-QZ');
    await atribui(v.id, ana.id, '2026-09-01T00:00:00Z', '2026-09-16T12:00:00Z');
    await atribui(v.id, bruno.id, '2026-09-16T12:00:00Z');

    await envia('VIA_VERDE', [
      vv({ description: 'A >> B 2026-09-15 10:00:00' }),
      vv({ description: 'C >> D 2026-09-17 10:00:00' }),
    ]).expect(201);

    const linhas = await testDb.expenseMovement.findMany({ orderBy: { occurredAt: 'asc' } });
    expect(linhas.map((l) => l.userId)).toEqual([ana.id, bruno.id]);
  });

  it('desconta no fecho da semana SEGUINTE', async () => {
    const v = await carro('XY-27-QZ');
    await atribui(v.id, ana.id, '2026-09-01T00:00:00Z');
    await envia('VIA_VERDE', [vv()]).expect(201); // 15/09, semana de 14 a 20
    const m = await testDb.expenseMovement.findFirstOrThrow();
    expect(m.settlementWeek.toISOString().slice(0, 10)).toBe('2026-09-21');
  });

  it('a mensalidade e os cancelados entram mas nao se descontam', async () => {
    const v = await carro('XY-27-QZ');
    await atribui(v.id, ana.id, '2026-09-01T00:00:00Z');

    await envia('VIA_VERDE', [
      vv({ description: 'Mensalidade VV Mobilidade Mensal 2026-09-15 08:04:14', amount: '1,49 €' }),
      vv({ description: 'X >> Y 2026-09-15 11:00:00', status: 'Cancelado' }),
      vv({ description: 'Z >> W 2026-09-15 12:00:00', amount: '0,75 €' }),
    ]).expect(201);

    const linhas = await testDb.expenseMovement.findMany({ orderBy: { occurredAt: 'asc' } });
    expect(linhas.map((l) => [l.category, l.chargeable])).toEqual([
      ['FEE', false], ['TOLL', false], ['TOLL', true],
    ]);
  });
});

describe('o que nao emparelha e o que nao se le', () => {
  it('matricula desconhecida grava sem motorista e aparece na fila', async () => {
    await envia('VIA_VERDE', [vv({ plate: 'ZZ-99-ZZ' })]).expect(201);

    const r = await request(app).get('/expenses/unmatched').set(comoAdmin()).expect(200);
    expect(r.body.data.movements).toHaveLength(1);
    expect(r.body.data.movements[0].userId).toBeNull();
  });

  it('carro sem ninguem atribuido nesse instante tambem fica por emparelhar', async () => {
    const v = await carro('XY-27-QZ');
    await atribui(v.id, ana.id, '2026-09-20T00:00:00Z'); // so depois da portagem
    const r = await envia('VIA_VERDE', [vv()]).expect(201);
    expect(r.body.data.unmatched).toBe(1);
  });

  it('linhas ilegiveis sao devolvidas com o motivo, nao descartadas', async () => {
    const r = await envia('PRIO', [prio(), prio({ amount: 'A aguardar fatura', receipt: 'x' })]).expect(201);
    expect(r.body.data.invalid).toHaveLength(1);
    expect(r.body.data.invalid[0].reason).toMatch(/Valor/);
  });
});

describe('reenviar nao duplica', () => {
  it('a mesma tabela duas vezes grava uma', async () => {
    await testDb.fuelCard.create({ data: { number: '7824000011112222', userId: ana.id } });

    const a = await envia('PRIO', [prio()]).expect(201);
    const b = await envia('PRIO', [prio()]).expect(201);

    expect(a.body.data.inserted).toBe(1);
    expect(b.body.data.inserted).toBe(0);
    expect(b.body.data.duplicates).toBe(1);
    expect(await testDb.expenseMovement.count()).toBe(1);
  });
});

describe('para o formulario do fecho', () => {
  it('traz a Prio da semana e a Via Verde da anterior, e soma so as descontaveis', async () => {
    const v = await carro('XY-27-QZ');
    await atribui(v.id, ana.id, '2026-09-01T00:00:00Z');
    await testDb.fuelCard.create({ data: { number: '7824000011112222', userId: ana.id } });

    await envia('PRIO', [prio()]).expect(201);                            // 23/09 → fecho 21/09
    await envia('VIA_VERDE', [
      vv(),                                                                // 15/09 → fecho 21/09
      vv({ description: 'Mensalidade VV 2026-09-16 08:00:00', amount: '1,49 €' }), // nao desconta
      vv({ description: 'Q >> R 2026-09-22 10:00:00' }),                   // 22/09 → fecho 28/09
    ]).expect(201);

    const r = await request(app)
      .get('/expenses/for-settlement').query({ userId: ana.id, weekStart: '2026-09-21' })
      .set(comoAdmin()).expect(200);

    const d = r.body.data;
    expect(d.fuel.chargeableTotal).toBe(29.74);
    expect(d.tolls.movements).toHaveLength(2);        // a portagem e a mensalidade
    expect(d.tolls.chargeableTotal).toBe(1);          // so a portagem
    expect(d.tolls.range).toEqual({ from: '2026-09-14', to: '2026-09-20' });
  });
});

describe('revisao a mao', () => {
  it('atribui um movimento por emparelhar a um motorista', async () => {
    await envia('VIA_VERDE', [vv({ plate: 'ZZ-99-ZZ' })]).expect(201);
    const m = await testDb.expenseMovement.findFirstOrThrow();

    await request(app).patch(`/expenses/movements/${m.id}`).set(comoAdmin())
      .send({ userId: ana.id }).expect(200);

    const depois = await testDb.expenseMovement.findUniqueOrThrow({ where: { id: m.id } });
    expect(depois.userId).toBe(ana.id);
    expect(depois.matchedBy).toBe('MANUAL');
  });

  it('recusa mexer num movimento cujo fecho ja foi registado', async () => {
    const v = await carro('XY-27-QZ');
    await atribui(v.id, ana.id, '2026-09-01T00:00:00Z');
    await envia('VIA_VERDE', [vv()]).expect(201);
    const m = await testDb.expenseMovement.findFirstOrThrow();

    await testDb.weeklySettlement.create({
      data: {
        userId: ana.id, createdById: admin.id, status: 'REGISTERED',
        weekStart: t('2026-09-21T00:00:00Z'), weekEnd: t('2026-09-27T00:00:00Z'),
        grossRevenue: 0, commissionRate: 0, commissionAmount: 0,
        totalDeductions: 0, profitBase: 0, netToDriver: 0,
      },
    });

    const r = await request(app).patch(`/expenses/movements/${m.id}`).set(comoAdmin())
      .send({ chargeable: false }).expect(400);
    expect(r.body.code).toBe('SETTLEMENT_REGISTERED');
  });
});

describe('cartoes', () => {
  it('cria, e recusa o mesmo numero duas vezes', async () => {
    await request(app).post('/expenses/cards').set(comoAdmin())
      .send({ number: '7824 0000 1111 2222', userId: ana.id }).expect(201);
    const r = await request(app).post('/expenses/cards').set(comoAdmin())
      .send({ number: '7824000011112222', userId: bruno.id }).expect(409);
    expect(r.body.code).toBe('CARD_EXISTS');
  });

  it('recusa um cartao com motorista E veiculo', async () => {
    const v = await carro('XY-27-QZ');
    const r = await request(app).post('/expenses/cards').set(comoAdmin())
      .send({ number: '7824000011112222', userId: ana.id, vehicleId: v.id }).expect(400);
    expect(r.body.code).toBe('CARD_TWO_OWNERS');
  });

  it('motorista nao ve os cartoes', async () => {
    await request(app).get('/expenses/cards').set(authHeader(ana.id, UserRole.DRIVER)).expect(403);
  });

  it('corrige o numero de um cartao mal escrito', async () => {
    const r = await request(app).post('/expenses/cards').set(comoAdmin())
      .send({ number: '7824000011112229', userId: ana.id }).expect(201);
    await request(app).patch(`/expenses/cards/${r.body.data.card.id}`).set(comoAdmin())
      .send({ number: '7824000011112222', userId: ana.id }).expect(200);

    const c = await testDb.fuelCard.findUniqueOrThrow({ where: { id: r.body.data.card.id } });
    expect(c.number).toBe('7824000011112222');
  });

  it('apaga um cartao, liberta o numero, e o que ja foi importado fica', async () => {
    const r = await request(app).post('/expenses/cards').set(comoAdmin())
      .send({ number: '7824000011112222', userId: ana.id }).expect(201);
    await envia('PRIO', [prio()]).expect(201);

    await request(app).delete(`/expenses/cards/${r.body.data.card.id}`).set(comoAdmin()).expect(204);

    expect(await testDb.fuelCard.count()).toBe(0);
    const m = await testDb.expenseMovement.findFirstOrThrow();
    expect(m.userId).toBe(ana.id);
    // O numero ficou livre: pode ser registado outra vez, noutra pessoa.
    await request(app).post('/expenses/cards').set(comoAdmin())
      .send({ number: '7824000011112222', userId: bruno.id }).expect(201);
  });

  it('motorista nao apaga cartoes', async () => {
    const c = await testDb.fuelCard.create({ data: { number: '7824000011112222', userId: ana.id } });
    await request(app).delete(`/expenses/cards/${c.id}`).set(authHeader(ana.id, UserRole.DRIVER)).expect(403);
    expect(await testDb.fuelCard.count()).toBe(1);
  });
});
