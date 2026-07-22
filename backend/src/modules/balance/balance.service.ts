// src/modules/balance/balance.service.ts
//
// Cálculo canônico do saldo do motorista:
//   disponível = ganhos + créditos − débitos − levantados (APPROVED/PAID) − reservados (PENDING)
// Levantamentos PENDING reservam o valor (evita pedir duas vezes o mesmo dinheiro);
// REJECTED devolve ao saldo automaticamente (não entra na soma).

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/AppError';
import { AdjustmentType, UserRole, WithdrawalStatus } from '../../shared/types/enums';

type Actor = { id: string; role?: UserRole };

function canManageBalance(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export interface BalanceSummary {
  totalEarnings: number;
  totalCredits: number;
  totalDebits: number;
  totalWithdrawn: number;   // APPROVED + PAID
  pendingWithdrawals: number; // PENDING (reservado)
  available: number;
}

export interface AdjustmentPublic {
  id: string;
  amount: number;
  type: AdjustmentType;
  reason: string;
  userId: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
}

export class BalanceService {
  private async ensureUserExists(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    return user;
  }

  private ensureOwnerOrManager(actor: Actor, userId: string) {
    if (!canManageBalance(actor.role) && actor.id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
  }

  async getSummary(actor: Actor, userId: string): Promise<BalanceSummary> {
    this.ensureOwnerOrManager(actor, userId);
    await this.ensureUserExists(userId);

    try {
      const [earnings, credits, debits, withdrawn, pending] = await Promise.all([
        prisma.earning.aggregate({ where: { userId }, _sum: { amount: true } }),
        prisma.balanceAdjustment.aggregate({
          where: { userId, type: AdjustmentType.CREDIT }, _sum: { amount: true },
        }),
        prisma.balanceAdjustment.aggregate({
          where: { userId, type: AdjustmentType.DEBIT }, _sum: { amount: true },
        }),
        prisma.withdrawal.aggregate({
          where: { userId, status: { in: [WithdrawalStatus.APPROVED, WithdrawalStatus.PAID] } },
          _sum: { amount: true },
        }),
        prisma.withdrawal.aggregate({
          where: { userId, status: WithdrawalStatus.PENDING },
          _sum: { amount: true },
        }),
      ]);

      const totalEarnings = Number(earnings._sum.amount ?? 0);
      const totalCredits = Number(credits._sum.amount ?? 0);
      const totalDebits = Number(debits._sum.amount ?? 0);
      const totalWithdrawn = Number(withdrawn._sum.amount ?? 0);
      const pendingWithdrawals = Number(pending._sum.amount ?? 0);

      const available =
        totalEarnings + totalCredits - totalDebits - totalWithdrawn - pendingWithdrawals;

      return {
        totalEarnings,
        totalCredits,
        totalDebits,
        totalWithdrawn,
        pendingWithdrawals,
        available: Math.round(available * 100) / 100,
      };
    } catch (err) {
      logger.error('Erro ao calcular saldo', err);
      throw err;
    }
  }

  async listAdjustments(actor: Actor, userId: string): Promise<AdjustmentPublic[]> {
    this.ensureOwnerOrManager(actor, userId);
    await this.ensureUserExists(userId);

    try {
      const rows = await prisma.balanceAdjustment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { admin: { select: { name: true } } },
      });

      return rows.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        type: r.type as AdjustmentType,
        reason: r.reason,
        userId: r.userId,
        createdBy: r.createdBy,
        createdByName: r.admin?.name ?? null,
        createdAt: r.createdAt,
      }));
    } catch (err) {
      logger.error('Erro ao listar ajustes de saldo', err);
      throw err;
    }
  }

  async createAdjustment(
    actor: Actor,
    userId: string,
    input: { type: AdjustmentType; amount: number; reason?: string },
  ): Promise<AdjustmentPublic> {
    if (!canManageBalance(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const user = await this.ensureUserExists(userId);

    // Débito não pode deixar o saldo negativo (proteção contra erro de digitação).
    if (input.type === AdjustmentType.DEBIT) {
      const { available } = await this.getSummary(actor, userId);
      if (input.amount > available) {
        throw new AppError(
          `Débito superior ao saldo disponível (€${available.toFixed(2)}).`,
          400,
          'DEBIT_EXCEEDS_BALANCE',
        );
      }
    }

    const reasonText = input.reason?.trim() || '';

    try {
      const created = await prisma.balanceAdjustment.create({
        data: {
          amount: input.amount,
          type: input.type,
          reason: reasonText,
          userId,
          createdBy: actor.id,
        },
        include: { admin: { select: { name: true } } },
      });

      // Notificação in-app para o motorista (não falha a operação principal)
      try {
        const isCredit = input.type === AdjustmentType.CREDIT;
        const suffix = reasonText ? ` — ${reasonText}` : '';
        await prisma.notification.create({
          data: {
            userId,
            title: isCredit ? 'Crédito adicionado ao seu saldo' : 'Débito aplicado ao seu saldo',
            message: `${isCredit ? '+' : '−'}€${input.amount.toFixed(2)}${suffix}`,
          },
        });
      } catch (notifErr) {
        logger.error('Erro ao criar notificação de ajuste de saldo', notifErr);
      }

      logger.info(
        `[balance] ${actor.id} aplicou ${input.type} de €${input.amount.toFixed(2)} em ${user.name} (${userId})${reasonText ? `: ${reasonText}` : ''}`,
      );

      return {
        id: created.id,
        amount: Number(created.amount),
        type: created.type as AdjustmentType,
        reason: created.reason,
        userId: created.userId,
        createdBy: created.createdBy,
        createdByName: created.admin?.name ?? null,
        createdAt: created.createdAt,
      };
    } catch (err) {
      logger.error('Erro ao criar ajuste de saldo', err);
      throw err;
    }
  }
}

export const balanceService = new BalanceService();