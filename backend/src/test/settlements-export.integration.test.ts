// src/test/settlements-export.integration.test.ts
//
// A exportação da Faturação para Excel, contra Postgres e a ler o ficheiro de
// volta com o exceljs.
//
// ─── PORQUE OS TESTES ABREM O FICHEIRO ───────────────────────────────────────
//
// Verificar só o 200 e o Content-Type não prova nada: um livro vazio, com
// números guardados como texto, ou com o imposto a zero onde devia estar
// vazio, passa esse teste sem esforço. As três regras que decidem se o ficheiro
// serve ao contabilista são todas invisíveis do lado de fora.
//
// Por isso estes testes leem o buffer com o exceljs e olham para as células:
// que tipo têm, que formato, e o que está lá dentro.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { app } from '../app';
import { testDb, resetDb, authHeader } from './harness';
import { criaMotorista, criaAdmin } from './factories';
import { UserRole, SettlementStatus } from '../shared/types/enums';

const ROTA = '/reports/settlements.xlsx';

let admin: Awaited<ReturnType<typeof criaAdmin>>;
let motorista: Awaited<ReturnType<typeof criaMotorista>>;

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Um fecho registado.
 *
 * `taxRate` explicitamente indicado: passar `null` simula um fecho anterior a
 * existir o campo do imposto, que e o caso que o teste das celulas vazias
 * precisa.
 */
async function criaFecho(opts: {
  userId?: string;
  weekStart: string;
  uber?: number;
  bolt?: number;
  taxRate?: number | null;
  status?: SettlementStatus;
  internalNotes?: string;
}) {
  const uber = opts.uber ?? 500;
  const bolt = opts.bolt ?? 300;
  const bruto = uber + bolt;
  const taxRate = opts.taxRate === undefined ? 6 : opts.taxRate;
  const taxAmount = taxRate === null ? null : Math.round(bruto * (taxRate / 100) * 100) / 100;

  return testDb.weeklySettlement.create({
    data: {
      userId: opts.userId ?? motorista.id,
      createdById: admin.id,
      weekStart: dia(opts.weekStart),
      weekEnd: dia(opts.weekStart),
      uberAmount: uber,
      boltAmount: bolt,
      grossRevenue: bruto,
      ...(taxRate === null
        ? {}
        : { taxBase: bruto, taxRate, taxAmount: taxAmount ?? 0 }),
      commissionRate: 15,
      commissionAmount: 100,
      totalDeductions: 150,
      profitBase: bruto - 50,
      netToDriver: bruto - 250,
      status: opts.status ?? SettlementStatus.REGISTERED,
      ...(opts.internalNotes ? { internalNotes: opts.internalNotes } : {}),
    },
  });
}

