// src/features/admin/services/reports.service.ts
//
// Downloads the admin financial PDF. Uses raw fetch because we need the
// binary blob, not JSON (the shared apiClient parses JSON).

import { tokenStorage, ApiError } from '@/shared/lib/api-client';

const BASE_URL = import.meta.env.VITE_API_URL;

export interface ReportRange {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}

export const reportsService = {
  /** Fetches the financial report PDF and triggers a browser download. */
  async downloadFinancialPdf(range: ReportRange = {}): Promise<void> {
    const params = new URLSearchParams();
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const token = tokenStorage.getAccess();
    const res = await fetch(`${BASE_URL}/reports/financial.pdf${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!res.ok) {
      // Error responses are JSON even on this endpoint
      const json = await res.json().catch(() => ({}));
      throw new ApiError(res.status, json?.code ?? 'REPORT_ERROR', json?.message ?? 'Falha ao gerar o relatório.');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    // Pull filename from Content-Disposition if present
    const disp = res.headers.get('Content-Disposition') ?? '';
    const match = disp.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] ?? `dragonfleet-financeiro-${new Date().toISOString().slice(0, 10)}.pdf`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
