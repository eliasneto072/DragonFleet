// src/modules/earnings/import/import.service.ts
//
// Takes an uploaded CSV buffer, parses it, and bulk-inserts the resulting
// earnings for the authenticated driver. Returns a summary the UI can show
// before/after import.

import { prisma } from '../../../config/prisma';
import { AppError } from '../../../shared/errors/AppError';
import { EarningPlatform } from '../../../shared/types/enums';
import { parseEarningsCsv, type ParseResult } from './csv-parser';

export interface ImportSummary {
  inserted: number;
  skippedDuplicates: number;
  invalidRows: number;
  totalAmount: number;
  detectedPlatform: EarningPlatform | null;
  errors: { line: number; reason: string }[];
}

export class EarningsImportService {
  /** Dry-run: parse + report without writing. Lets the UI preview first. */
  preview(csv: string, fallback?: EarningPlatform): ParseResult {
    const result = parseEarningsCsv(csv, fallback);
    if (result.rows.length === 0 && result.errors.length > 0) {
      // surface the most useful message but don't throw — UI shows errors list
    }
    return result;
  }

  /** Parse + persist for the given driver. Skips exact duplicates. */
  async commit(userId: string, csv: string, fallback?: EarningPlatform): Promise<ImportSummary> {
    const parsed = parseEarningsCsv(csv, fallback);

    if (parsed.rows.length === 0) {
      throw new AppError(
        parsed.errors[0]?.reason ?? 'Nenhuma linha válida encontrada no arquivo.',
        400,
        'IMPORT_EMPTY',
      );
    }

    // Dedupe against what's already stored for this user on the same
    // (date, platform, amount) — re-uploading the same statement is safe.
    const existing = await prisma.earning.findMany({
      where: { userId },
      select: { date: true, platform: true, amount: true },
    });
    const seen = new Set(
      existing.map((e) => `${e.date.toISOString().slice(0, 10)}|${e.platform}|${Number(e.amount).toFixed(2)}`),
    );

    const toInsert: { userId: string; amount: number; date: Date; platform: EarningPlatform }[] = [];
    let skipped = 0;

    for (const row of parsed.rows) {
      const key = `${row.date}|${row.platform}|${row.amount.toFixed(2)}`;
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      toInsert.push({
        userId,
        amount: row.amount,
        date: new Date(row.date),
        platform: row.platform,
      });
    }

    if (toInsert.length > 0) {
      await prisma.earning.createMany({ data: toInsert });
    }

    return {
      inserted: toInsert.length,
      skippedDuplicates: skipped,
      invalidRows: parsed.errors.length,
      totalAmount: toInsert.reduce((s, r) => s + r.amount, 0),
      detectedPlatform: parsed.detectedPlatform,
      errors: parsed.errors.slice(0, 20), // cap payload
    };
  }
}

export const earningsImportService = new EarningsImportService();
