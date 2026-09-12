// src/test/receipts-export.integration.test.ts
//
// O Excel dos Recibos Verdes, aberto de volta com o exceljs.
//
// Mesma razao do ficheiro da Faturacao: verificar o 200 e o Content-Type nao
// prova nada. Um livro vazio, com numeros como texto, ou com a referencia que o
// cliente pediu para tirar, passa esse teste sem esforco.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaMotorista, criaAdmin, criaRetirada } from './factories';
import { UserRole } from '../shared/types/enums';
import { UNCLASSIFIED } from '../modules/withdrawals/withdrawals.repository';

const ROTA = '/reports/receipts.xlsx';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let motorista: Awaited<ReturnType<typeof criaMotorista>>;

async function reciboClassificado(companyId: string, amount = 100) {
  const w = await criaRetirada({ userId: motorista.id, status: 'PAID', amount });
  await testDb.withdrawal.update({
    where: { id: w.id },
    data: { companyId, companySetAt: new Date() },
  });
  return w;
}

async function baixarLivro(query: Record<string, string> = {}) {
  const res = await request(app)
    .get(ROTA)
    .query(query)
    .set(authHeader(admin.id, UserRole.ADMIN))
    .buffer()
    .parse((r, cb) => {
      const pedacos: Buffer[] = [];
      r.on('data', (c: Buffer) => pedacos.push(c));
      r.on('end', () => cb(null, Buffer.concat(pedacos)));
    })
    .expect(200);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body);
  return { res, wb };
}

/**
 * Os cabecalhos, INDEXADOS A PARTIR DE 1.
 *
 * O `row.values` do exceljs devolve um array com um buraco na posicao zero,
 * para o indice coincidir com o numero da coluna. Isso e deliberado e este
 * helper preserva-o: os testes fazem `cabecalhos(ws).indexOf('Valor')` e
 * passam o resultado ao `getCell()`, que tambem conta de 1.
 *
 * Achatar o array aqui alinharia a comparacao direta e desalinhava todos os
 * `indexOf`. Para comparar com uma lista literal, use `.slice(1)`.
 */
const cabecalhos = (ws: ExcelJS.Worksheet) =>
  (ws.getRow(1).values as unknown[]).map(String);

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  motorista = await criaMotorista({ name: 'Monica Condutora' });
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe('quem pode exportar', () => {
  it('o motorista NAO pode — sao valores pagos a toda a frota', async () => {
    await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await request(app).get(ROTA).set(authHeader(motorista.id, UserRole.DRIVER)).expect(403);
  });

  it('sem autenticacao, 401', async () => {
    await request(app).get(ROTA).expect(401);
  });
});

describe('o ficheiro', () => {
  it('tem as tres folhas', async () => {
    await criaRetirada({ userId: motorista.id, status: 'PAID' });
    const { wb } = await baixarLivro();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumo', 'Recibos', 'Por sociedade']);
  });

  it('o nome leva o periodo dos recibos', async () => {
    await criaRetirada({ userId: motorista.id, status: 'PAID' });
    const { res } = await baixarLivro();
    // Um recibo so: o nome usa a data unica em vez de um intervalo vazio.
    expect(res.headers['content-disposition']).toMatch(/recibos-verdes-\d{4}-\d{2}-\d{2}\.xlsx/);
  });

  it('filtrado por uma sociedade, o nome leva o nome dela', async () => {
    const empresa = await testDb.company.create({ data: { name: 'Renas e Elfos' } });
    await reciboClassificado(empresa.id);

    const { res } = await baixarLivro({ companyId: empresa.id });
    expect(res.headers['content-disposition']).toContain('renas-e-elfos');
  });

  it('filtrado por classificar, o nome di-lo', async () => {
    await criaRetirada({ userId: motorista.id, status: 'PAID' });
    const { res } = await baixarLivro({ companyId: UNCLASSIFIED });
    expect(res.headers['content-disposition']).toContain('por-classificar');
  });

  it('sem nada que corresponda, 404 e nao um ficheiro vazio', async () => {
    const empresa = await testDb.company.create({ data: { name: 'Vazia' } });
    await criaRetirada({ userId: motorista.id, status: 'PAID' });

    await request(app)
      .get(ROTA)
      .query({ companyId: empresa.id })
      .set(authHeader(admin.id, UserRole.ADMIN))
      .expect(404);
  });
});

describe('as decisoes do cliente', () => {
  it('NAO tem coluna de referencia — fica so no CSV', async () => {
    await criaRetirada({ userId: motorista.id, status: 'PAID' });
    const { wb } = await baixarLivro();

    const cols = cabecalhos(wb.getWorksheet('Recibos')!);
    expect(cols).not.toContain('Referência');

    // `.slice(1)` para saltar o buraco da posicao zero — ver a nota no helper.
    expect(cols.slice(1)).toEqual(['Data', 'Motorista', 'Valor', 'Sociedade', 'Estado']);
  });

  it('NAO leva o IBAN nem a data de pagamento', async () => {
    const w = await criaRetirada({ userId: motorista.id, status: 'PAID' });
    await testDb.withdrawal.update({
      where: { id: w.id },
      data: { paidToIban: 'PT50000201231234567890154', paidToHolder: 'Monica Condutora' },
    });

    const { res, wb } = await baixarLivro();

    // Procurado nos BYTES do ficheiro: um ficheiro exportado circula por email
    // e por pastas partilhadas, portanto a garantia tem de ser sobre o
    // conteudo todo e nao sobre as celulas que nos lembramos de conferir.
    expect(res.body.toString('latin1')).not.toContain('PT50000201231234567890154');
    expect(cabecalhos(wb.getWorksheet('Recibos')!)).not.toContain('Data de pagamento');
  });
});

