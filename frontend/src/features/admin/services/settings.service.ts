// src/features/admin/services/settings.service.ts

import { apiClient } from '@/shared/lib/api-client';

export interface SystemSettings {
  companyCommission: number;
  /** Imposto sobre a faturação, em pontos percentuais. Vale do próximo fecho. */
  settlementTaxRate: number;
  minWithdrawalAmount: number;
  maxWithdrawalAmount: number;
  withdrawalProcessingDays: number;
  documentExpiryWarningDays: number;
  uberIntegration: boolean;
  boltIntegration: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  autoApproveDocuments: boolean;
  requireTwoFactorAuth: boolean;
  updatedAt?: string;
}

export const settingsService = {
  /** GET /settings */
  get(): Promise<{ settings: SystemSettings }> {
    return apiClient.get('/settings');
  },

  /** PUT /settings (admin only) */
  update(input: Partial<SystemSettings>): Promise<{ settings: SystemSettings }> {
    return apiClient.put('/settings', input);
  },
};
