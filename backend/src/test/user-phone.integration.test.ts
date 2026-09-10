// src/test/user-phone.integration.test.ts
//
// O telefone de contacto, de ponta a ponta.
//
// ─── PORQUE ESTE FICHEIRO NASCEU DEPOIS DO BUG ───────────────────────────────
//
// O campo `phone` atravessa seis ficheiros: o schema do Prisma, o schema do
// Zod, a whitelist do que o proprio pode alterar, o objeto `data` do service, o
// spread do repositorio e o `publicSelect`. Foram verificados cinco. O sexto —
// o spread do `usersRepository.update` — ficou por fazer.
//
// O resultado nao foi um erro. O PATCH devolvia 200, o `publicSelect` trazia o
// `phone` que ja la estava (`null`), e a tela anunciava "Telefone removido" a
// quem o estava a adicionar pela primeira vez. Tudo verde, tudo errado.
//
// O TypeScript nao podia apanhar isto: acrescentar um campo OPCIONAL a um tipo
// nunca obriga ninguem a usa-lo. Um teste que grave e volte a ler apanha, e e
// por isso que estes existem.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaMotorista, criaAdmin } from './factories';
import { UserRole } from '../shared/types/enums';

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

/** PATCH ao proprio perfil, como motorista. */
const comoProprio = (body: Record<string, unknown>) =>
  request(app)
    .patch(`/users/${motorista.id}`)
    .set(authHeader(motorista.id, UserRole.DRIVER))
    .send(body);

async function telefoneNaBase(): Promise<string | null> {
  const u = await testDb.user.findUnique({ where: { id: motorista.id } });
  return u?.phone ?? null;
}

describe('gravar o telefone', () => {
  it('o proprio grava e o valor FICA NA BASE', async () => {
    const r = await comoProprio({ phone: '912345678' }).expect(200);

    // As duas metades. O bug que originou este ficheiro passava na primeira
    // metade — respondia 200 — e falhava na segunda, em silencio.
    expect(r.body.data.user.phone).toBe('912345678');
    expect(await telefoneNaBase()).toBe('912345678');
  });

  it('o telefone volta na resposta do PATCH', async () => {
    const r = await comoProprio({ phone: '912345678' }).expect(200);
    expect(r.body.data.user).toHaveProperty('phone');
  });

  it('e volta tambem no GET seguinte', async () => {
    await comoProprio({ phone: '912345678' }).expect(200);

    const r = await request(app)
      .get(`/users/${motorista.id}`)
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .expect(200);

    expect(r.body.data.user.phone).toBe('912345678');
  });

  it('normaliza os espacos antes de gravar', async () => {
    await comoProprio({ phone: '912 345 678' }).expect(200);
    expect(await telefoneNaBase()).toBe('912345678');
  });

  it('aceita numero estrangeiro com indicativo', async () => {
    await comoProprio({ phone: '+55 11 98765-4321' }).expect(200);
    expect(await telefoneNaBase()).toBe('+5511987654321');
  });

  it('alterar o telefone nao exige a palavra-passe atual', async () => {
    // Ao contrario do email e da palavra-passe: o telefone nao e credencial
    // de acesso, e pedir a palavra-passe para o mudar so criava atrito.
    await comoProprio({ phone: '912345678' }).expect(200);
  });

  it('substituir um telefone existente por outro', async () => {
    await comoProprio({ phone: '912345678' }).expect(200);
    await comoProprio({ phone: '967654321' }).expect(200);
    expect(await telefoneNaBase()).toBe('967654321');
  });
});

describe('apagar o telefone', () => {
  it('null remove o contacto', async () => {
    await comoProprio({ phone: '912345678' }).expect(200);

    const r = await comoProprio({ phone: null }).expect(200);

    expect(r.body.data.user.phone).toBeNull();
    expect(await telefoneNaBase()).toBeNull();
  });

  it('a cadeia vazia tambem remove — e o que o formulario envia', async () => {
    await comoProprio({ phone: '912345678' }).expect(200);
    await comoProprio({ phone: '' }).expect(200);
    expect(await telefoneNaBase()).toBeNull();
  });

  it('omitir o campo NAO apaga o que la estava', async () => {
    await comoProprio({ phone: '912345678' }).expect(200);

    // Mudar so o nome nao pode levar o telefone a reboque. A distincao entre
    // "nao mexer" e "apagar" e a mesma que os documentos ja fazem com as datas
    // de validade.
    await comoProprio({ name: 'Monica Outra' }).expect(200);

    expect(await telefoneNaBase()).toBe('912345678');
  });
});

describe('telefones que nao servem', () => {
  it('texto sem digitos nenhuns da 400, nao "sem telefone"', async () => {
    // Se isto gravasse null em silencio, a pessoa julgava ter guardado um
    // contacto e nao tinha.
    await comoProprio({ phone: 'nao tenho' }).expect(400);
    expect(await telefoneNaBase()).toBeNull();
  });

  it('curto demais da 400', async () => {
    await comoProprio({ phone: '12345' }).expect(400);
  });

  it('acima dos 15 digitos do E.164 da 400', async () => {
    await comoProprio({ phone: '1234567890123456' }).expect(400);
  });

  it('um 400 nao mexe no que ja estava gravado', async () => {
    await comoProprio({ phone: '912345678' }).expect(200);
    await comoProprio({ phone: 'abc' }).expect(400);
    expect(await telefoneNaBase()).toBe('912345678');
  });
});

describe('de quem e o telefone', () => {
  it('o motorista NAO altera o telefone de outro', async () => {
    const outro = await criaMotorista({ name: 'Outro Condutor' });

    await request(app)
      .patch(`/users/${outro.id}`)
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .send({ phone: '912345678' })
      .expect(403);
  });

  it('o admin altera o telefone de um motorista', async () => {
    // A administracao corrige um numero mal escrito sem obrigar o motorista a
    // entrar na conta.
    const r = await request(app)
      .patch(`/users/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ phone: '912345678' })
      .expect(200);

    expect(r.body.data.user.phone).toBe('912345678');
    expect(await telefoneNaBase()).toBe('912345678');
  });
});