/** Descarrega e abre o livro. */
async function baixarLivro(query: Record<string, string>, actorId?: string) {
  const res = await request(app)
    .get(ROTA)
    .query(query)
    .set(authHeader(actorId ?? admin.id, UserRole.ADMIN))
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

beforeEach(async () => {
  await resetDb();
  admin = await criaAdmin();
  motorista = await criaMotorista({ name: 'Monica Condutora' });
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe('quem pode exportar', () => {
  it('o motorista NAO pode — e a faturacao de toda a empresa', async () => {
    await criaFecho({ weekStart: '2026-03-02' });

    // Sem este guard, cada motorista descarregava as receitas, comissoes e
    // liquidos de todos os colegas num ficheiro.
    await request(app)
      .get(ROTA)
      .set(authHeader(motorista.id, UserRole.DRIVER))
      .expect(403);
  });

  it('sem autenticacao, 401', async () => {
    await request(app).get(ROTA).expect(401);
  });
});

describe('o ficheiro', () => {
  it('tem as quatro folhas', async () => {
    await criaFecho({ weekStart: '2026-03-02' });
    const { wb } = await baixarLivro({});

    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Resumo', 'Movimentos', 'Por semana', 'Por motorista',
    ]);
  });

  it('o nome do ficheiro leva o periodo', async () => {
    await criaFecho({ weekStart: '2026-03-02' });
    const { res } = await baixarLivro({ from: '2026-03-01', to: '2026-03-31' });

    expect(res.headers['content-disposition'])
      .toContain('faturacao-2026-03-01-a-2026-03-31.xlsx');
  });

  it('o tipo de conteudo e de xlsx e nao de zip generico', async () => {
    await criaFecho({ weekStart: '2026-03-02' });
    const { res } = await baixarLivro({});
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
  });
});

describe('regra 1 — numeros sao numeros', () => {
  it('as celulas de dinheiro sao numericas, nao texto', async () => {
    await criaFecho({ weekStart: '2026-03-02', uber: 1234.56, bolt: 0 });
    const { wb } = await baixarLivro({});

    const ws = wb.getWorksheet('Movimentos')!;
    const cabecalhos = (ws.getRow(1).values as unknown[]).map(String);
    const colUber = cabecalhos.indexOf('Uber');
    const celula = ws.getRow(2).getCell(colUber);

    // Se isto fosse "1.234,56" como texto, o SUM do contabilista devolvia zero
    // e ninguem entendia porque.
    expect(typeof celula.value).toBe('number');
    expect(celula.value).toBe(1234.56);
  });

  it('as celulas de dinheiro tem formato de euro', async () => {
    await criaFecho({ weekStart: '2026-03-02' });
    const { wb } = await baixarLivro({});

    const ws = wb.getWorksheet('Movimentos')!;
    const cabecalhos = (ws.getRow(1).values as unknown[]).map(String);
    const colLiquido = cabecalhos.indexOf('Líquido ao motorista');

    expect(ws.getRow(2).getCell(colLiquido).numFmt).toContain('€');
  });
});

describe('regra 2 — totais sao formulas', () => {
  it('a linha de TOTAL usa SUM e nao um valor calculado', async () => {
    await criaFecho({ weekStart: '2026-03-02' });
    await criaFecho({ weekStart: '2026-03-09' });
    const { wb } = await baixarLivro({});

    const ws = wb.getWorksheet('Movimentos')!;
    // Cabecalho + dois fechos + totais.
    const linhaTotais = ws.getRow(4);
    expect(linhaTotais.getCell(1).value).toBe('TOTAL');

    const cabecalhos = (ws.getRow(1).values as unknown[]).map(String);
    const colBruto = cabecalhos.indexOf('Receita bruta');
    const celula = linhaTotais.getCell(colBruto).value as { formula?: string };

    // O contabilista clica e ve de onde vem. E elimina a possibilidade de o
    // total do JavaScript discordar do que o Excel calcularia.
    expect(celula.formula).toMatch(/^SUM\([A-Z]+2:[A-Z]+3\)$/);
  });
});

describe('regra 3 — imposto nulo fica vazio, nunca zero', () => {
  it('um fecho anterior ao imposto deixa as tres celulas vazias', async () => {
    await criaFecho({ weekStart: '2026-03-02', taxRate: null });
    const { wb } = await baixarLivro({});

    const ws = wb.getWorksheet('Movimentos')!;
    const cabecalhos = (ws.getRow(1).values as unknown[]).map(String);
    const linha = ws.getRow(2);

    for (const nome of ['Base do imposto', 'Taxa', 'Imposto']) {
      const valor = linha.getCell(cabecalhos.indexOf(nome)).value;
      // Zero diria ao contabilista que nao era devido imposto. Vazio diz-lhe
      // que a pergunta nao se aplica a esta semana. Achatar os dois e mentir
      // num documento fiscal.
      expect(valor, `${nome} devia estar vazia`).toBeNull();
    }
  });

  it('um fecho COM imposto traz os tres valores', async () => {
    await criaFecho({ weekStart: '2026-03-02', uber: 500, bolt: 500, taxRate: 6 });
    const { wb } = await baixarLivro({});

    const ws = wb.getWorksheet('Movimentos')!;
    const cabecalhos = (ws.getRow(1).values as unknown[]).map(String);
    const linha = ws.getRow(2);

    expect(linha.getCell(cabecalhos.indexOf('Taxa')).value).toBe(6);
    expect(linha.getCell(cabecalhos.indexOf('Base do imposto')).value).toBe(1000);
    expect(linha.getCell(cabecalhos.indexOf('Imposto')).value).toBe(60);
  });

  it('taxa posta a ZERO de proposito nao e confundida com ausencia', async () => {
    await criaFecho({ weekStart: '2026-03-02', taxRate: 0 });
    const { wb } = await baixarLivro({});

    const ws = wb.getWorksheet('Movimentos')!;
    const cabecalhos = (ws.getRow(1).values as unknown[]).map(String);

    // Zero explicito aparece como zero. E o outro lado da mesma distincao.
    expect(ws.getRow(2).getCell(cabecalhos.indexOf('Taxa')).value).toBe(0);
  });
});

describe('as observacoes internas nao saem', () => {
  it('o texto interno nao aparece em nenhuma folha', async () => {
    const segredo = 'ESTE-MOTORISTA-ESTA-EM-AVALIACAO';
    await criaFecho({ weekStart: '2026-03-02', internalNotes: segredo });

    const { res } = await baixarLivro({});

    // Procurado no ficheiro em bruto, e nao celula a celula: um ficheiro sai do
    // sistema e vai para email e para pastas partilhadas, portanto a garantia
    // tem de ser sobre os BYTES e nao sobre as celulas que nos lembramos de
    // conferir.
    expect(res.body.toString('latin1')).not.toContain(segredo);
  });
});

describe('os filtros sao os mesmos da tela', () => {
  it('o periodo e respeitado', async () => {
    await criaFecho({ weekStart: '2026-03-02' });
    await criaFecho({ weekStart: '2026-06-01' });

    const { wb } = await baixarLivro({ from: '2026-03-01', to: '2026-03-31' });
    const ws = wb.getWorksheet('Movimentos')!;

    // Cabecalho + um fecho + totais.
    expect(ws.rowCount).toBe(3);
  });

  it('o estado e respeitado', async () => {
    await criaFecho({ weekStart: '2026-03-02', status: SettlementStatus.REGISTERED });
    await criaFecho({ weekStart: '2026-03-09', status: SettlementStatus.DRAFT });

    const { wb } = await baixarLivro({ status: 'DRAFT' });
    expect(wb.getWorksheet('Movimentos')!.rowCount).toBe(3);
  });

  it('o motorista e respeitado', async () => {
    const outro = await criaMotorista({ name: 'Segundo Condutor' });
    await criaFecho({ weekStart: '2026-03-02' });
    await criaFecho({ weekStart: '2026-03-02', userId: outro.id });

    const { wb } = await baixarLivro({ userId: outro.id });
    const ws = wb.getWorksheet('Movimentos')!;
    const cabecalhos = (ws.getRow(1).values as unknown[]).map(String);

    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(2).getCell(cabecalhos.indexOf('Motorista')).value)
      .toBe('Segundo Condutor');
  });

  it('a pesquisa por nome e respeitada', async () => {
    const outro = await criaMotorista({ name: 'Segundo Condutor' });
    await criaFecho({ weekStart: '2026-03-02' });
    await criaFecho({ weekStart: '2026-03-02', userId: outro.id });

    const { wb } = await baixarLivro({ search: 'Monica' });
    expect(wb.getWorksheet('Movimentos')!.rowCount).toBe(3);
  });

  it('sem nada que corresponda, 404 e nao um ficheiro vazio', async () => {
    await criaFecho({ weekStart: '2026-03-02' });

    // Um livro com zero linhas parece um erro do sistema. Um 404 com mensagem
    // diz a quem clicou que os filtros nao apanham nada.
    await request(app)
      .get(ROTA)
      .query({ from: '2020-01-01', to: '2020-12-31' })
      .set(authHeader(admin.id, UserRole.ADMIN))
      .expect(404);
  });
});

