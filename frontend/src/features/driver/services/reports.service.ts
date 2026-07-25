// src/features/driver/services/reports.service.ts
//
// Download do extrato de ganhos em PDF.
//
// Não passa pelo apiClient: aquele helper faz res.json() em toda resposta e
// engasgaria num corpo binário. O padrão aqui é o mesmo de
// documents.service.openFile — fetch cru com o token no cabeçalho.

import { tokenStorage } from '@/shared/lib/api-client';

const BASE_URL = import.meta.env.VITE_API_URL;

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
    const token = tokenStorage.getAccess();
    const query = new URLSearchParams({ from, to });
    if (userId) query.set('userId', userId);

    const res = await fetch(`${BASE_URL}/reports/earnings.pdf?${query.toString()}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

    if (!res.ok) {
      // O erro vem em JSON mesmo quando a rota devolveria PDF em caso de sucesso.
      const json = await res.json().catch(() => ({}));
      throw new Error(json?.message ?? 'Não foi possível gerar o PDF.');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `dragonfleet-ganhos-${from}_${to}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Revogar imediatamente cancela o download em alguns navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};