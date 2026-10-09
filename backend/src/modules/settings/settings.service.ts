// src/modules/settings/settings.service.ts
//
// Global system settings. There is exactly one row (id = "global").
// Reading is allowed for any authenticated user (the frontend needs limits like
// min/max withdrawal). Writing is ADMIN-only.

import { prisma } from '../../config/prisma';
import { UserRole } from '../../shared/types/enums';
import { AppError } from '../../shared/errors/AppError';

type Actor = { id: string; role?: UserRole };

// Whitelist of updatable fields (prevents mass-assignment of id/updatedAt/etc).
const EDITABLE_KEYS = [
  'companyCommission',
  'settlementTaxRate',
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
  /**
   * As definições DESTA frota, criadas com os valores de origem na primeira vez.
   *
   * ─── ERA UMA LINHA SÓ, E PASSOU A SER UMA POR FROTA ──────────────────────
   *
   * O id fixo "global" fazia sentido enquanto havia uma frota. Com várias, a
   * comissão, o imposto e os limites são de cada uma — e duas frotas a
   * partilhar a mesma linha era uma a mudar a comissão da outra.
   *
   * O `findFirst` já vem filtrado pela frota do pedido (ver `escopo.ts`), e o
   * `create` já nasce carimbado com ela. Não há aqui nenhum `where` de frota
   * escrito à mão, e é de propósito: o que não se escreve não se esquece.
   */
  async get() {
    const existente = await prisma.systemSettings.findFirst();
    if (existente) return existente;
    return prisma.systemSettings.create({ data: {} });
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
    // Alterar isto NÃO mexe nos fechos já registados: cada um gravou a taxa
    // que lhe foi aplicada. O valor daqui vale a partir do próximo fecho.
    if (data.settlementTaxRate !== undefined) {
      const t = Number(data.settlementTaxRate);
      if (isNaN(t) || t < 0 || t > 100) {
        throw new AppError('Imposto deve estar entre 0 e 100%.', 400, 'INVALID_RANGE');
      }
    }
    if (
      data.minWithdrawalAmount !== undefined &&
      data.maxWithdrawalAmount !== undefined &&
      Number(data.minWithdrawalAmount) > Number(data.maxWithdrawalAmount)
    ) {
      throw new AppError('O valor mínimo não pode ser maior que o máximo.', 400, 'INVALID_RANGE');
    }

    // Garante que a linha desta frota existe, e altera-a pelo id dela.
    const atual = await this.get();
    return prisma.systemSettings.update({
      where: { id: atual.id },
      data: { ...data, updatedBy: actor.id },
    });
  }
}

export const settingsService = new SettingsService();
