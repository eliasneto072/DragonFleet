// src/test/roles.integration.test.ts
//
// O que o MANAGER pode, o que não pode, e as duas maneiras de o sistema ficar
// sem administrador.
//
// A divisão é esta: o MANAGER opera o dia a dia — documentos, fechos,
// retiradas, IBANs, viaturas, notificações, suporte — e o ADMIN mexe nas
// regras e nas pessoas: Configurações, Sociedades, o relatório financeiro e os
// papéis.
//
// O primeiro teste existe por causa de um bug a sério: o users.service.list
// exigia ADMIN, e um MANAGER que já podia aprovar a retirada de alguém levava
// 403 ao tentar ver essa pessoa na lista de Motoristas. Um papel que só
// funciona em metade das telas é pior do que não existir.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader, assertSameDatabase } from './harness';
import { criaMotorista, criaAdmin } from './factories';
import { UserRole } from '../shared/types/enums';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let gestor: Awaited<ReturnType<typeof criaMotorista>>;

async function criaGestor() {
  const u = await criaMotorista({ name: 'Gestor de Teste' });
  return testDb.user.update({ where: { id: u.id }, data: { role: 'MANAGER' } });
}

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  gestor = await criaGestor();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe('o que o MANAGER pode', () => {
  it('a aplicacao e os testes falam com a MESMA base de dados', async () => {
    await assertSameDatabase();
  });

  it('ve a lista de motoristas', async () => {
    await request(app)
      .get('/users')
      .set(authHeader(gestor.id, UserRole.MANAGER))
      .expect(200);
  });

  // Os dois testes seguintes existem porque a primeira versão desta correção
  // arranjou o list e esqueceu os outros métodos do mesmo ficheiro. A tela de
  // Documentos morria com "Erro ao carregar documentos" e nada apontava para a
  // causa: o 403 vinha de /users/all, uma rota que ninguém associa a
  // documentos.
  it('usa a lista completa que alimenta os seletores e a tela de Documentos', async () => {
    await request(app)
      .get('/users/all')
      .set(authHeader(gestor.id, UserRole.MANAGER))
      .expect(200);
  });

  it('abre a ficha de um motorista', async () => {
    const motorista = await criaMotorista();
    await request(app)
      .get(`/users/${motorista.id}`)
      .set(authHeader(gestor.id, UserRole.MANAGER))
      .expect(200);
  });

  it('nao muda as configuracoes do sistema', async () => {
    await request(app)
      .put('/settings')
      .set(authHeader(gestor.id, UserRole.MANAGER))
      .send({ companyCommissionPercent: 50 })
      .expect(403);
  });

  it('nao cria sociedades', async () => {
    await request(app)
      .post('/companies')
      .set(authHeader(gestor.id, UserRole.MANAGER))
      .send({ name: 'Sociedade Nova' })
      .expect(403);
  });

  it('nao muda papeis', async () => {
    const outro = await criaMotorista();
    await request(app)
      .patch(`/users/${outro.id}`)
      .set(authHeader(gestor.id, UserRole.MANAGER))
      .send({ role: 'ADMIN' })
      .expect(403);

    const depois = await testDb.user.findUniqueOrThrow({ where: { id: outro.id } });
    expect(depois.role).toBe('DRIVER');
  });
});

describe('promover e despromover', () => {
  it('o admin promove um motorista a gestao', async () => {
    const motorista = await criaMotorista();

    await request(app)
      .patch(`/users/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ role: 'MANAGER' })
      .expect(200);

    const depois = await testDb.user.findUniqueOrThrow({ where: { id: motorista.id } });
    expect(depois.role).toBe('MANAGER');
  });

  it('promover NAO destroi os dados de motorista', async () => {
    // O aviso na interface diz que os dados ficam guardados. Este teste é o que
    // torna essa frase verdadeira em vez de uma esperança.
    const motorista = await criaMotorista();
    const doc = await testDb.document.create({
      data: {
        type: 'CARTA_CONDUCAO',
        fileUrl: 'https://exemplo.invalido/c.pdf',
        fileKey: 'k',
        status: 'APPROVED',
        userId: motorista.id,
      },
    });

    await request(app)
      .patch(`/users/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ role: 'MANAGER' })
      .expect(200);

    const aindaLa = await testDb.document.findUnique({ where: { id: doc.id } });
    expect(aindaLa).not.toBeNull();
    expect(aindaLa?.userId).toBe(motorista.id);
  });
});

describe('nao ficar sem administrador', () => {
  it('ninguem muda o proprio papel', async () => {
    const res = await request(app)
      .patch(`/users/${admin.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ role: 'MANAGER' });

    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('CANNOT_CHANGE_OWN_ROLE');

    const depois = await testDb.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(depois.role).toBe('ADMIN');
  });

  it('ninguem desativa a propria conta', async () => {
    const res = await request(app)
      .patch(`/users/${admin.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ status: 'INACTIVE' });

    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('CANNOT_DEACTIVATE_SELF');
  });

  it('o ultimo admin ativo nao pode ser despromovido por outro', async () => {
    // Um segundo admin, para haver quem faça o pedido — e depois desativado,
    // deixando o primeiro como único ATIVO. A contagem é de ativos de
    // propósito: um admin desativado não consegue entrar, portanto não serve
    // de saída de emergência.
    const segundo = await criaAdmin();
    await testDb.user.update({ where: { id: segundo.id }, data: { status: 'INACTIVE' } });

    const res = await request(app)
      .patch(`/users/${admin.id}`)
      .set(authHeader(segundo.id, UserRole.ADMIN))
      .send({ role: 'MANAGER' });

    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('LAST_ACTIVE_ADMIN');

    const depois = await testDb.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(depois.role).toBe('ADMIN');
  });

  it('o ultimo admin ativo nao pode ser apagado', async () => {
    const segundo = await criaAdmin();
    await testDb.user.update({ where: { id: segundo.id }, data: { status: 'INACTIVE' } });

    const res = await request(app)
      .delete(`/users/${admin.id}`)
      .set(authHeader(segundo.id, UserRole.ADMIN));

    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('LAST_ACTIVE_ADMIN');

    const aindaLa = await testDb.user.findUnique({ where: { id: admin.id } });
    expect(aindaLa).not.toBeNull();
  });

  it('havendo dois admins ativos, um pode despromover o outro', async () => {
    // A outra metade: a guarda não pode ser tão apertada que impeça o uso
    // normal. Com dois ativos, despromover um é legítimo.
    const segundo = await criaAdmin();

    await request(app)
      .patch(`/users/${admin.id}`)
      .set(authHeader(segundo.id, UserRole.ADMIN))
      .send({ role: 'MANAGER' })
      .expect(200);

    const depois = await testDb.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(depois.role).toBe('MANAGER');
  });
});
