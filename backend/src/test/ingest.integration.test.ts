// src/test/ingest.integration.test.ts
//
// Receção dos valores da extensão de browser.
//
// A regra que mais interessa aqui é a mesma de sempre e continua a valer: nada
// do que entra por esta porta cria dinheiro. Os lançamentos nascem PENDING e o
// saldo continua a vir só do fecho semanal.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader, assertSameDatabase } from './harness';
import { criaMotorista, criaAdmin } from './factories';
import { UserRole } from '../shared/types/enums';

let admin: Awaited<ReturnType<typeof criaAdmin>>;

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
});

afterAll(async () => {
  await testDb.$disconnect();
});

/** O corpo que a extensão envia. Tipado e não `unknown`: o `.send()` do
 *  supertest exige um objeto, e `unknown` não lhe serve. */
interface FolhaDoPortal {
  platform: string;
  date: string;
  rows: { driverName: string; amount: number }[];
}

function envia(actorId: string, role: UserRole, body: FolhaDoPortal) {
  return request(app)
    .post('/earnings/ingest')
    .set(authHeader(actorId, role))
    .send(body);
}

describe('ingest — sanidade', () => {
  it('a aplicacao e os testes falam com a MESMA base de dados', async () => {
    await assertSameDatabase();
  });
});