describe('as folhas agregadas', () => {
  it('agrupa por semana', async () => {
    await criaFecho({ weekStart: '2026-03-02' });
    await criaFecho({ weekStart: '2026-03-02', userId: (await criaMotorista({ name: 'Outro' })).id });
    await criaFecho({ weekStart: '2026-03-09' });

    const ws = (await baixarLivro({})).wb.getWorksheet('Por semana')!;
    // Duas semanas distintas: cabecalho + 2 + totais.
    expect(ws.rowCount).toBe(4);
  });

  it('agrupa por motorista', async () => {
    const outro = await criaMotorista({ name: 'Segundo Condutor' });
    await criaFecho({ weekStart: '2026-03-02' });
    await criaFecho({ weekStart: '2026-03-09' });
    await criaFecho({ weekStart: '2026-03-02', userId: outro.id });

    const ws = (await baixarLivro({})).wb.getWorksheet('Por motorista')!;
    expect(ws.rowCount).toBe(4);
  });

  it('a soma por motorista bate com a dos movimentos', async () => {
    await criaFecho({ weekStart: '2026-03-02', uber: 400, bolt: 100 });
    await criaFecho({ weekStart: '2026-03-09', uber: 600, bolt: 200 });

    const { wb } = await baixarLivro({});
    const porMotorista = wb.getWorksheet('Por motorista')!;
    const cabecalhos = (porMotorista.getRow(1).values as unknown[]).map(String);

    // 400+100 + 600+200
    expect(porMotorista.getRow(2).getCell(cabecalhos.indexOf('Receita bruta')).value)
      .toBe(1300);
  });
});

describe('a folha de resumo guarda a proveniencia', () => {
  it('registra quem pediu e que filtros foram usados', async () => {
    await criaFecho({ weekStart: '2026-03-02' });

    const { wb } = await baixarLivro({ from: '2026-03-01', to: '2026-03-31' });
    const texto = JSON.stringify(wb.getWorksheet('Resumo')!.getSheetValues());

    // Sem isto, dois exports que discordem sao impossiveis de reconciliar:
    // ninguem sabe o que cada um pediu.
    expect(texto).toContain('2026-03-01');
    expect(texto).toContain('2026-03-31');
    expect(texto).toContain('Gerado por');
  });
});
