// src/modules/settings/settings.service.ts
//
// Global system settings. There is exactly one row (id = "global").
// Reading is allowed for any authenticated user (the frontend needs limits like
// min/max withdrawal). Writing is ADMIN-only.

import { prisma } from '../../config/prisma';
import { UserRole } from '../../shared/types/enums';
import { AppError } from '../../shared/errors/AppError';

type Actor = { id: string; role?: UserRole };

const GLOBAL_ID = 'global';

// Whitelist of updatable fields (prevents mass-assignment of id/updatedAt/etc).
const EDITABLE_KEYS = [
  'companyCommission',
  'minWithdrawalAmount',
  'maxWithdrawalAmount',
  'withdrawalProcessingDays',
  'documentExpiryWarningDays',
  'uberIntegration',
  'boltIntegration',
  'emailNotifications',
  'smsNotifications',
  'autoApproveDocuments',
  'requireTwoFactorAuth',
] as const;

export type SettingsInput = Partial<Record<(typeof EDITABLE_KEYS)[number], number | boolean>>;

export class SettingsService {
  /** Returns the settings row, creating it with defaults on first access. */
  async get() {
    const existing = await prisma.systemSettings.findUnique({ where: { id: GLOBAL_ID } });
    if (existing) return existing;
    return prisma.systemSettings.create({ data: { id: GLOBAL_ID } });
  }

  /** ADMIN-only update. Validates ranges and ignores unknown keys. */
  async update(actor: Actor, input: SettingsInput) {
    if (actor.role !== UserRole.ADMIN) {
      throw new AppError('Acesso restrito a administradores', 403, 'FORBIDDEN');
    }

    const data: Record<string, number | boolean> = {};
    for (const key of EDITABLE_KEYS) {
      if (input[key] !== undefined) data[key] = input[key]!;
    }

    // Basic validation
    if (data.companyCommission !== undefined) {
      const c = Number(data.companyCommission);
      if (c < 0 || c > 100) throw new AppError('Comissão deve estar entre 0 e 100%.', 400, 'INVALID_RANGE');
    }
    if (
      data.minWithdrawalAmount !== undefined &&
      data.maxWithdrawalAmount !== undefined &&
      Number(data.minWithdrawalAmount) > Number(data.maxWithdrawalAmount)
    ) {
      throw new AppError('O valor mínimo não pode ser maior que o máximo.', 400, 'INVALID_RANGE');
    }

    // Ensure the row exists, then update
    await this.get();
    return prisma.systemSettings.update({
      where: { id: GLOBAL_ID },
      data: { ...data, updatedBy: actor.id },
    });
  }
}

export const settingsService = new SettingsService();