describe('ingest — emparelhamento', () => {
  it('cria lancamentos para os motoristas cujo nome casa', async () => {
    const monica = await criaMotorista({ name: 'Mónica Luís Antunes' });
    const bruno = await criaMotorista({ name: 'Bruno Silva' });

    // Nomes sem acentos, como a Uber os escreve.
    const res = await envia(admin.id, UserRole.ADMIN, {
      platform: 'UBER',
      date: '2026-03-15',
      rows: [
        { driverName: 'Monica Luis Antunes', amount: 612.40 },
        { driverName: 'Bruno Silva', amount: 455.90 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.result.inserted).toBe(2);
    expect(res.body.data.result.unmatched).toHaveLength(0);

    const daMonica = await testDb.earning.findFirst({ where: { userId: monica.id } });
    expect(Number(daMonica!.amount)).toBe(612.40);

    const doBruno = await testDb.earning.findFirst({ where: { userId: bruno.id } });
    expect(Number(doBruno!.amount)).toBe(455.90);
  });

  it('devolve os nomes que nao emparelham em vez de os descartar', async () => {
    // Uma linha perdida em silêncio é uma semana de trabalho de alguém que
    // desaparece sem ninguém dar por isso.
    await criaMotorista({ name: 'Bruno Silva' });

    const res = await envia(admin.id, UserRole.ADMIN, {
      platform: 'BOLT',
      date: '2026-03-15',
      rows: [
        { driverName: 'Bruno Silva', amount: 100 },
        { driverName: 'Alguem Que Nao Existe', amount: 250 },
      ],
    });

    expect(res.body.data.result.inserted).toBe(1);
    expect(res.body.data.result.unmatched).toHaveLength(1);
    expect(res.body.data.result.unmatched[0]).toMatchObject({
      driverName: 'Alguem Que Nao Existe',
      amount: 250,
      reason: 'not_found',
    });
  });

  it('nao escolhe entre dois motoristas do mesmo nome', async () => {
    await criaMotorista({ name: 'João Silva' });
    await criaMotorista({ name: 'João Silva' });

    const res = await envia(admin.id, UserRole.ADMIN, {
      platform: 'UBER',
      date: '2026-03-15',
      rows: [{ driverName: 'Joao Silva', amount: 300 }],
    });

    expect(res.body.data.result.inserted).toBe(0);
    expect(res.body.data.result.unmatched[0].reason).toBe('ambiguous');
    expect(res.body.data.result.unmatched[0].candidates).toHaveLength(2);
  });

  it('ignora motoristas inativos ao emparelhar', async () => {
    // Um inativo na lista de candidatos só serve para gerar ambiguidades e para
    // receber lançamentos que ninguém vai conferir.
    await criaMotorista({ name: 'Bruno Silva', status: 'INACTIVE' });

    const res = await envia(admin.id, UserRole.ADMIN, {
      platform: 'UBER',
      date: '2026-03-15',
      rows: [{ driverName: 'Bruno Silva', amount: 100 }],
    });

    expect(res.body.data.result.inserted).toBe(0);
    expect(res.body.data.result.unmatched[0].reason).toBe('not_found');
  });
});

describe('ingest — o que entra na base', () => {
  it('os lancamentos nascem PENDING e NAO creditam saldo', async () => {
    // A regra central do sistema, agora por mais uma porta de entrada.
    const motorista = await criaMotorista({ name: 'Bruno Silva' });

    await envia(admin.id, UserRole.ADMIN, {
      platform: 'UBER',
      date: '2026-03-15',
      rows: [{ driverName: 'Bruno Silva', amount: 5000 }],
    });

    const lancamento = await testDb.earning.findFirst({ where: { userId: motorista.id } });
    expect(lancamento!.status).toBe('PENDING');

    const saldo = await request(app)
      .get(`/balance/${motorista.id}`)
      .set(authHeader(admin.id, UserRole.ADMIN));

    expect(saldo.body.data.balance.available).toBe(0);
  });

  it('reenviar a mesma folha nao duplica valores', async () => {
    // A extensão pode ser clicada duas vezes, ou a primeira resposta pode
    // perder-se. Nenhum dos casos deve dobrar a semana de alguém.
    const motorista = await criaMotorista({ name: 'Bruno Silva' });
    const folha = {
      platform: 'UBER',
      date: '2026-03-15',
      rows: [{ driverName: 'Bruno Silva', amount: 300 }],
    };

    const primeira = await envia(admin.id, UserRole.ADMIN, folha);
    const segunda = await envia(admin.id, UserRole.ADMIN, folha);

    expect(primeira.body.data.result.inserted).toBe(1);
    expect(segunda.body.data.result.inserted).toBe(0);
    expect(segunda.body.data.result.skippedDuplicates).toBe(1);

    const total = await testDb.earning.count({ where: { userId: motorista.id } });
    expect(total).toBe(1);
  });

  it('a pre-visualizacao NAO grava nada', async () => {
    const motorista = await criaMotorista({ name: 'Bruno Silva' });

    const res = await request(app)
      .post('/earnings/ingest/preview')
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({
        platform: 'UBER', date: '2026-03-15',
        rows: [{ driverName: 'Bruno Silva', amount: 300 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.result.inserted).toBe(1);

    const gravados = await testDb.earning.count({ where: { userId: motorista.id } });
    expect(gravados).toBe(0);
  });
});

describe('ingest — quem pode enviar', () => {
  it('um motorista NAO envia a folha da frota', async () => {
    // Se pudesse, escrevia os ganhos de toda a gente — incluindo os dele.
    const motorista = await criaMotorista({ name: 'Bruno Silva' });

    const res = await envia(motorista.id, UserRole.DRIVER, {
      platform: 'UBER',
      date: '2026-03-15',
      rows: [{ driverName: 'Bruno Silva', amount: 9999 }],
    });

    expect(res.status).toBe(403);
    expect(await testDb.earning.count()).toBe(0);
  });

  it('recusa um envio sem linhas', async () => {
    const res = await envia(admin.id, UserRole.ADMIN, {
      platform: 'UBER', date: '2026-03-15', rows: [],
    });

    // 400 e não 500. Um corpo mal formado é culpa de quem envia; devolver 500
    // manda a extensão tentar outra vez ou reportar avaria, quando o que ela
    // precisa é de corrigir o que mandou.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('recusa uma data mal formada e diz qual e o campo', async () => {
    const res = await envia(admin.id, UserRole.ADMIN, {
      platform: 'UBER', date: '15/03/2026',
      rows: [{ driverName: 'Bruno Silva', amount: 100 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    // O campo tem de vir identificado, senão quem recebe o erro não sabe o que
    // corrigir. O prefixo "body" é removido: interessa "date".
    expect(res.body.issues[0].field).toBe('date');
  });

  it('recusa uma plataforma desconhecida', async () => {
    const res = await envia(admin.id, UserRole.ADMIN, {
      platform: 'CABIFY', date: '2026-03-15',
      rows: [{ driverName: 'Bruno Silva', amount: 100 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.issues[0].field).toBe('platform');
  });
});
