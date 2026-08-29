// src/features/driver/services/reports.service.ts
//
// Download do extrato de ganhos em PDF.
//
// Não passa pelo apiClient: aquele helper faz res.json() em toda resposta e
// engasgaria num corpo binário. O padrão aqui é o mesmo de
// documents.service.openFile — fetch cru com o token no cabeçalho.

import { apiClient, saveBlob } from '@/shared/lib/api-client';


interface EarningsPdfParams {
  /** "YYYY-MM-DD" */
  from: string;
  /** "YYYY-MM-DD" */
  to: string;
  /** Só admin/manager pode pedir o extrato de outro utilizador. */
  userId?: string;
}

export const driverReportsService = {
  /** GET /reports/earnings.pdf — descarrega o extrato do período. */
  async downloadEarningsPdf({ from, to, userId }: EarningsPdfParams): Promise<void> {
    const query = new URLSearchParams({ from, to });
    if (userId) query.set('userId', userId);

    const { blob, filename } = await apiClient.download(
      `/reports/earnings.pdf?${query.toString()}`,
    );

    saveBlob(blob, filename ?? `dragonfleet-ganhos-${from}_${to}.pdf`);
  },
};