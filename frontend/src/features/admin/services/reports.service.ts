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

  /**
   * Descarrega a Faturação em Excel.
   *
   * Os filtros são os MESMOS que a tela usa na listagem, e passam na query
   * string para o servidor os interpretar com o `settlementFiltersShape` que
   * partilha com o `listSettlementsSchema`. É isso que garante que o total da
   * tela e o total do ficheiro nunca discordam.
   *
   * Ao contrário da exportação CSV dos Recibos Verdes, aqui a paginação NÃO
   * entra: o ficheiro leva a seleção inteira. Um contabilista que pede o mês
   * espera o mês, não as vinte e cinco linhas que estavam no ecrã.
   */
  async downloadSettlementsXlsx(filters: SettlementExportFilters = {}): Promise<void> {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.status) params.set('status', filters.status);
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.search?.trim()) params.set('search', filters.search.trim());
    const qs = params.toString() ? `?${params.toString()}` : '';

    const { blob, filename } = await apiClient.download(`/reports/settlements.xlsx${qs}`);

    saveBlob(blob, filename ?? `faturacao-${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  /**
   * Descarrega os Recibos Verdes em Excel.
   *
   * O CSV continua a existir ao lado: um contabilista pode ter uma importacao
   * que o consome. Este e para ler — com folhas, totais por sociedade e
   * formatos.
   */
  async downloadReceiptsXlsx(filters: { companyId?: string; search?: string } = {}): Promise<void> {
    const params = new URLSearchParams();
    if (filters.companyId) params.set('companyId', filters.companyId);
    if (filters.search?.trim()) params.set('search', filters.search.trim());
    const qs = params.toString() ? `?${params.toString()}` : '';

    const { blob, filename } = await apiClient.download(`/reports/receipts.xlsx${qs}`);

    saveBlob(blob, filename ?? `recibos-verdes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  },
};

export interface SettlementExportFilters {
  from?: string;
  to?: string;
  status?: string;
  userId?: string;
  search?: string;
}