// src/modules/balance/balance.service.ts
//
// Cálculo canônico do saldo do motorista:
//   disponível = fechos semanais + créditos − débitos
//                − levantados (APPROVED/PAID) − reservados (PENDING)
//                − aplicado em investimentos + devolvido nos resgates
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

/**
 * Ver, e não gerir.
 *
 * O SUPPORT entra aqui; o ADMIN e o MANAGER também. A separação existe porque
 * antes uma única função guardava as duas coisas: as mesmas linhas que decidiam
 * quem *lê* decidiam quem *aprova*. Acrescentar o suporte a essa função
 * dava-lhe aprovação de dinheiro.
 *
 * A pergunta número um de quem responde a tickets é "onde está o meu dinheiro".
 * Sem ver, o suporte reencaminha para a administração e não poupa trabalho a
 * ninguém — só acrescenta um passo.
 */
function podeVer(role?: UserRole) {
  return role === UserRole.ADMIN
      || role === UserRole.MANAGER
      || role === UserRole.SUPPORT;
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
  /** Tudo o que alguma vez foi aplicado em investimentos (sai do saldo). */
  totalInvested: number;
  /** O que voltou dos investimentos nos resgates (entra no saldo). */
  totalInvestmentReturns: number;
  /** O que está aplicado neste momento. Informativo: já está dentro das duas de cima. */
  investedActive: number;
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
  /** Nulos enquanto nunca foi editado. Ver `updateAdjustment`. */
  editedAt?: Date | null;
  editedByName?: string | null;
}

export class BalanceService {
  private async ensureUserExists(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    return user;
  }

  private ensureOwnerOrManager(actor: Actor, userId: string) {
    if (!podeVer(actor.role) && actor.id !== userId) {
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
        invested: number;
        investment_returns: number;
        invested_active: number;
      }[]>`
        SELECT
          CAST(settlements         AS FLOAT) AS settlements,
          CAST(credits             AS FLOAT) AS credits,
          CAST(debits              AS FLOAT) AS debits,
          CAST(withdrawn           AS FLOAT) AS withdrawn,
          CAST(pending_withdrawals AS FLOAT) AS pending_withdrawals,
          CAST(reported_earnings   AS FLOAT) AS reported_earnings,
          CAST(available           AS FLOAT) AS available,
          CAST(invested            AS FLOAT) AS invested,
          CAST(investment_returns  AS FLOAT) AS investment_returns,
          CAST(invested_active     AS FLOAT) AS invested_active
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
        totalInvested: round(r?.invested ?? 0),
        totalInvestmentReturns: round(r?.investment_returns ?? 0),
        investedActive: round(r?.invested_active ?? 0),
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
        include: {
          admin: { select: { name: true } },
          editor: { select: { name: true } },
        },
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
        editedAt: r.editedAt,
        editedByName: r.editor?.name ?? null,
      }));
    } catch (err) {
      logger.error('Erro ao listar ajustes de saldo', err);
      throw err;
    }
  }

  /**
   * Corrigir a DATA e o MOTIVO de um ajuste. Nunca o valor nem o tipo.
   *
   * ─── PORQUE É QUE O VALOR NÃO SE EDITA ────────────────────────────────────
   *
   * Porque mudar um valor muda o saldo, e ficaria sem rasto: o extrato passava
   * a mostrar outro número e não haveria nada a dizer que ali esteve outro.
   * Um valor errado corrige-se com um ajuste contrário, que é como se corrige
   * dinheiro em qualquer lado — fica a linha errada, fica a correção, e a
   * soma fica certa.
   *
   * A data é diferente: não entra em soma nenhuma. A view `driver_balances`
   * não tem filtro temporal, por isso mudar a data não mexe um cêntimo no
   * saldo. Só muda a ORDEM do extrato — e portanto os saldos corridos de cada
   * linha, que é exatamente o que se quer arranjar quando um saldo de abertura
   * foi lançado depois dos primeiros fechos.
   */
  async updateAdjustment(
    actor: Actor,
    adjustmentId: string,
    input: { createdAt?: Date; reason?: string },
  ): Promise<AdjustmentPublic> {
    if (!canManageBalance(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const atual = await prisma.balanceAdjustment.findUnique({
      where: { id: adjustmentId },
      select: { id: true, createdAt: true, reason: true, userId: true },
    });
    if (!atual) {
      throw new AppError('Ajuste não encontrado.', 404, 'ADJUSTMENT_NOT_FOUND');
    }

    if (input.createdAt) {
      // Uma data no futuro põe o movimento no fim do extrato para sempre, e o
      // saldo corrido das linhas seguintes deixa de fazer sentido até esse dia
      // chegar. Uma margem de um dia cobre quem está noutro fuso.
      const limite = new Date(Date.now() + 24 * 60 * 60 * 1000);
      if (input.createdAt > limite) {
        throw new AppError('A data não pode ser no futuro.', 400, 'DATE_IN_FUTURE');
      }
      // Antes de 2020 é quase de certeza um ano mal escrito. O sistema não
      // existia, e uma data assim manda o movimento para o princípio de tudo.
      if (input.createdAt < new Date('2020-01-01')) {
        throw new AppError('A data parece errada — anterior a 2020.', 400, 'DATE_TOO_OLD');
      }
    }

    const mudouData = !!input.createdAt
      && input.createdAt.getTime() !== atual.createdAt.getTime();
    const novoMotivo = input.reason?.trim();
    const mudouMotivo = novoMotivo !== undefined && novoMotivo !== atual.reason;

    if (!mudouData && !mudouMotivo) {
      throw new AppError('Nada foi alterado.', 400, 'NOTHING_TO_UPDATE');
    }

    try {
      const atualizado = await prisma.balanceAdjustment.update({
        where: { id: adjustmentId },
        data: {
          ...(mudouData ? { createdAt: input.createdAt } : {}),
          ...(mudouMotivo ? { reason: novoMotivo } : {}),
          // O rasto grava-se em qualquer alteração, não só na data.
          editedAt: new Date(),
          editedBy: actor.id,
        },
        include: {
          admin: { select: { name: true } },
          editor: { select: { name: true } },
        },
      });

      logger.info(
        `[balance] ${actor.id} editou o ajuste ${adjustmentId} do utilizador ${atual.userId}`
        + (mudouData ? ` · data ${atual.createdAt.toISOString()} → ${input.createdAt!.toISOString()}` : '')
        + (mudouMotivo ? ` · motivo "${atual.reason}" → "${novoMotivo}"` : ''),
      );

      return {
        id: atualizado.id,
        amount: Number(atualizado.amount),
        type: atualizado.type as AdjustmentType,
        reason: atualizado.reason,
        userId: atualizado.userId,
        createdBy: atualizado.createdBy,
        createdByName: atualizado.admin?.name ?? null,
        createdAt: atualizado.createdAt,
        editedAt: atualizado.editedAt,
        editedByName: atualizado.editor?.name ?? null,
      };
    } catch (err) {
      logger.error('Erro ao editar ajuste de saldo', err);
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