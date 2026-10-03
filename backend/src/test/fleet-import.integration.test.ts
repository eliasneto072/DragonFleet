// src/test/fleet-import.integration.test.ts
//
// Arrastar três PDFs e ficar com os fechos da semana em rascunho.
//
// ─── O QUE SÓ ESTE FICHEIRO PODE PROVAR ─────────────────────────────────────
//
// As peças já estão todas testadas à parte: o extrator contra os PDFs reais, os
// três leitores contra o texto, o planeador contra cenários de atribuição. O
// que nenhum desses testes vê é a ligação entre elas e a base de dados:
//
//   • a rota está montada onde deve, e sob a permissão certa;
//   • o corpo de 300 KB passa (o parser global aceita 100 KB);
//   • o nome de cada campo do Prisma existe mesmo — a classe de erro que já
//     partiu quatro builds deste projeto;
//   • o fecho criado tem a comissão em vigor e a taxa da viatura, porque passa
//     pelo settlementsService e não por um insert à parte;
//   • nada é creditado: tudo nasce em DRAFT.
//
// As matrículas dos PDFs são as verdadeiras — BG-49-GP, BT-63-NU, AX-89-SG — e
// é por isso que os carros deste teste têm de as usar. É o mesmo que dizer que
// os documentos são a especificação.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from '../app';
import { testDb, resetDb, authHeader, assertSameDatabase } from './harness';
import { criaMotorista, criaAdmin, criaVeiculo } from './factories';
import { UserRole } from '../shared/types/enums';

const ROTA = '/fleet-import';
const SEMANA = { semanaInicio: '2026-10-12', semanaFim: '2026-10-18' };

const pdf = (nome: string) =>
  readFileSync(
    join(__dirname, '..', 'modules', 'fleet-import', 'parsers', '__fixtures__', `${nome}.pdf`),
  ).toString('base64');

const TRES_FICHEIROS = {
  viaVerdePdf: pdf('via-verde'),
  prioFrotaPdf: pdf('prio-frota'),
  prioElectricPdf: pdf('prio-electric'),
};

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let joao: Awaited<ReturnType<typeof criaMotorista>>;
let maria: Awaited<ReturnType<typeof criaMotorista>>;
let carroGP: { id: string };
let carroNU: { id: string };

const d = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

async function atribui(vehicleId: string, userId: string, inicio: string, fim: string | null = null) {
  return testDb.vehicleAssignment.create({
    data: { vehicleId, userId, startedAt: d(inicio), endedAt: fim ? d(fim) : null },
  });
}

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  joao = await criaMotorista({ name: 'João Gasóleo' });
  maria = await criaMotorista({ name: 'Maria Elétrica' });
  // As matrículas são as dos PDFs. O BG-49-GP tem portagens e combustível; o
  // BT-63-NU tem portagens e carregamentos.
  carroGP = await criaVeiculo({ plate: 'BG-49-GP', weeklyFee: 250 });
  carroNU = await criaVeiculo({ plate: 'BT-63-NU', weeklyFee: 300 });
  await atribui(carroGP.id, joao.id, '2026-01-01');
  await atribui(carroNU.id, maria.id, '2026-01-01');
});

