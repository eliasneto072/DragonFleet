// src/modules/withdrawals/withdrawals.service.ts
import { AppError }             from '../../shared/errors/AppError';
import { UserRole, WithdrawalStatus } from '../../shared/types/enums';
import { usersRepository }      from '../users/users.repository';
import { IWithdrawalPublic }    from './withdrawals.types';
import { withdrawalsRepository } from './withdrawals.repository';
import { CreateWithdrawalData, UpdateWithdrawalData } from './withdrawals.repository.types';
import { CreateWithdrawalInput, UpdateWithdrawalStatusInput } from './withdrawals.service.types';
import { emailService }         from '../../shared/services/email.service';
import { balanceService }       from '../balance/balance.service';
import { settingsService }      from '../settings/settings.service';
import { bankService }          from '../bank/bank.service';

type Actor = { id: string; role?: UserRole };

function canManageWithdrawals(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

const FINAL_STATUSES: WithdrawalStatus[] = [WithdrawalStatus.PAID, WithdrawalStatus.REJECTED];

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

export class WithdrawalsService {
  private async ensureWithdrawalExists(id: string): Promise<IWithdrawalPublic> {
    const withdrawal = await withdrawalsRepository.findById(id);
    if (!withdrawal) throw new AppError('Withdrawal not found', 404, 'WITHDRAWAL_NOT_FOUND');
    return withdrawal;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await usersRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  async list(actor: Actor): Promise<IWithdrawalPublic[]> {
    if (canManageWithdrawals(actor.role)) return withdrawalsRepository.findAll();
    return withdrawalsRepository.findByUserId(actor.id);
  }

  async listByUser(actor: Actor, userId: string): Promise<IWithdrawalPublic[]> {
    if (!canManageWithdrawals(actor.role) && actor.id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    await this.ensureUserExists(userId);
    return withdrawalsRepository.findByUserId(userId);
  }

  async getById(actor: Actor, id: string): Promise<IWithdrawalPublic> {
    const withdrawal = await this.ensureWithdrawalExists(id);
    if (!canManageWithdrawals(actor.role) && withdrawal.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    return withdrawal;
  }

  /**
   * Criação de retirada.
   *
   * A versão anterior verificava apenas a posse e criava o registo com o valor
   * recebido. O schema exigia somente amount > 0, e os limites de mínimo e
   * máximo existiam só no formulário do frontend — que qualquer pedido feito
   * fora do navegador contorna.
   *
   * Consequência: um motorista com 16 € disponíveis podia pedir 10.000 €. O
   * pedido entrava como PENDING, o valor pendente é subtraído no cálculo do
   * saldo, e o disponível ficava negativo de imediato. Aprovado sem conferência
   * manual, a empresa pagaria dinheiro que não deve.
   *
   * O disponível já desconta as retiradas pendentes, portanto dois pedidos
   * seguidos não conseguem gastar o mesmo saldo duas vezes.
   *
   * LIMITAÇÃO CONHECIDA: dois pedidos verdadeiramente simultâneos podem passar
   * ambos pela verificação antes de qualquer um ser gravado. Fechar essa janela
   * exige transação com bloqueio de linha, ou a regra de permitir só um pedido
   * pendente por motorista de cada vez.
   */
  async create(actor: Actor, userId: string, input: CreateWithdrawalInput): Promise<IWithdrawalPublic> {
    if (!canManageWithdrawals(actor.role) && userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'CANNOT_CREATE_WITHDRAWAL_FOR_ANOTHER_USER');
    }
    await this.ensureUserExists(userId);

    const amount = Number(input.amount);

    // Limites vindos de SystemSettings. O módulo settings expõe estes campos e
    // o painel de administração permite editá-los, mas nada os aplicava.
    const settings = await settingsService.get();
    const min = Number(settings.minWithdrawalAmount ?? 0);
    const max = Number(settings.maxWithdrawalAmount ?? 0);

    if (min > 0 && amount < min) {
      throw new AppError(
        `O valor mínimo para retirada é ${eur(min)}.`,
        400,
        'BELOW_MIN_WITHDRAWAL',
      );
    }
    if (max > 0 && amount > max) {
      throw new AppError(
        `O valor máximo por retirada é ${eur(max)}.`,
        400,
        'ABOVE_MAX_WITHDRAWAL',
      );
    }

    // getSummary repete a verificação de posse; como já validámos acima que
    // este actor pode criar para este userId, a chamada passa em ambos os casos.
    const balance = await balanceService.getSummary(actor, userId);

    if (amount > balance.available) {
      throw new AppError(
        `Saldo insuficiente. Disponível para retirada: ${eur(balance.available)}.`,
        400,
        'INSUFFICIENT_BALANCE',
      );
    }

    // Sem IBAN aprovado não há como pagar. Recusar aqui é melhor do que
    // aceitar o pedido e descobrir na hora da transferência que não há destino.
    const bank = await bankService.getActiveIban(userId);
    if (!bank) {
      throw new AppError(
        'Registe os seus dados bancários e aguarde a aprovação antes de pedir uma retirada.',
        400,
        'BANK_ACCOUNT_REQUIRED',
      );
    }

    const data: CreateWithdrawalData = {
      amount,
      userId,
      receiptUrl: input.receiptUrl,
      receiptKey: input.receiptKey,
    };
    return withdrawalsRepository.create(data);
  }

  async updateStatus(actor: Actor, id: string, input: UpdateWithdrawalStatusInput): Promise<IWithdrawalPublic> {
    if (!canManageWithdrawals(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const withdrawal = await this.ensureWithdrawalExists(id);

    if (FINAL_STATUSES.includes(withdrawal.status)) {
      throw new AppError(
        `Cannot change status of a ${withdrawal.status} withdrawal`,
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }

    if (input.status === WithdrawalStatus.REJECTED && !input.notes) {
      throw new AppError('Notes are required when rejecting a withdrawal', 400, 'NOTES_REQUIRED');
    }

    // Reconferência ao aprovar ou pagar. O saldo pode ter caído entre o pedido
    // e a decisão — por exemplo, um débito lançado pela gestão nesse intervalo.
    // O disponível já contempla esta retirada (pendente ou aprovada), logo um
    // valor negativo significa que a conta deixou de a cobrir.
    if (input.status === WithdrawalStatus.APPROVED || input.status === WithdrawalStatus.PAID) {
      const balance = await balanceService.getSummary(actor, withdrawal.userId);
      if (balance.available < 0) {
        throw new AppError(
          `O saldo do motorista já não cobre esta retirada. Em falta: ${eur(Math.abs(balance.available))}.`,
          400,
          'INSUFFICIENT_BALANCE',
        );
      }
    }

    const data: UpdateWithdrawalData = {
      status: input.status,
      notes:  input.notes ?? null,
    };

    // Congela o destino no momento da aprovação: se o motorista alterar os
    // dados bancários depois, uma transferência já decidida não muda de conta
    // sem ninguém reparar.
    if (input.status === WithdrawalStatus.APPROVED && !withdrawal.paidToIban) {
      const bank = await bankService.getActiveIban(withdrawal.userId);
      if (!bank) {
        throw new AppError(
          'Este motorista não tem dados bancários aprovados. Não há destino para a transferência.',
          400,
          'BANK_ACCOUNT_REQUIRED',
        );
      }
      data.paidToIban = bank.iban;
      data.paidToHolder = bank.holderName;
    }

    const updated = await withdrawalsRepository.update(id, data);

    // ── Disparar email ao driver ──────────────────────────────────────────
    try {
      const user   = await usersRepository.findById(withdrawal.userId);
      const amount = Number(withdrawal.amount);

      if (user?.email) {
        if (input.status === WithdrawalStatus.APPROVED || input.status === WithdrawalStatus.PAID) {
          await emailService.sendWithdrawalApproved(user.email, user.name, amount);
        } else if (input.status === WithdrawalStatus.REJECTED) {
          await emailService.sendWithdrawalRejected(user.email, user.name, amount, input.notes);
        }
      }
    } catch (emailErr) {
      console.error('[email] Failed to send withdrawal status email:', emailErr);
    }

    return updated;
  }

  async remove(actor: Actor, id: string): Promise<void> {
    if (!canManageWithdrawals(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    await this.ensureWithdrawalExists(id);
    return withdrawalsRepository.delete(id);
  }
}

export const withdrawalsService = new WithdrawalsService();
