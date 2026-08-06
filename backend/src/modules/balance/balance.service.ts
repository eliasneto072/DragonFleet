// src/modules/balance/balance.service.ts
//
// Cálculo canônico do saldo do motorista:
//   disponível = fechos semanais + créditos − débitos
//                − levantados (APPROVED/PAID) − reservados (PENDING)
//
// Levantamentos PENDING reservam o valor (evita pedir duas vezes o mesmo dinheiro);
// REJECTED devolve ao saldo automaticamente (não entra na soma).
//
// OS LANÇAMENTOS DO MOTORISTA NÃO ENTRAM AQUI.
//
// O dinheiro tem uma porta só: o fecho semanal registado pela administração.
// O que o motorista comunica é conferência cruzada para quem fecha a semana —
// se também creditasse, o mesmo dinheiro entraria por dois caminhos e a semana
// seria paga duas vezes. `totalEarnings` continua na resposta como informação,
// mas fora do cálculo de `available`.
//
// A fórmula vive na view `driver_balances` (ver a migração
// add_driver_balances_view). Estava replicada aqui e três vezes em SQL no
// analytics.repository; uma correção chegou a ser aplicada numa cópia e
// esquecida noutra, e o painel divergiu das contas individuais.

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/AppError';
import { AdjustmentType, UserRole } from '../../shared/types/enums';

type Actor = { id: string; role?: UserRole };

function canManageBalance(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export interface BalanceSummary {
  /** Informativo: o que o motorista comunicou. NÃO entra em `available`. */
  totalEarnings: number;
  /** Soma líquida dos fechos semanais registados. É daqui que vem o dinheiro. */
  totalSettlements: number;
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

  /**
   * Saldo de um motorista, lido da view `driver_balances`.
   *
   * Eram seis agregações somadas aqui, e a mesma fórmula estava replicada três
   * vezes em SQL no analytics.repository. Quando os fechos semanais passaram a
   * ser a origem do dinheiro, uma das cópias ficou para trás e o painel do
   * administrador divergiu das contas individuais — só foi apanhado por causa
   * de um comentário.
   *
   * A view é a única definição. Alterar a regra é alterar um ficheiro, e não há
   * outra cópia para ficar desatualizada.
   */
  async getSummary(actor: Actor, userId: string): Promise<BalanceSummary> {
    this.ensureOwnerOrManager(actor, userId);
    await this.ensureUserExists(userId);

    try {
      const rows = await prisma.$queryRaw<{
        settlements: number;
        credits: number;
        debits: number;
        withdrawn: number;
        pending_withdrawals: number;
        reported_earnings: number;
        available: number;
      }[]>`
        SELECT
          CAST(settlements         AS FLOAT) AS settlements,
          CAST(credits             AS FLOAT) AS credits,
          CAST(debits              AS FLOAT) AS debits,
          CAST(withdrawn           AS FLOAT) AS withdrawn,
          CAST(pending_withdrawals AS FLOAT) AS pending_withdrawals,
          CAST(reported_earnings   AS FLOAT) AS reported_earnings,
          CAST(available           AS FLOAT) AS available
        FROM driver_balances
        WHERE user_id = ${userId}
      `;

      // ensureUserExists já garantiu que o utilizador existe; a linha só falta
      // se a view não estiver criada, e aí zeros são melhores do que rebentar.
      const r = rows[0];

      const round = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

      return {
        totalEarnings: round(r?.reported_earnings ?? 0),
        totalSettlements: round(r?.settlements ?? 0),
        totalCredits: round(r?.credits ?? 0),
        totalDebits: round(r?.debits ?? 0),
        totalWithdrawn: round(r?.withdrawn ?? 0),
        pendingWithdrawals: round(r?.pending_withdrawals ?? 0),
        available: round(r?.available ?? 0),
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

    // O débito PODE deixar o saldo negativo.
    //
    // Havia aqui uma guarda que o recusava, escrita quando a regra era outra.
    // Mas o negativo é o comportamento pretendido: um motorista cujas despesas
    // superem os ganhos fica a dever, e o valor é descontado dos fechos
    // seguintes. Impedir o débito não faria a dívida desaparecer — apenas
    // impediria de a registar, e o saldo passaria a mentir.
    //
    // O erro de digitação que a guarda tentava evitar continua possível, e é
    // tratado do lado certo: o painel avisa quem está negativo, e o ajuste fica
    // no histórico com nome e motivo, podendo ser corrigido com um crédito.

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