afterAll(async () => {
  await testDb.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════
describe('a pré-visualização não escreve nada', () => {
  it('devolve o plano com os valores de cada PDF', async () => {
    await assertSameDatabase();

    const res = await request(app)
      .post(`${ROTA}/analisar`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ ...SEMANA, ...TRES_FICHEIROS });

    expect(res.status).toBe(200);
    const { linhas, fontes } = res.body.data;

    // Cada fonte confere contra o total do próprio fornecedor.
    expect(fontes.every((f: { confere: boolean }) => f.confere)).toBe(true);

    const gp = linhas.find((l: { plate: string }) => l.plate === 'BG-49-GP');
    expect(gp.userName).toBe('João Gasóleo');
    expect(gp.tollsAmount).toBe(33.39);
    expect(gp.fuelAmount).toBe(313.97);
    expect(gp.chargeAmount).toBe(0);
    // A taxa da viatura vem do carro, como no formulário manual.
    expect(gp.vehicleFee).toBe(250);

    const nu = linhas.find((l: { plate: string }) => l.plate === 'BT-63-NU');
    expect(nu.userName).toBe('Maria Elétrica');
    expect(nu.tollsAmount).toBe(30.60);
    expect(nu.chargeAmount).toBe(198.53);
    expect(nu.fuelAmount).toBe(0);
  });

  it('e a base continua sem fechos', async () => {
    await request(app)
      .post(`${ROTA}/analisar`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ ...SEMANA, ...TRES_FICHEIROS });

    expect(await testDb.weeklySettlement.count()).toBe(0);
  });

  it('avisa das matrículas que não estão na frota, com o valor', async () => {
    // O AX-89-SG aparece no PDF do combustível e não foi criado aqui: 213,89 €
    // que não podem entrar em fecho nenhum nem desaparecer em silêncio.
    const res = await request(app)
      .post(`${ROTA}/analisar`)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ ...SEMANA, ...TRES_FICHEIROS });

    expect(res.body.data.avisos.join(' ')).toContain('AX-89-SG');
    expect(res.body.data.porAtribuir).toBe(213.89);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('a importação cria rascunhos', () => {
  it('um por motorista, em DRAFT, com as despesas certas', async () => {
    const res = await request(app)
      .post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ ...SEMANA, ...TRES_FICHEIROS });

    expect(res.status).toBe(200);
    expect(res.body.data.criados).toBe(2);
    expect(res.body.data.falhas).toHaveLength(0);

    const fechos = await testDb.weeklySettlement.findMany({
      orderBy: { userId: 'asc' },
    });
    expect(fechos).toHaveLength(2);
    // NADA creditado. Foi o pedido do cliente e é a única forma segura: um
    // importador que credita sozinho transforma um PDF de formato novo num
    // pagamento errado.
    expect(fechos.every((f) => f.status === 'DRAFT')).toBe(true);
    expect(fechos.every((f) => f.registeredAt === null)).toBe(true);

    const doJoao = fechos.find((f) => f.userId === joao.id)!;
    expect(Number(doJoao.tollsAmount)).toBe(33.39);
    expect(Number(doJoao.fuelAmount)).toBe(313.97);
    expect(Number(doJoao.chargeAmount)).toBe(0);
    expect(Number(doJoao.vehicleFee)).toBe(250);
    expect(doJoao.vehicleId).toBe(carroGP.id);
    expect(doJoao.weekStart.toISOString().slice(0, 10)).toBe('2026-10-12');

    const daMaria = fechos.find((f) => f.userId === maria.id)!;
    expect(Number(daMaria.chargeAmount)).toBe(198.53);
    expect(Number(daMaria.fuelAmount)).toBe(0);
  });

  it('deixa rasto de que foi automático, nas notas internas', async () => {
    await request(app).post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ ...SEMANA, ...TRES_FICHEIROS });

    const fecho = await testDb.weeklySettlement.findFirst();
    expect(fecho?.internalNotes).toContain('importação automática');
    // Interno e não `notes`: o motorista não precisa de saber por que caminho
    // o fecho dele nasceu, e `notes` aparece no painel dele.
    expect(fecho?.notes ?? '').not.toContain('importação');
  });

  it('aceita os ganhos da Uber e da Bolt no mesmo pedido', async () => {
    // É assim que a extensão fecha a semana de uma vez: lê os quatro portais e
    // manda tudo junto, para o rascunho nascer completo.
    await request(app).post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({
        ...SEMANA, ...TRES_FICHEIROS,
        ganhos: [{ userId: joao.id, uberAmount: 700, boltAmount: 250.5 }],
      });

    const fecho = await testDb.weeklySettlement.findFirst({ where: { userId: joao.id } });
    expect(Number(fecho?.uberAmount)).toBe(700);
    expect(Number(fecho?.boltAmount)).toBe(250.5);
    // E a conta do fecho é a do sistema, não uma soma feita aqui.
    expect(Number(fecho?.grossRevenue)).toBe(950.5);
  });

  it('aceita os ganhos pelo NOME que o portal mostra', async () => {
    // É o que a extensão tem: a Uber lista "João Gasóleo", não um id do
    // DragonFleet. O emparelhamento é o mesmo da receção de lançamentos.
    await request(app).post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({
        ...SEMANA, ...TRES_FICHEIROS,
        ganhosPorNome: [{ driverName: 'João Gasóleo', uberAmount: 400, boltAmount: 100 }],
      });

    const fecho = await testDb.weeklySettlement.findFirst({ where: { userId: joao.id } });
    expect(Number(fecho?.uberAmount)).toBe(400);
    expect(Number(fecho?.boltAmount)).toBe(100);
  });

  it('um nome que não emparelha vira AVISO, não um palpite', async () => {
    // Lançar 500 € à pessoa errada é pior do que não os lançar: o valor em
    // falta dá nas vistas, o valor no sítio errado não.
    const res = await request(app).post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({
        ...SEMANA, ...TRES_FICHEIROS,
        ganhosPorNome: [{ driverName: 'Alguém Que Não Existe', uberAmount: 500 }],
      });

    expect(res.body.data.avisos.join(' ')).toContain('Alguém Que Não Existe');
    expect(res.body.data.avisos.join(' ')).toContain('500.00');
    const fechos = await testDb.weeklySettlement.findMany();
    expect(fechos.every((f) => Number(f.uberAmount) === 0)).toBe(true);
  });

  it('o mesmo motorista em duas linhas soma, não substitui', async () => {
    // O portal pode trazer a mesma pessoa duas vezes (dois carros, duas
    // contas). A última a ganhar perdia a primeira sem dizer nada.
    await request(app).post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({
        ...SEMANA, ...TRES_FICHEIROS,
        ganhosPorNome: [
          { driverName: 'João Gasóleo', uberAmount: 300 },
          { driverName: 'João Gasóleo', uberAmount: 120 },
        ],
      });

    const fecho = await testDb.weeklySettlement.findFirst({ where: { userId: joao.id } });
    expect(Number(fecho?.uberAmount)).toBe(420);
  });

  it('a comissão e o imposto são os das configurações, não zero', async () => {
    // O rascunho passa pelo settlementsService de propósito: é ele que resolve
    // a percentagem em vigor e o imposto. Um insert direto dava um fecho com
    // contas que não são as do sistema — e é a comissão que paga a empresa.
    await request(app).post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ ...SEMANA, ...TRES_FICHEIROS, ganhos: [{ userId: joao.id, uberAmount: 1000 }] });

    const fecho = await testDb.weeklySettlement.findFirst({ where: { userId: joao.id } });
    // 15% e 6% são os valores por omissão das configurações do sistema.
    expect(Number(fecho?.commissionRate)).toBe(15);
    expect(Number(fecho?.taxRate)).toBe(6);
    expect(Number(fecho?.taxBase)).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('o que a importação recusa fazer', () => {
  it('não duplica um motorista que já tem fecho nessa semana', async () => {
    // O caso real: alguém já fechou um motorista à mão antes de importar.
    // Criar outro creditava os mesmos dias duas vezes.
    await request(app).post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ ...SEMANA, ...TRES_FICHEIROS });

    const res = await request(app).post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ ...SEMANA, ...TRES_FICHEIROS });

    expect(res.body.data.criados).toBe(0);
    expect(res.body.data.ignorados).toBe(2);
    expect(await testDb.weeklySettlement.count()).toBe(2);
    // E diz-se na pré-visualização, antes de alguém confirmar.
    expect(res.body.data.linhas.every((l: { bloqueio?: string }) => l.bloqueio)).toBe(true);
  });

  it('um PDF que não confere trava a importação INTEIRA', async () => {
    // Deixar passar as fontes boas dava um rascunho com metade das despesas e
    // ar de completo — e ninguém reparava até o motorista reclamar.
    const meio = readFileSync(
      join(__dirname, '..', 'modules', 'fleet-import', 'parsers', '__fixtures__', 'prio-electric.pdf'),
    ).subarray(0, 40000).toString('base64');

    const res = await request(app).post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ ...SEMANA, ...TRES_FICHEIROS, prioElectricPdf: meio });

    expect(res.body.data.criados).toBe(0);
    expect(await testDb.weeklySettlement.count()).toBe(0);
    expect(res.body.data.avisos.join(' ')).toContain('não foi importado nada');
  });

  it('um ficheiro que não é PDF dá um aviso, não um 500', async () => {
    const res = await request(app).post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ ...SEMANA, viaVerdePdf: Buffer.from('não sou um pdf').toString('base64') });

    expect(res.status).toBe(200);
    expect(res.body.data.avisos.join(' ')).toContain('Via Verde');
    expect(await testDb.weeklySettlement.count()).toBe(0);
  });

  it('sem ficheiros, recusa em vez de criar fechos vazios', async () => {
    const res = await request(app).post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send(SEMANA);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_FILES');
  });

  it('um motorista não importa despesas de ninguém', async () => {
    const res = await request(app).post(ROTA)
      .set(authHeader(joao.id, UserRole.DRIVER))
      .send({ ...SEMANA, ...TRES_FICHEIROS });

    expect(res.status).toBe(403);
    expect(await testDb.weeklySettlement.count()).toBe(0);
  });

  it('sem sessão, nem lê', async () => {
    const res = await request(app).post(`${ROTA}/analisar`).send({ ...SEMANA, ...TRES_FICHEIROS });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('o carro que mudou de mãos a meio da semana', () => {
  it('lança em quem o teve mais dias E avisa, para revisão humana', async () => {
    // O cliente: "se for só 1 dia, tem de ser manual, são raros esses casos".
    // O rascunho existe para isso; o aviso é o que faz a mão saber onde olhar.
    await testDb.vehicleAssignment.deleteMany({ where: { vehicleId: carroGP.id } });
    await atribui(carroGP.id, joao.id, '2026-01-01', '2026-10-14');   // 3 dias
    const outro = await criaMotorista({ name: 'Rui Substituto' });
    await atribui(carroGP.id, outro.id, '2026-10-15');                // 4 dias

    const res = await request(app).post(ROTA)
      .set(authHeader(admin.id, UserRole.ADMIN))
      .send({ ...SEMANA, ...TRES_FICHEIROS });

    const doGP = await testDb.weeklySettlement.findFirst({ where: { vehicleId: carroGP.id } });
    expect(doGP?.userId).toBe(outro.id);
    expect(res.body.data.avisos.join(' ')).toContain('mudou de motorista');
  });
});
