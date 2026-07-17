// src/features/driver/services/earnings-import.service.ts
//
// Uploads a CSV file (multipart). The shared apiClient forces JSON content-type,
// which breaks file uploads, so these calls use raw fetch with the same token
// and base URL conventions.

import { tokenStorage, ApiError } from '@/shared/lib/api-client';
import type { EarningPlatform } from '@/shared/types/api';

const BASE_URL = import.meta.env.VITE_API_URL;

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

async function upload<T>(path: string, file: File, platform?: EarningPlatform): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  if (platform) form.append('platform', platform);

  const token = tokenStorage.getAccess();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined, // no Content-Type → browser sets boundary
    body: form,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, json?.code ?? 'IMPORT_ERROR', json?.message ?? 'Falha ao importar o arquivo.');
  }
  return (json.data ?? json) as T;
}

export const earningsImportService = {
  /** Parse only — show the user what will be imported before committing. */
  preview(file: File, platform?: EarningPlatform): Promise<ImportPreview> {
    return upload<ImportPreview>('/earnings/import/preview', file, platform);
  },

  /** Parse + persist. Returns how many rows were inserted/skipped. */
  commit(file: File, platform?: EarningPlatform): Promise<{ summary: ImportSummary }> {
    return upload<{ summary: ImportSummary }>('/earnings/import', file, platform);
  },
};
