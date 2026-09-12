// src/modules/reports/receipts-export.service.ts
//
// Os Recibos Verdes em Excel.
//
// ─── PORQUE EXISTE, JÁ HAVENDO CSV ──────────────────────────────────────────
//
// O CSV continua e não é substituído: um contabilista pode ter uma importação
// que o consome, e tirá-lo partiria um fluxo que não conhecemos.
//
// Mas um CSV não pode ser visual. Não tem cores, formatos, larguras nem folhas.
// Quem abre duas mil linhas de texto separado por ponto-e-vírgula tem de as
// somar e agrupar à mão. Este ficheiro faz esse trabalho antes de chegar lá.
//
// ─── O QUE A FOLHA DE RESUMO RESPONDE ────────────────────────────────────────
//
// A pergunta de quem recebe isto é uma: "quanto é que cada sociedade tem de
// emitir?" Não é a lista — é o total por entidade. Por isso os totais por
// sociedade vêm logo na primeira folha, antes de qualquer linha de detalhe.
//
// ─── O QUE NÃO VAI, POR DECISÃO DO CLIENTE ───────────────────────────────────
//
// A REFERÊNCIA (o identificador da retirada) fica só no CSV. Serve para colar
// numa pesquisa e num documento que se lê é uma coluna de ruído.
//
// O IBAN e a DATA DE PAGAMENTO ficam fora dos dois formatos. São úteis a quem
// emite recibos, mas um ficheiro exportado circula por email e por pastas
// partilhadas, e dados bancários de terceiros não devem viajar assim por
// omissão.

import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { withdrawalsRepository, UNCLASSIFIED } from '../withdrawals/withdrawals.repository';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import {
  EUR, DATA, DATA_HORA,
  estilizarCabecalho, estilizarTitulo, linhaDeTotais, cents,
} from './xlsx-kit';

/**
 * Tecto de linhas.
 *
 * Mais generoso que o da Faturação (20 000) porque uma linha de recibo tem seis
 * colunas contra vinte e quatro, e portanto pesa muito menos em memória. O
 * serviço no Render tem 512 MB e a base de desempenho tem 2004 retiradas — este
 * limite nunca se toca na prática, existe para um filtro distraído não derrubar
 * a API.
 */
const MAX_LINHAS = 50_000;

interface Recibo {
  requestedAt: Date;
  userName: string;
  amount: number;
  companyLabel: string;
  status: string;
}

const ESTADO_PT: Record<string, string> = {
  PAID: 'Pago',
  APPROVED: 'Aprovado',
  PENDING: 'Pendente',
  REJECTED: 'Rejeitado',
};

/** O rótulo da sociedade, com a mesma regra que a tela usa. */
function etiquetaDaSociedade(w: {
  companySetAt: Date | null;
  companyName?: string | null;
  companyOther?: string | null;
}): string {
  if (!w.companySetAt) return 'Por classificar';
  if (w.companyName) return w.companyName;
  if (w.companyOther) return w.companyOther;
  // Classificada como "nenhuma" de propósito — distinto de por classificar.
  return 'Sem sociedade';
}

export interface ReceiptsExportContext {
  requestedBy: string;
  filtrosLegiveis: Array<[string, string]>;
}

export interface ReceiptsExportFilter {
  status?: string;
  terms?: string[];
  companyId?: string;
}

