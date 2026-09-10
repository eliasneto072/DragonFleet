// src/test/assignment-lookup.integration.test.ts
//
// A consulta "quem teve este carro neste dia", contra Postgres a sério.
//
// ─── PORQUE ESTE FICHEIRO TEM DE EXISTIR ─────────────────────────────────────
//
// A regra de sobreposição está escrita DUAS vezes: uma como `where` do Prisma
// em `assignments.repository.ts::listByVehicleInWindow`, outra como função pura
// em `assignment-lookup.ts::overlapsWindow`. A segunda tem 19 testes
// unitários; a primeira não tinha nenhum, porque não corre sem base de dados.
//
// Duas implementações da mesma regra, uma testada e outra não, é uma armadilha
// à espera: alguém corrige um canto na versão pura, os unitários ficam verdes,
// e a consulta continua a devolver o motorista errado. Num sistema onde isto
// serve para atribuir MULTAS e ACIDENTES a pessoas, esse engano tem nome e
// morada.
//
// O último teste do ficheiro compara as duas diretamente. Os restantes cobrem
// o que só a base pode responder: a rota estar registada onde deve, o
// `withUserSelect` trazer mesmo o telefone, e os formatos de matrícula
// encontrarem o carro que está lá gravado.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader, assertSameDatabase } from './harness';
import { criaMotorista, criaAdmin } from './factories';
import { UserRole } from '../shared/types/enums';
import { overlapsWindow, resolveWindow } from '../modules/vehicles/assignment-lookup';

const MATRICULA = 'AA-00-BB';
const ROTA = '/vehicles/assignments/lookup';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let motorista: Awaited<ReturnType<typeof criaMotorista>>;
let carro: { id: string };

/** `new Date('2026-03-05T09:00:00Z')`, mais curto. */
const d = (iso: string) => new Date(iso);

async function criaCarro(plate = MATRICULA) {
  return testDb.vehicle.create({
    data: { brand: 'Toyota', model: 'Corolla', plate, year: 2022 },
  });
}

async function criaAtribuicao(userId: string, startedAt: Date, endedAt: Date | null = null) {
  return testDb.vehicleAssignment.create({
    data: { vehicleId: carro.id, userId, startedAt, endedAt },
  });
}

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  motorista = await criaMotorista({ name: 'Monica Condutora' });
  carro = await criaCarro();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe('quem pode consultar', () => {
  it('a aplicacao e os testes falam com a MESMA base de dados', async () => {
    await assertSameDatabase();
  });

  it('o motorista NAO ve — e informacao operacional sobre a frota, nao dele', async () => {
    await request(app)
      .get(ROTA)
      .query({ plate: MATRICULA, from: '2026-03-05' })
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .expect(403);
  });

  it('sem autenticacao nenhuma, 401', async () => {
    await request(app)
      .get(ROTA)
      .query({ plate: MATRICULA, from: '2026-03-05' })
      .expect(401);
  });

  it('o admin ve', async () => {
    await request(app)
      .get(ROTA)
      .query({ plate: MATRICULA, from: '2026-03-05' })
      .set(authHeader(admin.id, UserRole.ADMIN))
      .expect(200);
  });
});

describe('encontrar o carro pela matricula', () => {
  const consulta = (plate: string) =>
    request(app)
      .get(ROTA)
      .query({ plate, from: '2026-03-05' })
      .set(authHeader(admin.id, UserRole.ADMIN));

  it('com tracos, tal como esta gravada', async () => {
    const r = await consulta('AA-00-BB').expect(200);
    expect(r.body.data.vehicle.plate).toBe(MATRICULA);
  });

  it('sem tracos — quem copia de uma multa nem sempre os poe', async () => {
    const r = await consulta('AA00BB').expect(200);
    expect(r.body.data.vehicle.plate).toBe(MATRICULA);
  });

  it('em minusculas', async () => {
    const r = await consulta('aa-00-bb').expect(200);
    expect(r.body.data.vehicle.plate).toBe(MATRICULA);
  });

  it('com espacos pelo meio', async () => {
    const r = await consulta(' AA 00 BB ').expect(200);
    expect(r.body.data.vehicle.plate).toBe(MATRICULA);
  });

  it('matricula que nao e nossa da 404', async () => {
    await consulta('ZZ-99-ZZ').expect(404);
  });
});

