// src/test/documents-validity.integration.test.ts
//
// A validade dos documentos tem de chegar à base de dados.
//
// Existe porque não chegava. O formulário recolhia a data, o botão de aprovar
// recusava-se a funcionar sem ela, o zod aceitava-a e o resolveDates
// validava-a — e o repositório atirava-a fora, porque o `update` copiava para o
// Prisma apenas type, fileUrl, status e notes.
//
// O sintoma que se via era a coluna Validade a mostrar "—" em documentos
// acabados de aprovar. O que não se via era pior: o trabalho agendado que avisa
// antes de um documento caducar procura por expiresAt. Sem ele, nenhum
// motorista era avisado, e o primeiro sinal de uma carta de condução caducada
// seria um problema a sério em vez de um aviso com trinta dias.
//
// Nenhuma verificação de tipos apanhava isto. O service constrói o objeto com
// spreads, e a verificação de propriedades a mais do TypeScript só corre em
// literais escritos à mão — com spread, campos que o tipo não declara passam
// sem uma palavra.
//
// Por isso o teste vai pelo HTTP a sério e depois lê a base diretamente. Ler a
// resposta da API não chegaria: quem partisse isto outra vez veria a resposta
// certa e a base errada.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { testDb, resetDb, authHeader, assertSameDatabase } from './harness';
import { criaMotorista, criaAdmin } from './factories';
import { UserRole } from '../shared/types/enums';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let motorista: Awaited<ReturnType<typeof criaMotorista>>;

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  motorista = await criaMotorista();
});

afterAll(async () => {
  await testDb.$disconnect();
});

/** Documento pendente, pronto a ser revisto. */
async function criaDocumentoPendente() {
  return testDb.document.create({
    data: {
      type: 'CARTA_CONDUCAO',
      fileUrl: 'https://exemplo.invalido/carta.pdf',
      fileKey: 'teste/carta',
      status: 'PENDING',
      userId: motorista.id,
    },
  });
}

describe('validade dos documentos', () => {
  it('a aplicacao e os testes falam com a MESMA base de dados', async () => {
    await assertSameDatabase();
  });

  it('grava a validade quando a administracao aprova', async () => {
    const doc = await criaDocumentoPendente();
    const validade = '2027-10-02T00:00:00.000Z';

    const res = await request(app)
      .patch(`/documents/${doc.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ status: 'APPROVED', expiresAt: validade });

    expect(res.status).toBe(200);

    // A base, e não a resposta. É esta linha que apanha o bug original.
    const guardado = await testDb.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(guardado.status).toBe('APPROVED');
    expect(guardado.expiresAt).not.toBeNull();
    expect(guardado.expiresAt?.toISOString()).toBe(validade);
  });

  it('grava tambem a data de emissao', async () => {
    const doc = await criaDocumentoPendente();

    await request(app)
      .patch(`/documents/${doc.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({
        status: 'APPROVED',
        issuedAt: '2026-01-15T00:00:00.000Z',
        expiresAt: '2031-01-15T00:00:00.000Z',
      })
      .expect(200);

    const guardado = await testDb.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(guardado.issuedAt?.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(guardado.expiresAt?.toISOString()).toBe('2031-01-15T00:00:00.000Z');
  });

  it('null limpa a validade, e nao e confundido com "nao mexer"', async () => {
    // O caso "este documento não expira", que a interface oferece como decisão
    // explícita ao lado da data. Um `if (data.expiresAt)` em vez de
    // `!== undefined` passaria nos dois testes acima e falharia neste.
    const doc = await testDb.document.create({
      data: {
        type: 'CARTAO_CIDADAO',
        fileUrl: 'https://exemplo.invalido/cc.pdf',
        fileKey: 'teste/cc',
        status: 'PENDING',
        userId: motorista.id,
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      },
    });

    await request(app)
      .patch(`/documents/${doc.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ status: 'APPROVED', expiresAt: null })
      .expect(200);

    const guardado = await testDb.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(guardado.expiresAt).toBeNull();
  });

  it('omitir as datas nao apaga as que ja la estavam', async () => {
    // A outra metade da distinção: rejeitar um documento não deve limpar a
    // validade que alguém já tinha lido dele.
    const doc = await testDb.document.create({
      data: {
        type: 'CERTIFICADO_TVDE',
        fileUrl: 'https://exemplo.invalido/tvde.pdf',
        fileKey: 'teste/tvde',
        status: 'PENDING',
        userId: motorista.id,
        expiresAt: new Date('2027-06-30T00:00:00.000Z'),
      },
    });

    await request(app)
      .patch(`/documents/${doc.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ status: 'REJECTED', notes: 'Ilegível.' })
      .expect(200);

    const guardado = await testDb.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(guardado.status).toBe('REJECTED');
    expect(guardado.expiresAt?.toISOString()).toBe('2027-06-30T00:00:00.000Z');
  });

  it('recusa uma validade anterior a emissao', async () => {
    const doc = await criaDocumentoPendente();

    const res = await request(app)
      .patch(`/documents/${doc.id}/status`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({
        status: 'APPROVED',
        issuedAt: '2026-05-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:00:00.000Z',
      });

    expect(res.status).toBe(400);

    // E não gravou nada a meio.
    const guardado = await testDb.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(guardado.status).toBe('PENDING');
    expect(guardado.expiresAt).toBeNull();
  });

  it('um motorista nao pode aprovar o proprio documento', async () => {
    const doc = await criaDocumentoPendente();

    await request(app)
      .patch(`/documents/${doc.id}/status`)
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .send({ status: 'APPROVED', expiresAt: '2030-01-01T00:00:00.000Z' })
      .expect(403);

    const guardado = await testDb.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(guardado.status).toBe('PENDING');
  });
});
