// src/modules/earnings/earnings.service.ts
//
// Lançamentos comunicados pelo motorista.
//
// NÃO MOVIMENTAM SALDO. O dinheiro entra por uma porta só — o fecho semanal
// registado pela administração. O que está aqui é o que o motorista diz ter
// feito, e serve de conferência cruzada a quem fecha a semana: se o relatório
// da Uber disser 109 € e ele tiver comunicado 119 €, alguém olha antes de
// fechar.
//
// Se estes valores também creditassem, o mesmo dinheiro entraria por dois
// caminhos e a semana seria paga duas vezes — e nada no sistema o impediria,
// apenas a atenção de quem fecha.
//
// A aprovação existe para dar resposta ao motorista: aprovado significa
// "confere com o que vou fechar"; recusado, "não bate, e o motivo é este".

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/AppError';
import { UserRole, EarningStatus } from '../../shared/types/enums';
import { usersRepository } from '../users/users.repository';
import { CreateEarningData, UpdateEarningData } from './earnings.repository.types';
import { earningsRepository } from './earnings.repository';
import {
  CreateEarningInput,
  UpdateEarningInput,
  ReviewEarningInput,
  ListEarningsFilter,
} from './earnings.service.types';
import { IEarningPublic, ReportedByPlatform } from './earnings.types';

type Actor = {
  id: string;
  role?: UserRole;
};

function canManageEarnings(role?: UserRole) {
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

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

export class EarningsService {
  private async ensureEarningExists(id: string): Promise<IEarningPublic> {
    const earning = await earningsRepository.findById(id);
    if (!earning) {
      throw new AppError('Earning not found', 404, 'EARNING_NOT_FOUND');
    }
    return earning;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await usersRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
  }

  async list(actor: Actor, filter: ListEarningsFilter = {}): Promise<IEarningPublic[]> {
    // Motorista vê apenas os próprios; a gestão vê todos, ou filtra por pessoa.
    const userId = podeVer(actor.role) ? filter.userId : actor.id;
    return earningsRepository.findMany({ ...filter, userId });
  }

  async listByUser(actor: Actor, userId: string): Promise<IEarningPublic[]> {
    if (!podeVer(actor.role) && actor.id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    await this.ensureUserExists(userId);
    return earningsRepository.findByUserId(userId);
  }

  async getById(actor: Actor, id: string): Promise<IEarningPublic> {
    const earning = await this.ensureEarningExists(id);
    if (!podeVer(actor.role) && earning.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    return earning;
  }

  /**
   * Cria a comunicação.
   *
   * Nasce PENDING quando é o motorista a comunicar. Lançado pela própria
   * gestão, nasce APPROVED: quem tem autoridade para aprovar não precisa de
   * aprovar o que acabou de introduzir.
   */
  async create(actor: Actor, userId: string, input: CreateEarningInput): Promise<IEarningPublic> {
    const isManager = canManageEarnings(actor.role);

    if (!isManager && userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'CANNOT_CREATE_EARNING_FOR_ANOTHER_USER');
    }

    await this.ensureUserExists(userId);

    const data: CreateEarningData = {
      amount: input.amount,
      date: input.date ?? new Date(),
      platform: input.platform,
      userId,
      status: isManager ? EarningStatus.APPROVED : EarningStatus.PENDING,
      notes: input.notes?.trim() || null,
      ...(isManager ? { reviewedById: actor.id, reviewedAt: new Date() } : {}),
    };

    return earningsRepository.create(data);
  }

  /**
   * Edita a comunicação.
   *
   * O motorista só mexe enquanto está pendente: depois de avaliada, alterar o
   * valor mudaria aquilo sobre o qual alguém já decidiu. A gestão pode editar
   * em qualquer estado, e nesse caso o registo volta a pendente — o conteúdo
   * mudou, a decisão anterior deixou de se aplicar.
   */
  async update(actor: Actor, id: string, input: UpdateEarningInput): Promise<IEarningPublic> {
    const earning = await this.ensureEarningExists(id);
    const isManager = canManageEarnings(actor.role);

    if (!isManager && earning.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    if (!isManager && earning.status !== EarningStatus.PENDING) {
      throw new AppError(
        'Este lançamento já foi avaliado e não pode ser alterado.',
        400,
        'EARNING_NOT_EDITABLE',
      );
    }

    const changesContent =
      input.amount !== undefined || input.date !== undefined || input.platform !== undefined;

    const data: UpdateEarningData = {
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.date !== undefined ? { date: input.date } : {}),
      ...(input.platform !== undefined ? { platform: input.platform } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(isManager && changesContent && earning.status !== EarningStatus.PENDING
        ? { status: EarningStatus.PENDING, reviewedById: null, reviewedAt: null }
        : {}),
    };

    return earningsRepository.update(id, data);
  }

  /**
   * Aprova ou recusa. Só a gestão.
   *
   * Recusar exige motivo: o motorista vê este texto, e "não" sem explicação
   * gera a mesma dúvida que originou o lançamento.
   */
  async review(actor: Actor, id: string, input: ReviewEarningInput): Promise<IEarningPublic> {
    if (!canManageEarnings(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const earning = await this.ensureEarningExists(id);

    if (input.status !== EarningStatus.APPROVED && input.status !== EarningStatus.REJECTED) {
      throw new AppError('Estado inválido para revisão.', 400, 'INVALID_REVIEW_STATUS');
    }

    const notes = input.notes?.trim();

    if (input.status === EarningStatus.REJECTED && !notes) {
      throw new AppError('Indique o motivo da recusa.', 400, 'NOTES_REQUIRED');
    }

    const updated = await earningsRepository.update(id, {
      status: input.status,
      reviewedById: actor.id,
      reviewedAt: new Date(),
      ...(notes ? { notes } : {}),
    });

    try {
      const approved = input.status === EarningStatus.APPROVED;
      const when = earning.date.toISOString().slice(0, 10).split('-').reverse().join('/');
      await prisma.notification.create({
        data: {
          userId: earning.userId,
          title: approved ? 'Lançamento confirmado' : 'Lançamento recusado',
          message: approved
            ? `${eur(earning.amount)} de ${when} confirmados. Entram no fecho da semana.`
            : `${eur(earning.amount)} de ${when} recusados. Motivo: ${notes}`,
        },
      });
    } catch (notifErr) {
      logger.error('Erro ao notificar revisão de lançamento', notifErr);
    }

    return updated;
  }

  /**
   * O que o motorista comunicou num intervalo, por plataforma.
   * Alimenta a conferência cruzada no formulário do fecho semanal.
   */
  async reportedInRange(
    actor: Actor,
    userId: string,
    from: Date,
    to: Date,
  ): Promise<ReportedByPlatform[]> {
    if (!podeVer(actor.role) && actor.id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    return earningsRepository.sumByPlatformInRange(userId, from, to);
  }

  async remove(actor: Actor, id: string): Promise<void> {
    const earning = await this.ensureEarningExists(id);
    const isManager = canManageEarnings(actor.role);

    if (!isManager && earning.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    if (!isManager && earning.status !== EarningStatus.PENDING) {
      throw new AppError(
        'Este lançamento já foi avaliado e não pode ser apagado.',
        400,
        'EARNING_NOT_DELETABLE',
      );
    }

    return earningsRepository.delete(id);
  }
}

export const earningsService = new EarningsService();