describe('quem estava com o carro', () => {
  const noDia = (from: string, to?: string) =>
    request(app)
      .get(ROTA)
      .query(to ? { plate: MATRICULA, from, to } : { plate: MATRICULA, from })
      .set(authHeader(admin.id, UserRole.ADMIN));

  it('atribuicao ainda aberta que comecou antes aparece', async () => {
    await criaAtribuicao(motorista.id, d('2026-01-10T09:00:00Z'), null);

    const r = await noDia('2026-03-05').expect(200);
    expect(r.body.data.assignments).toHaveLength(1);
    expect(r.body.data.assignments[0].user.name).toBe('Monica Condutora');
  });

  it('atribuicao que envolve o dia aparece', async () => {
    await criaAtribuicao(motorista.id, d('2026-03-01T09:00:00Z'), d('2026-03-20T18:00:00Z'));
    const r = await noDia('2026-03-05').expect(200);
    expect(r.body.data.assignments).toHaveLength(1);
  });

  it('atribuicao que acabou ANTES do dia nao aparece', async () => {
    await criaAtribuicao(motorista.id, d('2026-01-01T09:00:00Z'), d('2026-03-04T18:00:00Z'));
    const r = await noDia('2026-03-05').expect(200);
    expect(r.body.data.assignments).toHaveLength(0);
  });

  it('atribuicao que so comecou DEPOIS do dia nao aparece', async () => {
    await criaAtribuicao(motorista.id, d('2026-03-06T09:00:00Z'), null);
    const r = await noDia('2026-03-05').expect(200);
    expect(r.body.data.assignments).toHaveLength(0);
  });

  it('carro sem ninguem atribuido nesse dia da 200 e lista vazia, nao 404', async () => {
    const r = await noDia('2026-03-05').expect(200);

    // A distincao que interessa: "o carro estava na garagem" e uma RESPOSTA e
    // fecha a investigacao. So a matricula desconhecida e que e um erro.
    expect(r.body.data.vehicle.plate).toBe(MATRICULA);
    expect(r.body.data.assignments).toEqual([]);
  });

  it('o carro trocou de maos nesse dia — aparecem os dois, de manha para a noite', async () => {
    const outro = await criaMotorista({ name: 'Segundo Condutor' });
    await criaAtribuicao(motorista.id, d('2026-01-01T00:00:00Z'), d('2026-03-05T12:00:00Z'));
    await criaAtribuicao(outro.id, d('2026-03-05T12:00:00Z'), null);

    const r = await noDia('2026-03-05').expect(200);
    expect(r.body.data.assignments).toHaveLength(2);
    expect(r.body.data.assignments.map((a: any) => a.user.name)).toEqual([
      'Monica Condutora',
      'Segundo Condutor',
    ]);
  });

  it('num intervalo, apanha quem so la esteve no meio', async () => {
    await criaAtribuicao(motorista.id, d('2026-03-03T09:00:00Z'), d('2026-03-04T18:00:00Z'));
    const r = await noDia('2026-03-01', '2026-03-07').expect(200);
    expect(r.body.data.assignments).toHaveLength(1);
  });

  it('as atribuicoes de OUTRO carro nao entram', async () => {
    const outroCarro = await testDb.vehicle.create({
      data: { brand: 'Renault', model: 'Clio', plate: 'CC-11-DD', year: 2021 },
    });
    await testDb.vehicleAssignment.create({
      data: { vehicleId: outroCarro.id, userId: motorista.id, startedAt: d('2026-01-01T00:00:00Z') },
    });

    const r = await noDia('2026-03-05').expect(200);
    expect(r.body.data.assignments).toHaveLength(0);
  });
});

