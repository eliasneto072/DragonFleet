// src/modules/reports/settlements-export.service.ts
//
// A Faturação em Excel.
//
// Pedido do cliente, textualmente: "possibilidade de exportar para excel, os
// movimentos detalhados, organizados por semana, e por motorista".
//
// ─── QUATRO FOLHAS, E PORQUÊ ─────────────────────────────────────────────────
//
// O "organizados por semana, e por motorista" tem duas leituras: uma folha por
// semana, ou as linhas agrupadas pelas duas coisas. Em vez de perguntar e
// esperar, o ficheiro traz as três vistas — são os mesmos dados agrupados de
// maneiras diferentes e custa quase o mesmo que fazer uma.
//
//   Resumo         — que filtros produziram este ficheiro, e os totais
//   Movimentos     — uma linha por fecho, todas as colunas
//   Por semana     — agregado por semana
//   Por motorista  — agregado por motorista
//
// ─── TRÊS REGRAS QUE DECIDEM SE O FICHEIRO SERVE ─────────────────────────────
//
// 1. NÚMEROS SÃO NÚMEROS.
//
// Cada célula de dinheiro é numérica com formato `#,##0.00 €`, e o Excel aplica
// a localização de quem abre. Escrever "1.234,56" como texto é o erro que faz o
// SUM do contabilista devolver zero — e repare que é o CONTRÁRIO do CSV, onde a
// convenção do ponto-e-vírgula e da vírgula decimal é obrigatória.
//
// 2. TOTAIS SÃO FÓRMULAS.
//
// A linha de totais leva `SUM(D2:D58)` e não o valor já somado. O contabilista
// clica e vê de onde vem. E elimina a possibilidade de o total calculado em
// JavaScript discordar do que o Excel calcularia — num documento sobre dinheiro
// essa discrepância é indefensável, mesmo quando é de um cêntimo.
//
// 3. IMPOSTO NULO FICA VAZIO, NUNCA ZERO.
//
// O `taxRate` é nulo nos fechos anteriores à existência do imposto. Zero diz ao
// contabilista que não era devido imposto; vazio diz-lhe que a pergunta não se
// aplica àquela semana. Achatar os dois é mentir num documento fiscal.
//
// Nota técnica: o `toPublic` do repositório já converte `taxBase` e `taxAmount`
// nulos para zero, e só o `taxRate` preserva o nulo. Por isso a condição aqui é
// sempre `taxRate === null` — é o único sinal fiável de que aquele fecho é
// anterior ao campo.
//
// ─── O QUE NÃO VAI NO FICHEIRO ───────────────────────────────────────────────
//
// As `internalNotes`. O schema diz que nunca saem numa resposta para o
// motorista, e um ficheiro exportado sai do sistema: vai para email, para o
// contabilista, para uma pasta partilhada. Deixa de haver controlo sobre quem o
// abre, e portanto a regra tem de ser mais apertada aqui do que numa tela com
// sessão autenticada. O repositório chama o `toPublic` com `includeInternal`
// falso e isso não é configurável de propósito.

import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { settlementsRepository } from '../settlements/settlements.repository';
import type { SettlementFilter } from '../settlements/settlements.repository';
import type { SettlementPublic } from '../settlements/settlements.types';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import {
  EUR, PERCENT, DATA, DATA_HORA, VERDE,
  estilizarCabecalho, estilizarTotais, estilizarTitulo, letraDaColuna,
} from './xlsx-kit';

/**
 * Tecto de linhas.
 *
 * O serviço no Render é plano `starter`, 512 MB. A base de desempenho tem dois
 * mil motoristas; cinquenta e duas semanas de cada um são mais de cem mil
 * linhas, e o exceljs constrói o livro todo em memória antes de o escrever.
 *
 * Para uma frota real de trinta pessoas isto é um limite que nunca se toca. Sem
 * ele, um filtro distraído numa base com dados de teste tira o sistema do ar —
 * e a falha não seria "a exportação falhou", seria a API a reiniciar e todos os
 * motoristas sem portal.
 */
