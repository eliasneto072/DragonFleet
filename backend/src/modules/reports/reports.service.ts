// src/modules/reports/reports.service.ts
//
// Generates the admin financial report as a PDF (pdfkit, streamed).
// No headless browser needed — fast and memory-light.
//
// Install once:  npm i pdfkit && npm i -D @types/pdfkit
//
// The service writes directly into the Express Response stream so large
// reports never buffer fully in memory.

import PDFDocument from 'pdfkit';
import type { Response } from 'express';
import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import { reportsRepository, type FinancialReportData } from './reports.repository';

type Actor = { id: string; role?: UserRole };

// Brand palette (kept in sync with frontend theme)
const BRAND = '#108865';
const BRAND_DARK = '#0d6b4f';
const INK = '#1a1a1a';
const MUTED = '#6b7280';
const LINE = '#e4e6e4';

const PLATFORM_LABEL: Record<string, string> = {
  UBER: 'Uber', BOLT: 'Bolt', FREE_NOW: 'Free Now', OTHER: 'Outro',
};

const brl = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

const fmtDate = (d: Date) =>
  d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

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

    const data = await reportsRepository.getFinancialReport(from, to);

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

  // ── Sections ────────────────────────────────────────────────────────────────

  private renderHeader(doc: PDFKit.PDFDocument, data: FinancialReportData) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    // Brand bar
    doc.rect(0, 0, doc.page.width, 6).fill(BRAND);

    // Logo mark
    doc.roundedRect(left, 40, 30, 30, 7).fill(BRAND_DARK);
    doc.fillColor('#fff').fontSize(16).font('Helvetica-Bold').text('DF', left + 7, 47);

    // Title
    doc.fillColor(INK).fontSize(20).font('Helvetica-Bold')
      .text('DragonFleet', left + 42, 42);
    doc.fillColor(MUTED).fontSize(10).font('Helvetica')
      .text('Relatório Financeiro', left + 42, 65);

    // Period (right aligned)
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
      { label: 'Receita da empresa (comissão 20%)', value: brl(data.totals.companyRevenue), accent: true },
      { label: 'Ganhos brutos dos motoristas', value: brl(data.totals.grossEarnings) },
      { label: 'Retiradas pagas / aprovadas', value: brl(data.totals.paidWithdrawals) },
      { label: 'Retiradas pendentes', value: brl(data.totals.pendingWithdrawals) },
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

    // Inline counters
    const counters = [
      `${data.counts.activeDrivers}/${data.counts.totalDrivers} motoristas ativos`,
      `${data.counts.earningsCount} lançamentos`,
      `${data.counts.withdrawalsCount} retiradas`,
      `Saldo devido: ${brl(data.totals.outstandingBalance)}`,
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

    // Header row
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
        .text(brl(p.total), left, y + 4, { width: right - left, align: 'right' });

      // mini bar
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
        .text(brl(d.total), left, y + 4, { width: right - left, align: 'right' });
      y += 30;
      if (y > doc.page.height - 80) { doc.addPage(); y = doc.page.margins.top; }
    });

    doc.y = y;
  }

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
