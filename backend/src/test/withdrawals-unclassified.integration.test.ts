// src/test/withdrawals-unclassified.integration.test.ts
//
// A contagem de retiradas sem sociedade registada.
//
// ─── PORQUE ESTE FICHEIRO EXISTE ─────────────────────────────────────────────
//
// A tela dos Recibos Verdes contava as retiradas sem sociedade percorrendo a
// PAGINA carregada. Com 25 por pagina, o aviso anunciava "22 retiradas sem
// sociedade registada" quando a base tinha 2000.
//
// Nada falhava. O numero aparecia, era plausivel, e estava errado por duas
// ordens de grandeza. E o pior tipo de numero errado: subestima trabalho
// pendente. Quem lia fechava a tela a pensar que faltavam vinte e dois recibos
// para classificar, e faltavam dois mil.
//
// O teste que apanha isto tem de criar MAIS registos do que caibam numa pagina.
// Um teste com tres retiradas passa com a implementacao errada.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaMotorista, criaAdmin, criaRetirada } from './factories';
import { UserRole } from '../shared/types/enums';
import { UNCLASSIFIED } from '../modules/withdrawals/withdrawals.repository';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let motorista: Awaited<ReturnType<typeof criaMotorista>>;

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  motorista = await criaMotorista({ name: 'Monica Condutora' });
});

afterAll(async () => {
  await testDb.$disconnect();
});

const listar = (query: Record<string, string> = {}) =>
  request(app)
    .get('/withdrawals')
    .query(query)
    .set(authHeader(admin.id, UserRole.ADMIN));

describe('contagem das retiradas sem sociedade', () => {
  it('conta a BASE INTEIRA e nao a pagina', async () => {
    // Trinta, para passarem da primeira pagina de 25. Com menos do que isso a
    // implementacao antiga tambem acertava, e o teste nao provava nada.
    for (let i = 0; i < 30; i++) {
      await criaRetirada({ userId: motorista.id, status: 'PAID', amount: 50 });
    }

    const r = await listar({ pageSize: '25' }).expect(200);

    expect(r.body.data.withdrawals).toHaveLength(25);
    expect(r.body.data.page.total).toBe(30);

    // O numero que o aviso mostra. A versao antiga devolvia 25 aqui — as da
    // pagina — e nao 30.
    expect(r.body.data.totals.unclassified).toBe(30);
  });

  it('nao conta as que ja tem sociedade registada', async () => {
    const empresa = await testDb.company.create({ data: { name: 'Sociedade Teste' } });

    const classificada = await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await criaRetirada({ userId: motorista.id, status: 'PAID' });

    await testDb.withdrawal.update({
      where: { id: classificada.id },
      data: { companyId: empresa.id, companySetAt: new Date() },
    });

    const r = await listar().expect(200);
    expect(r.body.data.totals.unclassified).toBe(2);
  });

  it('respeita o filtro de estado', async () => {
    await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await criaRetirada({ userId: motorista.id, status: 'PENDING' });

    // A contagem tem de viver dentro do mesmo filtro da lista. Se ignorasse o
    // estado, o aviso falaria de pendentes que ainda nem geram recibo.
    const r = await listar({ status: 'PAID' }).expect(200);
    expect(r.body.data.page.total).toBe(1);
    expect(r.body.data.totals.unclassified).toBe(1);
  });

  it('respeita a pesquisa por nome', async () => {
    const outro = await criaMotorista({ name: 'Segundo Condutor' });
    await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await criaRetirada({ userId: outro.id, status: 'PAID' });
    await criaRetirada({ userId: outro.id, status: 'PAID' });

    const r = await listar({ search: 'Segundo' }).expect(200);
    expect(r.body.data.totals.unclassified).toBe(2);
  });

  it('zero quando estao todas classificadas', async () => {
    const empresa = await testDb.company.create({ data: { name: 'Sociedade Teste' } });
    const w = await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await testDb.withdrawal.update({
      where: { id: w.id },
      data: { companyId: empresa.id, companySetAt: new Date() },
    });

    const r = await listar().expect(200);
    expect(r.body.data.totals.unclassified).toBe(0);
  });

  it('o motorista so conta as proprias', async () => {
    const outro = await criaMotorista({ name: 'Segundo Condutor' });
    await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await criaRetirada({ userId: outro.id, status: 'PAID' });

    const r = await request(app)
      .get('/withdrawals')
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .expect(200);

    expect(r.body.data.totals.unclassified).toBe(1);
  });
});