const MAX_LINHAS = 20_000;


const ESTADO_PT: Record<string, string> = {
  DRAFT: 'Rascunho',
  REGISTERED: 'Registado',
  CANCELLED: 'Cancelado',
};

/** As colunas da folha de movimentos, na ordem em que se leem. */
const COLUNAS: Array<{
  cabecalho: string;
  largura: number;
  /** `dinheiro` recebe formato de euro e entra nos totais. */
  tipo: 'texto' | 'data' | 'dinheiro' | 'percentagem';
  valor: (s: SettlementPublic) => string | number | Date | null;
}> = [
  { cabecalho: 'Semana (início)', largura: 15, tipo: 'data', valor: (s) => s.weekStart },
  { cabecalho: 'Semana (fim)', largura: 15, tipo: 'data', valor: (s) => s.weekEnd },
  { cabecalho: 'Motorista', largura: 28, tipo: 'texto', valor: (s) => s.userName },
  { cabecalho: 'Matrícula', largura: 12, tipo: 'texto', valor: (s) => s.vehiclePlate ?? '' },
  { cabecalho: 'Estado', largura: 12, tipo: 'texto', valor: (s) => ESTADO_PT[s.status] ?? s.status },

  { cabecalho: 'Uber', largura: 13, tipo: 'dinheiro', valor: (s) => s.uberAmount },
  { cabecalho: 'Bolt', largura: 13, tipo: 'dinheiro', valor: (s) => s.boltAmount },
  { cabecalho: 'Outras receitas', largura: 15, tipo: 'dinheiro', valor: (s) => s.otherRevenue },
  { cabecalho: 'Receita bruta', largura: 14, tipo: 'dinheiro', valor: (s) => s.grossRevenue },

  { cabecalho: 'Portagens', largura: 13, tipo: 'dinheiro', valor: (s) => s.tollsAmount },
  { cabecalho: 'Combustível', largura: 13, tipo: 'dinheiro', valor: (s) => s.fuelAmount },
  { cabecalho: 'Encargo viatura', largura: 15, tipo: 'dinheiro', valor: (s) => s.vehicleFee },
  { cabecalho: 'Outras deduções', largura: 15, tipo: 'dinheiro', valor: (s) => s.otherDeductions },
  { cabecalho: 'Total deduções', largura: 15, tipo: 'dinheiro', valor: (s) => s.totalDeductions },

  // As três do imposto. O `null` aqui é o que mantém a célula vazia — ver a
  // regra 3 no topo do ficheiro.
  { cabecalho: 'Base do imposto', largura: 15, tipo: 'dinheiro', valor: (s) => (s.taxRate === null ? null : s.taxBase) },
  { cabecalho: 'Taxa', largura: 9, tipo: 'percentagem', valor: (s) => (s.taxRate === null ? null : s.taxRate) },
  { cabecalho: 'Imposto', largura: 13, tipo: 'dinheiro', valor: (s) => (s.taxRate === null ? null : s.taxAmount) },

  { cabecalho: 'Base de lucro', largura: 14, tipo: 'dinheiro', valor: (s) => s.profitBase },
  { cabecalho: 'Comissão %', largura: 11, tipo: 'percentagem', valor: (s) => s.commissionRate },
  { cabecalho: 'Comissão', largura: 13, tipo: 'dinheiro', valor: (s) => s.commissionAmount },
  { cabecalho: 'Líquido ao motorista', largura: 19, tipo: 'dinheiro', valor: (s) => s.netToDriver },

  { cabecalho: 'Registado em', largura: 15, tipo: 'data', valor: (s) => s.registeredAt },
  { cabecalho: 'Lançado por', largura: 22, tipo: 'texto', valor: (s) => s.createdByName ?? '' },
  { cabecalho: 'Observações', largura: 40, tipo: 'texto', valor: (s) => s.notes ?? '' },
];

