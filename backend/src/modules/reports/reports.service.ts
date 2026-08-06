// src/modules/reports/reports.service.ts
//
// Generates PDF reports (pdfkit, streamed). No headless browser needed —
// fast and memory-light.
//
// Install once:  npm i pdfkit && npm i -D @types/pdfkit
//
// The service writes directly into the Express Response stream so large
// reports never buffer fully in memory.
//
// Dois relatórios:
//   streamFinancialReport      — visão da empresa, apenas administradores
//   streamDriverEarningsReport — extrato de um motorista, dono ou gestão

import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import {
  reportsRepository,
  type FinancialReportData,
  type DriverEarningsReportData,
} from './reports.repository';
import { settingsService } from '../settings/settings.service';

type Actor = { id: string; role?: UserRole };

// Brand palette (kept in sync with frontend theme)
const BRAND = '#108865';
const BRAND_DARK = '#0d6b4f';
const INK = '#1a1a1a';
const MUTED = '#6b7280';
const LINE = '#e4e6e4';
const DANGER = '#b91c1c';

const PLATFORM_LABEL: Record<string, string> = {
  UBER: 'Uber', BOLT: 'Bolt', FREE_NOW: 'Free Now', OTHER: 'Outro',
};

// A aplicação opera em Portugal e em euros. Este formatador estava em
// pt-BR/BRL, o que emitia o relatório financeiro em reais — a mesma classe de
// erro que shared/lib/format.ts existe para evitar no frontend.
const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

const fmtDate = (d: Date) =>
  d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtShortDate = (d: Date) => d.toLocaleDateString('pt-PT');