describe('o que a resposta traz', () => {
  it('traz o contacto do motorista — e a razao de ser da consulta', async () => {
    await testDb.user.update({
      where: { id: motorista.id },
      data: { phone: '+351912345678' },
    });
    await criaAtribuicao(motorista.id, d('2026-01-10T09:00:00Z'), null);

    const r = await request(app)
      .get(ROTA)
      .query({ plate: MATRICULA, from: '2026-03-05' })
      .set(authHeader(admin.id, UserRole.ADMIN))
      .expect(200);

    // Este teste existe porque o `withUserSelect` NAO trazia o telefone na
    // primeira versao. O endpoint respondia 200, a lista vinha certa, e o
    // contacto chegava `undefined` sem ninguem se queixar.
    expect(r.body.data.assignments[0].user.phone).toBe('+351912345678');
    expect(r.body.data.assignments[0].user.email).toBeTruthy();
  });

  it('motorista sem telefone da null e nao rebenta', async () => {
    await criaAtribuicao(motorista.id, d('2026-01-10T09:00:00Z'), null);

    const r = await request(app)
      .get(ROTA)
      .query({ plate: MATRICULA, from: '2026-03-05' })
      .set(authHeader(admin.id, UserRole.ADMIN))
      .expect(200);

    expect(r.body.data.assignments[0].user.phone).toBeNull();
  });

  it('nao devolve a palavra-passe do motorista', async () => {
    await criaAtribuicao(motorista.id, d('2026-01-10T09:00:00Z'), null);

    const r = await request(app)
      .get(ROTA)
      .query({ plate: MATRICULA, from: '2026-03-05' })
      .set(authHeader(admin.id, UserRole.ADMIN))
      .expect(200);

    expect(r.body.data.assignments[0].user.password).toBeUndefined();
  });
});

describe('datas mal formadas', () => {
  const consulta = (query: Record<string, string>) =>
    request(app).get(ROTA).query(query).set(authHeader(admin.id, UserRole.ADMIN));

  it('sem data nenhuma, 400', async () => {
    await consulta({ plate: MATRICULA }).expect(400);
  });

  it('data em formato portugues em vez de ISO, 400', async () => {
    await consulta({ plate: MATRICULA, from: '05/03/2026' }).expect(400);
  });

  it('fim antes do inicio, 400', async () => {
    await consulta({ plate: MATRICULA, from: '2026-03-10', to: '2026-03-01' }).expect(400);
  });

  it('sem matricula, 400', async () => {
    await consulta({ from: '2026-03-05' }).expect(400);
  });
});

describe('as duas implementacoes da regra concordam', () => {
  it('o que a base devolve e exatamente o que overlapsWindow diria', async () => {
    // Um cenario com um caso de cada lado da fronteira. Se o `where` do Prisma
    // e a funcao pura discordarem em algum, este teste morre — que e
    // precisamente o que se quer que aconteca antes de alguem descobrir a
    // divergencia por causa de uma multa mal atribuida.
    const cenario: Array<[Date, Date | null]> = [
      [d('2026-01-10T09:00:00Z'), null],                          // aberta, comecou antes
      [d('2026-03-01T09:00:00Z'), d('2026-03-20T18:00:00Z')],     // envolve o dia
      [d('2026-01-01T09:00:00Z'), d('2026-03-04T18:00:00Z')],     // acabou antes
      [d('2026-03-06T09:00:00Z'), d('2026-03-09T18:00:00Z')],     // comecou depois
      [d('2026-02-01T09:00:00Z'), d('2026-03-05T00:00:00.000Z')], // acabou a meia-noite exata
      [d('2026-03-05T23:59:59.000Z'), null],                      // comecou no ultimo segundo
    ];

    for (const [startedAt, endedAt] of cenario) {
      await criaAtribuicao(motorista.id, startedAt, endedAt);
    }

    const r = await request(app)
      .get(ROTA)
      .query({ plate: MATRICULA, from: '2026-03-05' })
      .set(authHeader(admin.id, UserRole.ADMIN))
      .expect(200);

    const janela = resolveWindow('2026-03-05');
    const esperadas = cenario.filter(([startedAt, endedAt]) =>
      overlapsWindow({ startedAt, endedAt }, janela),
    );

    expect(r.body.data.assignments).toHaveLength(esperadas.length);

    // Nao basta o numero bater — podiam ser as linhas erradas em igual
    // quantidade. Comparamos as datas de inicio, que identificam cada uma.
    const inicios = r.body.data.assignments
      .map((a: any) => new Date(a.startedAt).toISOString())
      .sort();

    expect(inicios).toEqual(esperadas.map(([s]) => s.toISOString()).sort());
  });
});