describe('filtro de sociedade — no servidor', () => {
  // ─── O BUG QUE ESTES TESTES FECHAM ────────────────────────────────────────
  //
  // O filtro estava no cliente: a tela pedia uma pagina de 25 e filtrava-a em
  // memoria, enquanto o pager continuava a contar o total sem filtro.
  //
  // Escolher uma sociedade com dois recibos mostrava ZERO linhas, com o pager a
  // dizer "1-25 de 2004". Os dois estavam em alguma das 81 paginas. O filtro
  // parecia nao fazer nada, e nao havia erro nenhum a explicar porque.
  //
  // O teste que apanha isto tem de ter MAIS registos do que uma pagina, e a
  // sociedade procurada tem de estar FORA da primeira.

  it('encontra os recibos de uma sociedade que estao fora da primeira pagina', async () => {
    const empresa = await testDb.company.create({ data: { name: 'Renas e Elfos' } });

    // Trinta sem sociedade primeiro, para empurrar os dois seguintes para fora
    // da pagina inicial de 25.
    for (let i = 0; i < 30; i++) {
      await criaRetirada({ userId: motorista.id, status: 'PAID', amount: 10 });
    }

    for (let i = 0; i < 2; i++) {
      const w = await criaRetirada({ userId: motorista.id, status: 'PAID', amount: 225 });
      await testDb.withdrawal.update({
        where: { id: w.id },
        data: { companyId: empresa.id, companySetAt: new Date() },
      });
    }

    const r = await listar({ companyId: empresa.id, pageSize: '25' }).expect(200);

    // Antes: zero linhas e page.total = 32.
    expect(r.body.data.withdrawals).toHaveLength(2);
    expect(r.body.data.page.total).toBe(2);
  });

  it('o pager conta o conjunto FILTRADO e nao o total', async () => {
    const empresa = await testDb.company.create({ data: { name: 'Uma So' } });
    for (let i = 0; i < 10; i++) {
      await criaRetirada({ userId: motorista.id, status: 'PAID' });
    }
    const w = await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await testDb.withdrawal.update({
      where: { id: w.id },
      data: { companyId: empresa.id, companySetAt: new Date() },
    });

    const semFiltro = await listar().expect(200);
    const comFiltro = await listar({ companyId: empresa.id }).expect(200);

    expect(semFiltro.body.data.page.total).toBe(11);
    expect(comFiltro.body.data.page.total).toBe(1);
  });

  it('o valor especial apanha as que estao por classificar', async () => {
    const empresa = await testDb.company.create({ data: { name: 'Classificada' } });
    const w = await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await testDb.withdrawal.update({
      where: { id: w.id },
      data: { companyId: empresa.id, companySetAt: new Date() },
    });
    await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await criaRetirada({ userId: motorista.id, status: 'PAID' });

    const r = await listar({ companyId: UNCLASSIFIED }).expect(200);
    expect(r.body.data.page.total).toBe(2);
  });

  it('o aviso das por classificar IGNORA o filtro de sociedade', async () => {
    const empresa = await testDb.company.create({ data: { name: 'Renas e Elfos' } });
    const w = await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await testDb.withdrawal.update({
      where: { id: w.id },
      data: { companyId: empresa.id, companySetAt: new Date() },
    });
    await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await criaRetirada({ userId: motorista.id, status: 'PAID' });

    const r = await listar({ companyId: empresa.id }).expect(200);

    // A lista mostra o recibo dessa sociedade...
    expect(r.body.data.page.total).toBe(1);

    // ...mas o aviso continua a contar o trabalho pendente TODO. Se respeitasse
    // o filtro, dava zero e quem lesse pensava que nao havia nada a classificar.
    expect(r.body.data.totals.unclassified).toBe(2);
  });

  it('combina com a pesquisa por nome', async () => {
    const empresa = await testDb.company.create({ data: { name: 'Ambas' } });
    const outro = await criaMotorista({ name: 'Segundo Condutor' });

    for (const uid of [motorista.id, outro.id]) {
      const w = await criaRetirada({ userId: uid, status: 'PAID' });
      await testDb.withdrawal.update({
        where: { id: w.id },
        data: { companyId: empresa.id, companySetAt: new Date() },
      });
    }

    const r = await listar({ companyId: empresa.id, search: 'Segundo' }).expect(200);
    expect(r.body.data.page.total).toBe(1);
  });

  it('o motorista nao filtra por sociedade — o parametro e ignorado', async () => {
    const empresa = await testDb.company.create({ data: { name: 'Alheia' } });
    await criaRetirada({ userId: motorista.id, status: 'PAID' });

    const r = await request(app)
      .get('/withdrawals')
      .query({ companyId: empresa.id })
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .expect(200);

    // Continua a ver a propria, em vez de uma lista vazia por causa de um
    // filtro que nao lhe diz nada.
    expect(r.body.data.page.total).toBe(1);
  });
});
