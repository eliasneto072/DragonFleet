// src/test/permissions.integration.test.ts
//
// Permissões por pessoa e por área.
//
// Uma permissão que só existe no menu não é uma permissão — é uma sugestão.
// Quase todos os testes deste ficheiro chamam a API diretamente, a fingir que
// alguém escreveu o endereço à mão, porque é assim que uma permissão só de
// interface se descobre ser falsa.
//
// Os dois que mais interessam:
//   • o ADMIN não se consegue trancar fora do sistema;
//   • quem não tem nada configurado continua a ver exatamente o que via, para
//     este deploy não mudar nada para ninguém no dia em que entra.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaAdmin, criaMotorista } from './factories';
import { UserRole } from '../shared/types/enums';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
const asAdmin = () => authHeader(admin.id, UserRole.ADMIN);

async function criaEquipa(role: 'MANAGER' | 'SUPPORT', nome = 'Colaborador') {
  const u = await testDb.user.create({
    data: {
      name: nome,
      email: `equipa-${Math.random().toString(36).slice(2, 10)}@teste.local`,
      password: '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQR',
      role, status: 'ACTIVE',
    },
  });
  return { user: u, header: () => authHeader(u.id, role as UserRole) };
}

/** Define as permissões de alguém pela API, como a tela da Equipa faz. */
function defineAcessos(userId: string, grants: Record<string, string>) {
  return request(app).put(`/permissions/${userId}`).set(asAdmin()).send({ grants });
}

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('O administrador não se tranca fora', () => {
  it('tem tudo, mesmo sem nada configurado', async () => {
    const res = await request(app).get('/permissions/mine').set(asAdmin()).expect(200);
    const grants = res.body.data.grants;
    expect(Object.values(grants).every((v) => v === 'MANAGE')).toBe(true);
  });

  it('não se deixa guardar permissões para um administrador', async () => {
    const outro = await criaAdmin();
    const res = await defineAcessos(outro.id, { SETTINGS: 'NONE' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ADMIN_HAS_EVERYTHING');
  });

  it('continua a entrar em todo o lado depois de mexer nas permissões de outros', async () => {
    const gestor = await criaEquipa('MANAGER');
    await defineAcessos(gestor.user.id, { SETTINGS: 'NONE', FINANCIAL: 'NONE' }).expect(200);

    await request(app).get('/settings').set(asAdmin()).expect(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Sem configuração, nada muda', () => {
  it('o gestor continua a ver o que via', async () => {
    const gestor = await criaEquipa('MANAGER');
    const res = await request(app).get('/permissions/mine').set(gestor.header()).expect(200);
    const g = res.body.data.grants;

    expect(g.SETTLEMENTS).toBe('MANAGE');
    expect(g.FLEET).toBe('MANAGE');
    // As três que ele nunca viu.
    expect(g.SETTINGS).toBe('NONE');
    expect(g.TEAM).toBe('NONE');
    expect(g.GREEN_RECEIPTS).toBe('NONE');
  });

  it('o suporte continua a ver o que via', async () => {
    const suporte = await criaEquipa('SUPPORT');
    const res = await request(app).get('/permissions/mine').set(suporte.header()).expect(200);
    const g = res.body.data.grants;

    expect(g.SUPPORT).toBe('MANAGE');
    expect(g.DRIVERS).toBe('VIEW');
    expect(g.FINANCIAL).toBe('VIEW');
    expect(g.SETTLEMENTS).toBe('NONE');
    expect(g.FLEET).toBe('NONE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('A guarda é do servidor, não do menu', () => {
  it('sem a área, a API recusa mesmo escrevendo o endereço à mão', async () => {
    const gestor = await criaEquipa('MANAGER');
    await defineAcessos(gestor.user.id, { SETTLEMENTS: 'MANAGE' }).expect(200);

    // Tem faturação...
    await request(app).get('/settlements').set(gestor.header()).expect(200);

    // ...e mais nada.
    const financeiro = await request(app).get('/withdrawals').set(gestor.header());
    expect(financeiro.status).toBe(403);
    expect(financeiro.body.code).toBe('AREA_FORBIDDEN');

    await request(app).get('/vehicles').set(gestor.header()).expect(403);
    await request(app).get('/analytics/overview').set(gestor.header()).expect(403);
  });

  it('VER não deixa ALTERAR', async () => {
    const gestor = await criaEquipa('MANAGER');
    await defineAcessos(gestor.user.id, { SETTINGS: 'VIEW' }).expect(200);

    await request(app).get('/settings').set(gestor.header()).expect(200);

    // O serviço das configurações já exigia ADMIN para escrever; o que
    // interessa é que a leitura passou e a escrita não.
    const escrita = await request(app).patch('/settings')
      .set(gestor.header()).send({ commissionRate: 30 });
    expect(escrita.status).toBeGreaterThanOrEqual(403);
  });

  it('configurar UMA área não deixa herdar as outras do papel', async () => {
    // Um gestor via quase tudo. Configurar-lhe só a faturação tem de lhe
    // tirar o resto — senão uma configuração parcial abria acessos que
    // ninguém escolheu.
    const gestor = await criaEquipa('MANAGER');
    await defineAcessos(gestor.user.id, { SETTLEMENTS: 'MANAGE' }).expect(200);

    const res = await request(app).get('/permissions/mine').set(gestor.header());
    expect(res.body.data.grants.FLEET).toBe('NONE');
    expect(res.body.data.grants.DRIVERS).toBe('NONE');
  });

  it('tirar o acesso faz efeito já, sem novo login', async () => {
    const gestor = await criaEquipa('MANAGER');
    await request(app).get('/vehicles').set(gestor.header()).expect(200);

    await defineAcessos(gestor.user.id, { FLEET: 'NONE', DRIVERS: 'VIEW' }).expect(200);

    // O MESMO token de antes.
    await request(app).get('/vehicles').set(gestor.header()).expect(403);
  });

  it('voltar ao padrão devolve o que o papel dava', async () => {
    const gestor = await criaEquipa('MANAGER');
    await defineAcessos(gestor.user.id, { SETTLEMENTS: 'MANAGE' }).expect(200);
    await request(app).get('/vehicles').set(gestor.header()).expect(403);

    await request(app).delete(`/permissions/${gestor.user.id}`).set(asAdmin()).expect(200);
    await request(app).get('/vehicles').set(gestor.header()).expect(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Quem não é da equipa não é tocado', () => {
  it('o motorista continua a ver as coisas dele', async () => {
    const motorista = await criaMotorista();
    const h = authHeader(motorista.id, UserRole.DRIVER);

    // Rotas guardadas por áreas que ele não tem — e às quais tem de continuar
    // a chegar, porque são as dele.
    await request(app).get('/documents').set(h).expect(200);
    await request(app).get('/notifications').set(h).expect(200);
    await request(app).get('/bank/me').set(h).expect(200);
  });

  it('o registo público de um motorista continua a funcionar', async () => {
    // A guarda de área está montada por cima do /users, e o registo não leva
    // sessão nenhuma. Se ela respondesse 401 a quem não está autenticado,
    // ninguém se conseguia registar.
    const res = await request(app).post('/users').send({
      name: 'Motorista Novo',
      email: `novo-${Math.random().toString(36).slice(2, 8)}@teste.local`,
      password: 'palavra-passe-segura',
    });
    expect(res.status).toBeLessThan(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Quem gere as permissões', () => {
  it('só o administrador', async () => {
    const gestor = await criaEquipa('MANAGER');
    const outro = await criaEquipa('SUPPORT');

    await request(app).get('/permissions/staff').set(gestor.header()).expect(403);
    await request(app).put(`/permissions/${outro.user.id}`)
      .set(gestor.header()).send({ grants: { SETTINGS: 'MANAGE' } }).expect(403);
  });

  it('não se definem permissões a um motorista', async () => {
    const motorista = await criaMotorista();
    const res = await defineAcessos(motorista.id, { DRIVERS: 'VIEW' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_STAFF');
  });

  it('qualquer pessoa da equipa consulta o catálogo e o que ela própria pode', async () => {
    const suporte = await criaEquipa('SUPPORT');
    const cat = await request(app).get('/permissions/catalog').set(suporte.header()).expect(200);
    expect(cat.body.data.areas.length).toBe(16);
    expect(cat.body.data.groups.length).toBeGreaterThan(0);

    await request(app).get('/permissions/mine').set(suporte.header()).expect(200);
  });

  it('as permissões vêm no /auth/me, para o menu não piscar', async () => {
    const gestor = await criaEquipa('MANAGER');
    const res = await request(app).get('/auth/me').set(gestor.header()).expect(200);
    expect(res.body.data.user?.permissions ?? res.body.data.permissions).toBeTruthy();
  });
});