function canManage(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export class ReportsService {
  /** Validates admin access, aggregates data, streams a PDF into `res`. */
  async streamFinancialReport(actor: Actor, res: Response, opts: { from?: string; to?: string }) {
    // Defense in depth: route already guards with requireAdmin, but never trust that alone.
    if (actor.role !== UserRole.ADMIN) {
      throw new AppError('Acesso restrito a administradores', 403, 'FORBIDDEN');
    }

    const to = opts.to ? new Date(opts.to) : new Date();
    const from = opts.from
      ? new Date(opts.from)
      : new Date(to.getFullYear(), to.getMonth() - 5, 1); // default: últimos 6 meses

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new AppError('Intervalo de datas inválido', 400, 'INVALID_RANGE');
    }

    // A comissão vem das configurações, não de uma constante: o valor cravado
    // no repositório dizia 20% enquanto o sistema estava em 15, e o PDF saía
    // com a receita da empresa um terço acima do real.
    const settings = await settingsService.get();
    const commissionRate = Number(settings.companyCommission ?? 0) / 100;

    const data = await reportsRepository.getFinancialReport(from, to, commissionRate);

    const filename = `dragonfleet-financeiro-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    doc.pipe(res);

    this.renderHeader(doc, data);
    this.renderKpis(doc, data);
    this.renderPlatformTable(doc, data);
    this.renderTopDrivers(doc, data);
    this.renderFooter(doc);

    doc.end();
  }

  /**
   * Extrato de ganhos de um motorista.
   *
   * O guard de papel na rota não cobre este endpoint (um motorista precisa
   * aceder ao próprio extrato), então a posse é validada aqui.
   */
  async streamDriverEarningsReport(
    actor: Actor,
    res: Response,
    opts: { userId: string; from?: string; to?: string },
  ) {
    if (!canManage(actor.role) && actor.id !== opts.userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const to = opts.to ? new Date(opts.to) : new Date();
    const from = opts.from
      ? new Date(opts.from)
      : new Date(to.getFullYear(), to.getMonth(), to.getDate() - 29);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new AppError('Intervalo de datas inválido', 400, 'INVALID_RANGE');
    }
    if (from > to) {
      throw new AppError('Data inicial posterior à final', 400, 'INVALID_RANGE');
    }

    // O intervalo chega como data pura; estender ao fim do dia evita perder
    // os lançamentos do próprio dia final.
    to.setHours(23, 59, 59, 999);

    const data = await reportsRepository.getDriverEarningsReport(opts.userId, from, to);
    if (!data) throw new AppError('Utilizador não encontrado', 404, 'USER_NOT_FOUND');

    const filename = `dragonfleet-ganhos-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    doc.pipe(res);

    this.renderDriverHeader(doc, data);
    this.renderDriverSummary(doc, data);
    this.renderDriverPlatforms(doc, data);
    this.renderDriverStatement(doc, data);
    this.renderFooter(doc);

    doc.end();
  }

  // ── Financeiro (empresa) ────────────────────────────────────────────────────

  private renderHeader(doc: PDFKit.PDFDocument, data: FinancialReportData) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    doc.rect(0, 0, doc.page.width, 6).fill(BRAND);

    doc.roundedRect(left, 40, 30, 30, 7).fill(BRAND_DARK);
    doc.fillColor('#fff').fontSize(16).font('Helvetica-Bold').text('DF', left + 7, 47);

    doc.fillColor(INK).fontSize(20).font('Helvetica-Bold')
      .text('DragonFleet', left + 42, 42);
    doc.fillColor(MUTED).fontSize(10).font('Helvetica')
      .text('Relatório Financeiro', left + 42, 65);

    doc.fillColor(MUTED).fontSize(9).font('Helvetica')
      .text('Período', left, 42, { width: right - left, align: 'right' });
    doc.fillColor(INK).fontSize(11).font('Helvetica-Bold')
      .text(`${fmtDate(data.range.from)} — ${fmtDate(data.range.to)}`,
        left, 56, { width: right - left, align: 'right' });
    doc.fillColor(MUTED).fontSize(8).font('Helvetica')
      .text(`Gerado em ${fmtDate(new Date())}`,
        left, 72, { width: right - left, align: 'right' });

    doc.moveTo(left, 92).lineTo(right, 92).strokeColor(LINE).lineWidth(1).stroke();
    doc.y = 108;
  }

  private renderKpis(doc: PDFKit.PDFDocument, data: FinancialReportData) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const gap = 12;
    const colW = (right - left - gap) / 2;
    const rowH = 64;
    const startY = doc.y;

    const cards: { label: string; value: string; accent?: boolean }[] = [
      // A percentagem vem dos dados: cravada no texto, o PDF continuaria a
      // dizer 20% mesmo depois de o cálculo passar a usar o valor real.
      { label: `Receita da empresa (comissão ${data.commissionPercent}%)`, value: eur(data.totals.companyRevenue), accent: true },
      { label: 'Ganhos brutos dos motoristas', value: eur(data.totals.grossEarnings) },
      { label: 'Retiradas pagas / aprovadas', value: eur(data.totals.paidWithdrawals) },
      { label: 'Retiradas pendentes', value: eur(data.totals.pendingWithdrawals) },
    ];

    cards.forEach((c, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = left + col * (colW + gap);
      const y = startY + row * (rowH + gap);

      if (c.accent) {
        doc.roundedRect(x, y, colW, rowH, 8).fill(BRAND);
        doc.fillColor('#c2e8d8').fontSize(8.5).font('Helvetica').text(c.label, x + 14, y + 12, { width: colW - 28 });
        doc.fillColor('#fff').fontSize(18).font('Helvetica-Bold').text(c.value, x + 14, y + 30, { width: colW - 28 });
      } else {
        doc.roundedRect(x, y, colW, rowH, 8).fillAndStroke('#ffffff', LINE);
        doc.fillColor(MUTED).fontSize(8.5).font('Helvetica').text(c.label, x + 14, y + 12, { width: colW - 28 });
        doc.fillColor(INK).fontSize(17).font('Helvetica-Bold').text(c.value, x + 14, y + 30, { width: colW - 28 });
      }
    });

    doc.y = startY + 2 * rowH + gap + 22;

    const counters = [
      `${data.counts.activeDrivers}/${data.counts.totalDrivers} motoristas ativos`,
      `${data.counts.earningsCount} lançamentos`,
      `${data.counts.withdrawalsCount} retiradas`,
      `Saldo devido: ${eur(data.totals.outstandingBalance)}`,
    ];
    doc.fillColor(MUTED).fontSize(9).font('Helvetica')
      .text(counters.join('     •     '), left, doc.y, { width: right - left });
    doc.moveDown(1.5);
  }

  private renderPlatformTable(doc: PDFKit.PDFDocument, data: FinancialReportData) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    doc.fillColor(INK).fontSize(13).font('Helvetica-Bold').text('Ganhos por plataforma');
    doc.moveDown(0.5);

    const grand = data.byPlatform.reduce((s, p) => s + p.total, 0) || 1;
    const y0 = doc.y;

    doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold');
    doc.text('Plataforma', left, y0);
    doc.text('Lançamentos', left, y0, { width: right - left, align: 'center' });
    doc.text('Total', left, y0, { width: right - left, align: 'right' });
    doc.moveTo(left, y0 + 16).lineTo(right, y0 + 16).strokeColor(LINE).lineWidth(0.8).stroke();

    let y = y0 + 24;
    data.byPlatform.forEach((p) => {
      const label = PLATFORM_LABEL[p.platform] ?? p.platform;
      const share = Math.round((p.total / grand) * 100);

      doc.fillColor(INK).fontSize(10).font('Helvetica-Bold').text(label, left, y);
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(`${share}% do total`, left, y + 12);

      doc.fillColor(INK).fontSize(10).font('Helvetica')
        .text(String(p.count), left, y + 4, { width: right - left, align: 'center' });
      doc.fillColor(INK).fontSize(10).font('Helvetica-Bold')
        .text(eur(p.total), left, y + 4, { width: right - left, align: 'right' });

      const barY = y + 26;
      const barW = right - left;
      doc.roundedRect(left, barY, barW, 4, 2).fill('#f0f1f0');
      doc.roundedRect(left, barY, Math.max((barW * share) / 100, 2), 4, 2).fill(BRAND);

      y = barY + 16;
    });

    doc.y = y + 6;
    doc.moveDown(0.5);
  }

  private renderTopDrivers(doc: PDFKit.PDFDocument, data: FinancialReportData) {
    if (data.topDrivers.length === 0) return;

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    if (doc.y > doc.page.height - 220) doc.addPage();

    doc.fillColor(INK).fontSize(13).font('Helvetica-Bold').text('Top motoristas por ganhos');
    doc.moveDown(0.5);

    const y0 = doc.y;
    doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold');
    doc.text('#', left, y0, { width: 20 });
    doc.text('Motorista', left + 26, y0);
    doc.text('Ganhos', left, y0, { width: right - left, align: 'right' });
    doc.moveTo(left, y0 + 16).lineTo(right, y0 + 16).strokeColor(LINE).lineWidth(0.8).stroke();

    let y = y0 + 24;
    data.topDrivers.forEach((d, i) => {
      doc.fillColor(BRAND).fontSize(10).font('Helvetica-Bold').text(String(i + 1), left, y, { width: 20 });
      doc.fillColor(INK).fontSize(10).font('Helvetica-Bold').text(d.name, left + 26, y);
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(d.email, left + 26, y + 12);
      doc.fillColor(INK).fontSize(10).font('Helvetica-Bold')
        .text(eur(d.total), left, y + 4, { width: right - left, align: 'right' });
      y += 30;
      if (y > doc.page.height - 80) { doc.addPage(); y = doc.page.margins.top; }
    });

    doc.y = y;
  }

  // ── Extrato do motorista ────────────────────────────────────────────────────

  private renderDriverHeader(doc: PDFKit.PDFDocument, data: DriverEarningsReportData) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    doc.rect(0, 0, doc.page.width, 6).fill(BRAND);

    doc.roundedRect(left, 40, 30, 30, 7).fill(BRAND_DARK);
    doc.fillColor('#fff').fontSize(16).font('Helvetica-Bold').text('DF', left + 7, 47);

    doc.fillColor(INK).fontSize(20).font('Helvetica-Bold')
      .text('DragonFleet', left + 42, 42);
    doc.fillColor(MUTED).fontSize(10).font('Helvetica')
      .text('Extrato de ganhos', left + 42, 65);

    doc.fillColor(MUTED).fontSize(9).font('Helvetica')
      .text('Período', left, 42, { width: right - left, align: 'right' });
    doc.fillColor(INK).fontSize(11).font('Helvetica-Bold')
      .text(`${fmtDate(data.range.from)} — ${fmtDate(data.range.to)}`,
        left, 56, { width: right - left, align: 'right' });
    doc.fillColor(MUTED).fontSize(8).font('Helvetica')
      .text(`Gerado em ${fmtDate(new Date())}`,
        left, 72, { width: right - left, align: 'right' });

    doc.moveTo(left, 92).lineTo(right, 92).strokeColor(LINE).lineWidth(1).stroke();

    doc.fillColor(INK).fontSize(12).font('Helvetica-Bold').text(data.driver.name, left, 104);
    doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(data.driver.email, left, 120);

    doc.y = 142;
  }

  private renderDriverSummary(doc: PDFKit.PDFDocument, data: DriverEarningsReportData) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const startY = doc.y;
    const cardH = 68;
    const fullW = right - left;

    // Destaque do valor líquido
    doc.roundedRect(left, startY, fullW, cardH, 8).fill(BRAND);
    doc.fillColor('#c2e8d8').fontSize(9).font('Helvetica')
      .text('Ganhos líquidos no período', left + 16, startY + 14);
    doc.fillColor('#fff').fontSize(24).font('Helvetica-Bold')
      .text(eur(data.totals.net), left + 16, startY + 30);

    let y = startY + cardH + 12;

    const gap = 10;
    const colW = (fullW - gap * 2) / 3;
    const smallH = 56;

    const cards: { label: string; value: string; color: string }[] = [
      { label: 'Corridas registadas', value: eur(data.totals.registered), color: INK },
      { label: 'Adicionado pela gestão', value: eur(data.totals.added), color: INK },
      { label: 'Descontos', value: `− ${eur(data.totals.deducted)}`, color: data.totals.deducted > 0 ? DANGER : MUTED },
    ];

    cards.forEach((c, i) => {
      const x = left + i * (colW + gap);
      doc.roundedRect(x, y, colW, smallH, 8).fillAndStroke('#ffffff', LINE);
      doc.fillColor(MUTED).fontSize(8).font('Helvetica')
        .text(c.label, x + 12, y + 11, { width: colW - 24 });
      doc.fillColor(c.color).fontSize(13).font('Helvetica-Bold')
        .text(c.value, x + 12, y + 28, { width: colW - 24 });
    });

    y += smallH + 16;

    doc.fillColor(MUTED).fontSize(9).font('Helvetica')
      .text(
        `${data.counts.earnings} corrida(s) registada(s)     •     ${data.counts.adjustments} lançamento(s) da gestão`,
        left, y, { width: fullW },
      );

    doc.y = y + 24;
  }

  private renderDriverPlatforms(doc: PDFKit.PDFDocument, data: DriverEarningsReportData) {
    if (data.byPlatform.length === 0) return;

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    doc.fillColor(INK).fontSize(13).font('Helvetica-Bold').text('De onde veio o dinheiro', left, doc.y);
    doc.moveDown(0.5);

    const grand = data.byPlatform.reduce((s, p) => s + p.total, 0) || 1;
    let y = doc.y;

    data.byPlatform.forEach((p) => {
      const label = PLATFORM_LABEL[p.platform] ?? p.platform;
      const share = Math.round((p.total / grand) * 100);

      doc.fillColor(INK).fontSize(10).font('Helvetica-Bold').text(label, left, y);
      doc.fillColor(MUTED).fontSize(9).font('Helvetica')
        .text(`${p.count} lançamento(s)`, left, y, { width: right - left, align: 'center' });
      doc.fillColor(INK).fontSize(10).font('Helvetica-Bold')
        .text(`${eur(p.total)}   ${share}%`, left, y, { width: right - left, align: 'right' });

      const barY = y + 16;
      const barW = right - left;
      doc.roundedRect(left, barY, barW, 4, 2).fill('#f0f1f0');
      doc.roundedRect(left, barY, Math.max((barW * share) / 100, 2), 4, 2).fill(BRAND);

      y = barY + 16;
    });

    doc.y = y + 8;
  }

  private renderDriverStatement(doc: PDFKit.PDFDocument, data: DriverEarningsReportData) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const colDate = left;
    const colLabel = left + 74;
    const colDetail = left + 190;

    if (doc.y > doc.page.height - 160) doc.addPage();

    doc.fillColor(INK).fontSize(13).font('Helvetica-Bold').text('Detalhe dos lançamentos', left, doc.y);
    doc.moveDown(0.5);

    if (data.rows.length === 0) {
      doc.fillColor(MUTED).fontSize(10).font('Helvetica')
        .text('Nenhum lançamento neste período.', left, doc.y);
      doc.moveDown(1);
      return;
    }

    const drawTableHead = () => {
      const y0 = doc.y;
      doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold');
      doc.text('Data', colDate, y0);
      doc.text('Origem', colLabel, y0);
      doc.text('Detalhe', colDetail, y0);
      doc.text('Valor', left, y0, { width: right - left, align: 'right' });
      doc.moveTo(left, y0 + 14).lineTo(right, y0 + 14).strokeColor(LINE).lineWidth(0.8).stroke();
      return y0 + 22;
    };

    let y = drawTableHead();

    data.rows.forEach((r) => {
      // Reserva espaço para o rodapé antes de escrever a linha.
      if (y > doc.page.height - 70) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        y = drawTableHead();
      }

      const negative = r.amount < 0;

      doc.fillColor(MUTED).fontSize(9).font('Helvetica')
        .text(fmtShortDate(r.date), colDate, y, { width: 70 });
      doc.fillColor(INK).fontSize(9).font('Helvetica-Bold')
        .text(r.label, colLabel, y, { width: 110, ellipsis: true });
      doc.fillColor(MUTED).fontSize(9).font('Helvetica')
        .text(r.detail, colDetail, y, { width: right - colDetail - 90, ellipsis: true });
      doc.fillColor(negative ? DANGER : INK).fontSize(9).font('Helvetica-Bold')
        .text(`${negative ? '− ' : '+ '}${eur(Math.abs(r.amount))}`,
          left, y, { width: right - left, align: 'right' });

      y += 18;
      doc.moveTo(left, y - 5).lineTo(right, y - 5).strokeColor(LINE).lineWidth(0.4).stroke();
    });

    doc.y = y + 6;

    doc.fillColor(INK).fontSize(10).font('Helvetica-Bold')
      .text('Total do período', colDate, doc.y);
    doc.fillColor(INK).fontSize(11).font('Helvetica-Bold')
      .text(eur(data.totals.net), left, doc.y - 12, { width: right - left, align: 'right' });

    doc.moveDown(1);
  }

  // ── Comum ───────────────────────────────────────────────────────────────────

  private renderFooter(doc: PDFKit.PDFDocument) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const y = doc.page.height - 34;
      doc.moveTo(left, y).lineTo(right, y).strokeColor(LINE).lineWidth(0.8).stroke();
      doc.fillColor(MUTED).fontSize(8).font('Helvetica')
        .text('DragonFleet — Relatório confidencial', left, y + 6);
      doc.fillColor(MUTED).fontSize(8)
        .text(`Página ${i + 1} de ${range.count}`, left, y + 6, { width: right - left, align: 'right' });
    }
  }
}

export const reportsService = new ReportsService();