export const receiptsExportService = {
  async streamXlsx(
    res: Response,
    filter: ReceiptsExportFilter,
    ctx: ReceiptsExportContext,
  ): Promise<void> {
    const pagina = await withdrawalsRepository.findManyPaged(
      { status: filter.status, terms: filter.terms, companyId: filter.companyId },
      { page: 1, pageSize: 1, skip: 0 },
    );

    const total = pagina.page.total;

    if (total === 0) {
      throw new AppError(
        'Nenhum recibo corresponde aos filtros aplicados. Ajuste o período ou a sociedade.',
        404,
        'EXPORT_EMPTY',
      );
    }

    if (total > MAX_LINHAS) {
      throw new AppError(
        `A seleção tem ${total.toLocaleString('pt-PT')} recibos e o máximo por ficheiro é ` +
        `${MAX_LINHAS.toLocaleString('pt-PT')}. Filtre por sociedade ou por motorista.`,
        413,
        'EXPORT_TOO_LARGE',
      );
    }

    const linhas = await this.recolher(filter, total);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'DragonFleet';
    wb.created = new Date();

    this.folhaResumo(wb, linhas, ctx);
    this.folhaRecibos(wb, linhas);
    this.folhaPorSociedade(wb, linhas);

    const nome = this.nomeDoFicheiro(linhas, filter);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);

    await wb.xlsx.write(res);
    res.end();

    logger.info(`[export] ${ctx.requestedBy} exportou ${linhas.length} recibos para ${nome}`);
  },

  /**
   * Traz tudo, percorrendo as paginas.
   *
   * O `findManyPaged` tem o tecto de 200 do MAX_PAGE_SIZE, e nao vale a pena
   * abrir um caminho sem paginacao ao lado dele: para 2004 recibos sao onze
   * pedidos ao Postgres, cada um com indice, e ordenados ASCENDENTE no fim
   * porque um documento contabilistico le-se do inicio do periodo para o fim.
   */
  async recolher(filter: ReceiptsExportFilter, total: number): Promise<Recibo[]> {
    const TAMANHO = 200;
    const paginas = Math.ceil(total / TAMANHO);
    const out: Recibo[] = [];

    for (let p = 1; p <= paginas; p++) {
      const r = await withdrawalsRepository.findManyPaged(
        { status: filter.status, terms: filter.terms, companyId: filter.companyId },
        { page: p, pageSize: TAMANHO, skip: (p - 1) * TAMANHO },
      );

      for (const w of r.items as unknown as Array<{
        requestedAt: Date; userName?: string | null; amount: number;
        companySetAt: Date | null; companyName?: string | null; companyOther?: string | null;
        status: string;
      }>) {
        out.push({
          requestedAt: new Date(w.requestedAt),
          userName: w.userName ?? '—',
          amount: Number(w.amount),
          companyLabel: etiquetaDaSociedade(w),
          status: ESTADO_PT[w.status] ?? w.status,
        });
      }
    }

    return out.sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
  },

  /** A folha que responde "quanto é que cada sociedade tem de emitir". */
  folhaResumo(wb: ExcelJS.Workbook, linhas: Recibo[], ctx: ReceiptsExportContext) {
    const ws = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 34 }, { width: 16 }, { width: 14 }];

    estilizarTitulo(ws.addRow(['DragonFleet — Recibos Verdes']));
    ws.addRow([]);

    const periodo = linhas.length > 0
      ? `${fmtDia(linhas[0].requestedAt)} a ${fmtDia(linhas[linhas.length - 1].requestedAt)}`
      : '—';

    // A etiqueta da sociedade sai dos proprios dados: se o filtro apanhou uma
    // so, todas as linhas tem o nome dela. Evita uma consulta as sociedades
    // apenas para escrever um rotulo, e nao pode ficar dessincronizada do que
    // o ficheiro realmente contem.
    const grupos = this.agrupar(linhas);
    const sociedade = grupos.length === 1 ? grupos[0].sociedade : `Todas (${grupos.length})`;

    const meta: Array<[string, string | number | Date]> = [
      ['Gerado em', new Date()],
      ['Gerado por', ctx.requestedBy],
      ['Período dos recibos', periodo],
      ['Sociedade', sociedade],
      ...ctx.filtrosLegiveis,
      ['Recibos incluídos', linhas.length],
      ['Valor total', cents(linhas.reduce((a, r) => a + r.amount, 0))],
    ];

    for (const [rotulo, valor] of meta) {
      const r = ws.addRow([rotulo, valor]);
      r.getCell(1).font = { bold: true, size: 10 };
      r.getCell(2).font = { size: 10 };
      if (valor instanceof Date) r.getCell(2).numFmt = DATA_HORA;
      if (rotulo === 'Valor total') r.getCell(2).numFmt = EUR;
    }

    ws.addRow([]);
    estilizarTitulo(ws.addRow(['Por sociedade']), 12);

    // O que interessa a quem abre: quanto cada entidade tem de emitir, e
    // quantos recibos isso representa.
    estilizarCabecalho(ws.addRow(['Sociedade', 'Valor', 'Recibos']));

    // A primeira linha de dados e capturada AQUI, e nao deduzida a posteriori.
    // Esta folha tem um bloco de metadados antes da tabela, portanto a formula
    // de soma nao pode assumir que os dados comecam na linha 2 — e calcular o
    // inicio a partir do rowCount final era fragil ao ponto de partir com uma
    // linha em branco a mais.
    const primeiraLinhaDados = ws.rowCount + 1;

    for (const g of grupos) {
      const r = ws.addRow([g.sociedade, g.valor, g.recibos]);
      r.getCell(2).numFmt = EUR;
      r.font = { size: 10 };
    }

    linhaDeTotais(
      ws, 3, 'TOTAL',
      [{ indice: 2 }, { indice: 3, formato: '0' }],
      primeiraLinhaDados,
    );

    ws.addRow([]);
    const nota = ws.addRow([
      'Nota',
      '"Por classificar" são retiradas anteriores ao registo de sociedade, ou ainda ' +
      'sem classificação. Não é o mesmo que "Sem sociedade", que foi uma escolha ' +
      'deliberada de quem classificou.',
    ]);
    nota.getCell(1).font = { bold: true, size: 9 };
    nota.getCell(2).font = { size: 9, italic: true };
    nota.getCell(2).alignment = { wrapText: true };
  },

  /** A lista. Sem referência, sem IBAN, sem data de pagamento — ver nota no topo. */
  folhaRecibos(wb: ExcelJS.Workbook, linhas: Recibo[]) {
    const ws = wb.addWorksheet('Recibos');
    ws.columns = [{ width: 13 }, { width: 34 }, { width: 14 }, { width: 32 }, { width: 12 }];

    estilizarCabecalho(ws.addRow(['Data', 'Motorista', 'Valor', 'Sociedade', 'Estado']));

    for (const r of linhas) {
      const row = ws.addRow([r.requestedAt, r.userName, r.amount, r.companyLabel, r.status]);
      row.getCell(1).numFmt = DATA;
      row.getCell(3).numFmt = EUR;
      row.font = { size: 10 };
    }

    linhaDeTotais(ws, 5, `TOTAL (${linhas.length} recibos)`, [{ indice: 3 }]);

    // Cabeçalho fixo e filtro automático: com duas mil linhas, quem rola perde
    // de vista o que cada coluna é.
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };
  },

  /** A mesma agregação do resumo, em folha própria e com o período de cada uma. */
  folhaPorSociedade(wb: ExcelJS.Workbook, linhas: Recibo[]) {
    const ws = wb.addWorksheet('Por sociedade');
    ws.columns = [{ width: 34 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 13 }, { width: 13 }];

    estilizarCabecalho(ws.addRow([
      'Sociedade', 'Recibos', 'Valor', 'Valor médio', 'Primeiro', 'Último',
    ]));

    for (const g of this.agrupar(linhas)) {
      const row = ws.addRow([
        g.sociedade, g.recibos, g.valor, cents(g.valor / g.recibos), g.primeiro, g.ultimo,
      ]);
      row.getCell(3).numFmt = EUR;
      row.getCell(4).numFmt = EUR;
      row.getCell(5).numFmt = DATA;
      row.getCell(6).numFmt = DATA;
      row.font = { size: 10 };
    }

    linhaDeTotais(ws, 6, 'TOTAL', [{ indice: 2, formato: '0' }, { indice: 3 }]);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  },

  /** Agrupa por sociedade, com a maior primeiro. */
  agrupar(linhas: Recibo[]) {
    const mapa = new Map<string, Recibo[]>();
    for (const r of linhas) {
      const lista = mapa.get(r.companyLabel) ?? [];
      lista.push(r);
      mapa.set(r.companyLabel, lista);
    }

    return [...mapa.entries()]
      .map(([sociedade, lista]) => ({
        sociedade,
        recibos: lista.length,
        valor: cents(lista.reduce((a, r) => a + r.amount, 0)),
        primeiro: lista[0].requestedAt,
        ultimo: lista[lista.length - 1].requestedAt,
      }))
      // Maior valor primeiro: quem abre quer ver logo onde está o dinheiro.
      .sort((a, b) => b.valor - a.valor);
  },

  /**
   * O nome leva o PERÍODO dos dados e a sociedade filtrada.
   *
   * Quem exporta por entidade acaba com vários ficheiros do mesmo período na
   * pasta, e `recibos-verdes.xlsx (2)` não distingue nada.
   */
  nomeDoFicheiro(linhas: Recibo[], filter: ReceiptsExportFilter): string {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const de = iso(linhas[0].requestedAt);
    const ate = iso(linhas[linhas.length - 1].requestedAt);

    const base = de === ate
      ? `recibos-verdes-${de}`
      : `recibos-verdes-${de}-a-${ate}`;

    if (filter.companyId === UNCLASSIFIED) return `${base}-por-classificar.xlsx`;

    if (filter.companyId) {
      // Uma só sociedade no resultado: o nome dela vai no ficheiro.
      const grupos = this.agrupar(linhas);
      if (grupos.length === 1) return `${base}-${slug(grupos[0].sociedade)}.xlsx`;
    }

    return `${base}.xlsx`;
  },
};

function fmtDia(d: Date): string {
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function slug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
