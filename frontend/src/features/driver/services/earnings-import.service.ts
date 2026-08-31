// src/features/driver/services/earnings-import.service.ts
//
// Importação de CSV dos portais.
//
// Usava um fetch cru porque o apiClient cravava Content-Type: application/json
// em todos os pedidos, o que impede um envio multipart. Essa limitação foi
// resolvida no api-client, que agora deteta o FormData — e com ela desaparece a
// razão de existir do fetch cru, mais o token e o tratamento de erro que ele
// repetia. O envio passa também a beneficiar da renovação silenciosa da sessão.

import { apiClient } from '@/shared/lib/api-client';
import type { EarningPlatform } from '@/shared/types/api';

export interface ImportPreview {
  rowCount: number;
  totalAmount: number;
  detectedPlatform: EarningPlatform | null;
  errors: { line: number; reason: string }[];
  sample: { amount: number; date: string; platform: EarningPlatform }[];
}

export interface ImportSummary {
  inserted: number;
  skippedDuplicates: number;
  invalidRows: number;
  totalAmount: number;
  detectedPlatform: EarningPlatform | null;
  errors: { line: number; reason: string }[];
}

function enviarCsv<T>(path: string, file: File, platform?: EarningPlatform): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  if (platform) form.append('platform', platform);
  return apiClient.upload<T>(path, form);
}

export const earningsImportService = {
  /** Parse only — show the user what will be imported before committing. */
  preview(file: File, platform?: EarningPlatform): Promise<ImportPreview> {
    return enviarCsv<ImportPreview>('/earnings/import/preview', file, platform);
  },

  /** Parse + persist. Returns how many rows were inserted/skipped. */
  commit(file: File, platform?: EarningPlatform): Promise<{ summary: ImportSummary }> {
    return enviarCsv<{ summary: ImportSummary }>('/earnings/import', file, platform);
  },
};