function formatoDe(tipo: string): string | undefined {
  if (tipo === 'dinheiro') return EUR;
  if (tipo === 'percentagem') return PERCENT;
  if (tipo === 'data') return DATA;
  return undefined;
}


export interface ExportContext {
  /** Nome de quem pediu, para a folha de resumo. */
  requestedBy: string;
  /** Os filtros, já em texto legível, para ficar registado no ficheiro. */
  filtrosLegiveis: Array<[string, string]>;
}

export const settlementsExportService = {
  /**
   * Constrói e envia o livro.
   *
   * Escreve diretamente na resposta com `write(res)`: o ficheiro nunca passa
   * pelo disco e não ha nada para limpar depois.
   */
  async streamXlsx(
    res: Response,
    filter: SettlementFilter,
    ctx: ExportContext,
  ): Promise<void> {
    const total = await settlementsRepository.countForExport(filter);

    if (total === 0) {
      throw new AppError(
        'Nenhum fecho corresponde aos filtros aplicados. Ajuste o período ou os filtros.',
        404,
        'EXPORT_EMPTY',
      );
    }

    if (total > MAX_LINHAS) {
      throw new AppError(
        `A seleção tem ${total.toLocaleString('pt-PT')} fechos e o máximo por ficheiro é ` +
        `${MAX_LINHAS.toLocaleString('pt-PT')}. Estreite o período ou filtre por motorista.`,
        413,
        'EXPORT_TOO_LARGE',
      );
    }

    const fechos = await settlementsRepository.findManyForExport(filter);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'DragonFleet';
    wb.created = new Date();

    this.folhaResumo(wb, fechos, ctx, total);
    this.folhaMovimentos(wb, fechos);
    this.folhaPorSemana(wb, fechos);
    this.folhaPorMotorista(wb, fechos);

    const nome = this.nomeDoFicheiro(filter);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);

    await wb.xlsx.write(res);
    res.end();

    logger.info(`[export] ${ctx.requestedBy} exportou ${fechos.length} fechos para ${nome}`);
  },

  /**
   * Folha de resumo — a proveniência do ficheiro.
   *
   * Existe porque um ficheiro sem registo dos filtros que o produziram é
   * impossivel de reconciliar. Quando dois exports discordarem, e vao discordar
   * um dia, e por aqui que se descobre porque.
   */
  folhaResumo(
    wb: ExcelJS.Workbook,
    fechos: SettlementPublic[],
    ctx: ExportContext,
    total: number,
  ) {
    const ws = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 26 }, { width: 44 }];

    estilizarTitulo(ws.addRow(['DragonFleet — Faturação']));
    ws.addRow([]);

    const linhas: Array<[string, string | number | Date]> = [
      ['Gerado em', new Date()],
      ['Gerado por', ctx.requestedBy],
      ...ctx.filtrosLegiveis,
      ['Fechos incluídos', total],
    ];

    for (const [rotulo, valor] of linhas) {
      const r = ws.addRow([rotulo, valor]);
      r.getCell(1).font = { bold: true, size: 10 };
      r.getCell(2).font = { size: 10 };
      if (valor instanceof Date) r.getCell(2).numFmt = DATA_HORA;
    }

    ws.addRow([]);
    estilizarTitulo(ws.addRow(['Totais do período']), 12);

    // Aqui os totais SÃO calculados, ao contrário das folhas de dados: esta é a
    // folha de capa e as somas verificáveis estão nas outras. Quem quiser
    // conferir tem as fórmulas ao lado.
    const soma = (f: (s: SettlementPublic) => number) =>
      Math.round(fechos.reduce((acc, s) => acc + f(s), 0) * 100) / 100;

    const totais: Array<[string, number]> = [
      ['Receita bruta', soma((s) => s.grossRevenue)],
      ['Total de deduções', soma((s) => s.totalDeductions)],
      ['Comissão', soma((s) => s.commissionAmount)],
      ['Imposto', soma((s) => s.taxRate === null ? 0 : s.taxAmount)],
      ['Líquido aos motoristas', soma((s) => s.netToDriver)],
    ];

    for (const [rotulo, valor] of totais) {
      const r = ws.addRow([rotulo, valor]);
      r.getCell(1).font = { bold: true, size: 10 };
      r.getCell(2).numFmt = EUR;
      r.getCell(2).font = { size: 10 };
    }

    ws.addRow([]);
    const nota = ws.addRow([
      'Nota',
      'Os valores de cada fecho estão congelados no momento do registo. Alterações ' +
      'posteriores a percentagens ou taxas não os afetam.',
    ]);
    nota.getCell(1).font = { bold: true, size: 9 };
    nota.getCell(2).font = { size: 9, italic: true };
    nota.getCell(2).alignment = { wrapText: true };
  },

  /** Folha de movimentos — uma linha por fecho, todas as colunas. */
  folhaMovimentos(wb: ExcelJS.Workbook, fechos: SettlementPublic[]) {
    const ws = wb.addWorksheet('Movimentos');

    ws.columns = COLUNAS.map((c) => ({ width: c.largura }));
    estilizarCabecalho(ws.addRow(COLUNAS.map((c) => c.cabecalho)));

    for (const s of fechos) {
      const row = ws.addRow(COLUNAS.map((c) => c.valor(s)));
      COLUNAS.forEach((c, i) => {
        const fmt = formatoDe(c.tipo);
        if (fmt) row.getCell(i + 1).numFmt = fmt;
      });
      row.font = { size: 10 };
    }

    // Totais em fórmula, sobre o intervalo real das linhas de dados.
    const primeira = 2;
    const ultima = fechos.length + 1;
    const totais = ws.addRow(
      COLUNAS.map((c, i) => {
        if (i === 0) return 'TOTAL';
        if (c.tipo !== 'dinheiro') return null;
        const L = letraDaColuna(i + 1);
        return { formula: `SUM(${L}${primeira}:${L}${ultima})` };
      }),
    );
    COLUNAS.forEach((c, i) => {
      if (c.tipo === 'dinheiro') totais.getCell(i + 1).numFmt = EUR;
    });
    estilizarTotais(totais);

    // Cabeçalho fixo e filtro automático: a folha tem vinte e quatro colunas e
    // pode ter centenas de linhas. Sem isto, quem rola perde de vista o que
    // cada coluna é.
    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: COLUNAS.length },
    };
  },

  /** Folha agregada por semana. */
  folhaPorSemana(wb: ExcelJS.Workbook, fechos: SettlementPublic[]) {
    const ws = wb.addWorksheet('Por semana');

    const grupos = new Map<string, SettlementPublic[]>();
    for (const s of fechos) {
      const chave = new Date(s.weekStart).toISOString().slice(0, 10);
      const lista = grupos.get(chave) ?? [];
      lista.push(s);
      grupos.set(chave, lista);
    }

    this.folhaAgregada(
      ws,
      'Semana',
      18,
      [...grupos.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([chave, lista]) => ({
          rotulo: new Date(`${chave}T00:00:00.000Z`),
          formatoRotulo: DATA,
          lista,
        })),
    );
  },

  /** Folha agregada por motorista. */
  folhaPorMotorista(wb: ExcelJS.Workbook, fechos: SettlementPublic[]) {
    const ws = wb.addWorksheet('Por motorista');

    const grupos = new Map<string, SettlementPublic[]>();
    for (const s of fechos) {
      const lista = grupos.get(s.userName) ?? [];
      lista.push(s);
      grupos.set(s.userName, lista);
    }

    this.folhaAgregada(
      ws,
      'Motorista',
      30,
      [...grupos.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'pt'))
        .map(([rotulo, lista]) => ({ rotulo, lista })),
    );
  },

  /**
   * O corpo comum das duas folhas agregadas.
   *
   * As duas têm exatamente as mesmas colunas e a mesma linha de totais — só
   * muda o que está na primeira coluna. Escrevê-las em separado garantia que
   * uma correção numa fosse esquecida na outra.
   */
  folhaAgregada(
    ws: ExcelJS.Worksheet,
    rotuloPrimeiraColuna: string,
    larguraPrimeira: number,
    grupos: Array<{ rotulo: string | Date; formatoRotulo?: string; lista: SettlementPublic[] }>,
  ) {
    const medidas: Array<{ cabecalho: string; valor: (l: SettlementPublic[]) => number }> = [
      { cabecalho: 'Fechos', valor: (l) => l.length },
      { cabecalho: 'Uber', valor: (l) => soma(l, (s) => s.uberAmount) },
      { cabecalho: 'Bolt', valor: (l) => soma(l, (s) => s.boltAmount) },
      { cabecalho: 'Receita bruta', valor: (l) => soma(l, (s) => s.grossRevenue) },
      { cabecalho: 'Portagens', valor: (l) => soma(l, (s) => s.tollsAmount) },
      { cabecalho: 'Combustível', valor: (l) => soma(l, (s) => s.fuelAmount) },
      { cabecalho: 'Encargo viatura', valor: (l) => soma(l, (s) => s.vehicleFee) },
      { cabecalho: 'Total deduções', valor: (l) => soma(l, (s) => s.totalDeductions) },
      { cabecalho: 'Imposto', valor: (l) => soma(l, (s) => (s.taxRate === null ? 0 : s.taxAmount)) },
      { cabecalho: 'Comissão', valor: (l) => soma(l, (s) => s.commissionAmount) },
      { cabecalho: 'Líquido', valor: (l) => soma(l, (s) => s.netToDriver) },
    ];

    ws.columns = [
      { width: larguraPrimeira },
      ...medidas.map((m) => ({ width: m.cabecalho.length > 12 ? 15 : 13 })),
    ];

    estilizarCabecalho(ws.addRow([rotuloPrimeiraColuna, ...medidas.map((m) => m.cabecalho)]));

    for (const g of grupos) {
      const row = ws.addRow([g.rotulo, ...medidas.map((m) => m.valor(g.lista))]);
      if (g.formatoRotulo) row.getCell(1).numFmt = g.formatoRotulo;
      // A primeira medida é a contagem de fechos, que não é dinheiro.
      medidas.forEach((_, i) => {
        if (i > 0) row.getCell(i + 2).numFmt = EUR;
      });
      row.font = { size: 10 };
    }

    const primeira = 2;
    const ultima = grupos.length + 1;
    const totais = ws.addRow([
      'TOTAL',
      ...medidas.map((_, i) => {
        const L = letraDaColuna(i + 2);
        return { formula: `SUM(${L}${primeira}:${L}${ultima})` };
      }),
    ]);
    medidas.forEach((_, i) => {
      if (i > 0) totais.getCell(i + 2).numFmt = EUR;
    });
    estilizarTotais(totais);

    ws.views = [{ state: 'frozen', ySplit: 1 }];
  },

  /**
   * O nome do ficheiro leva o período.
   *
   * Dois ficheiros na pasta Downloads têm de ser distinguíveis sem os abrir, e
   * `faturacao.xlsx (1)` não distingue nada.
   */
  nomeDoFicheiro(filter: SettlementFilter): string {
    const dia = (d?: Date) => (d ? d.toISOString().slice(0, 10) : null);
    const de = dia(filter.from);
    const ate = dia(filter.to);

    if (de && ate) return `faturacao-${de}-a-${ate}.xlsx`;
    if (de) return `faturacao-desde-${de}.xlsx`;
    if (ate) return `faturacao-ate-${ate}.xlsx`;
    return `faturacao-${new Date().toISOString().slice(0, 10)}.xlsx`;
  },
};

function soma(lista: SettlementPublic[], f: (s: SettlementPublic) => number): number {
  return Math.round(lista.reduce((acc, s) => acc + f(s), 0) * 100) / 100;
}