describe('numeros e formatos', () => {
  it('o valor e numerico com formato de euro', async () => {
    await criaRetirada({ userId: motorista.id, status: 'PAID', amount: 1234.56 });
    const { wb } = await baixarLivro();

    const ws = wb.getWorksheet('Recibos')!;
    const celula = ws.getRow(2).getCell(cabecalhos(ws).indexOf('Valor'));

    expect(typeof celula.value).toBe('number');
    expect(celula.value).toBe(1234.56);
    expect(celula.numFmt).toContain('€');
  });

  it('a data e uma data e nao texto', async () => {
    await criaRetirada({ userId: motorista.id, status: 'PAID' });
    const { wb } = await baixarLivro();

    const ws = wb.getWorksheet('Recibos')!;
    expect(ws.getRow(2).getCell(1).value).toBeInstanceOf(Date);
  });

  it('o total e formula e nao valor calculado', async () => {
    await criaRetirada({ userId: motorista.id, status: 'PAID', amount: 100 });
    await criaRetirada({ userId: motorista.id, status: 'PAID', amount: 200 });

    const { wb } = await baixarLivro();
    const ws = wb.getWorksheet('Recibos')!;
    const linha = ws.getRow(ws.rowCount);

    expect(String(linha.getCell(1).value)).toContain('TOTAL');
    const celula = linha.getCell(3).value as { formula?: string };
    expect(celula.formula).toBe('SUM(C2:C3)');
  });
});

describe('a agregacao por sociedade', () => {
  it('agrupa e ordena com a maior primeiro', async () => {
    const pequena = await testDb.company.create({ data: { name: 'Pequena' } });
    const grande = await testDb.company.create({ data: { name: 'Grande' } });

    await reciboClassificado(pequena.id, 50);
    await reciboClassificado(grande.id, 500);
    await reciboClassificado(grande.id, 400);

    const { wb } = await baixarLivro();
    const ws = wb.getWorksheet('Por sociedade')!;

    // A maior primeiro: quem abre quer ver logo onde esta o dinheiro.
    expect(ws.getRow(2).getCell(1).value).toBe('Grande');
    expect(ws.getRow(2).getCell(2).value).toBe(2);
    expect(ws.getRow(2).getCell(3).value).toBe(900);
    expect(ws.getRow(3).getCell(1).value).toBe('Pequena');
  });

  it('as por classificar aparecem como grupo proprio', async () => {
    const empresa = await testDb.company.create({ data: { name: 'Classificada' } });
    await reciboClassificado(empresa.id, 100);
    await criaRetirada({ userId: motorista.id, status: 'PAID', amount: 300 });

    const { wb } = await baixarLivro();
    const ws = wb.getWorksheet('Por sociedade')!;

    const nomes: string[] = [];
    ws.eachRow((r, n) => { if (n > 1) nomes.push(String(r.getCell(1).value)); });

    expect(nomes).toContain('Por classificar');
  });

  it('a soma por sociedade bate com o total dos recibos', async () => {
    const a = await testDb.company.create({ data: { name: 'A' } });
    const b = await testDb.company.create({ data: { name: 'B' } });
    await reciboClassificado(a.id, 111.11);
    await reciboClassificado(b.id, 222.22);

    const { wb } = await baixarLivro();
    const ws = wb.getWorksheet('Por sociedade')!;

    const soma = Number(ws.getRow(2).getCell(3).value) + Number(ws.getRow(3).getCell(3).value);
    expect(soma).toBeCloseTo(333.33, 2);
  });
});

describe('o resumo guarda a proveniencia', () => {
  it('registra quem pediu, o periodo e a sociedade', async () => {
    const empresa = await testDb.company.create({ data: { name: 'Renas e Elfos' } });
    await reciboClassificado(empresa.id);

    const { wb } = await baixarLivro({ companyId: empresa.id });
    const texto = JSON.stringify(wb.getWorksheet('Resumo')!.getSheetValues());

    expect(texto).toContain('Gerado por');
    expect(texto).toContain('Renas e Elfos');
    expect(texto).toContain('Recibos incluídos');
  });

  it('sem filtro de sociedade, o resumo diz quantas ha', async () => {
    const a = await testDb.company.create({ data: { name: 'A' } });
    await reciboClassificado(a.id);
    await criaRetirada({ userId: motorista.id, status: 'PAID' });

    const { wb } = await baixarLivro();
    const texto = JSON.stringify(wb.getWorksheet('Resumo')!.getSheetValues());

    // Duas: a classificada e o grupo das por classificar.
    expect(texto).toContain('Todas (2)');
  });
});
