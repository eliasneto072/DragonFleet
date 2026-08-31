// src/features/admin/services/reports.service.ts
//
// Downloads the admin financial PDF. Uses raw fetch because we need the
// binary blob, not JSON (the shared apiClient parses JSON).

import { apiClient, saveBlob } from '@/shared/lib/api-client';


export interface ReportRange {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}

export const reportsService = {
  /** Descarrega o relatório financeiro em PDF. */
  async downloadFinancialPdf(range: ReportRange = {}): Promise<void> {
    const params = new URLSearchParams();
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const { blob, filename } = await apiClient.download(`/reports/financial.pdf${qs}`);

    // O nome sugerido pelo servidor manda; o de reserva só existe para o caso
    // de a rota não enviar Content-Disposition.
    saveBlob(blob, filename ?? `dragonfleet-financeiro-${new Date().toISOString().slice(0, 10)}.pdf`);
  },
};
