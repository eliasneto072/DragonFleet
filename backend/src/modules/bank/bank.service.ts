// src/modules/bank/bank.service.ts
//
// Dados bancários do motorista, com alteração sujeita a aprovação.
//
// POR QUE A APROVAÇÃO: trocar o IBAN é o vetor clássico de fraude — quem ganhe
// acesso à conta muda o número e desvia o pagamento seguinte, sem tocar em mais
// nada. Exigir que a administração valide o comprovativo antes de o novo IBAN
// passar a valer fecha essa porta.
//
// Enquanto a alteração espera decisão, o IBAN anterior continua em vigor. Se a
// submissão substituísse logo o valor bom, um engano de digitação deixaria o
// motorista sem destino de pagamento até alguém corrigir.

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import type {
  Actor, BankAccountPublic, ReviewBankInput, SubmitBankInput,
} from './bank.types';

function canManage(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

/**
 * Normaliza para comparação e armazenamento: sem espaços, em maiúsculas.
 * Os bancos imprimem o IBAN em grupos de quatro, e quem copia traz os espaços.
 */
function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Validação de IBAN pelo resto 97, o mesmo algoritmo que os bancos usam.
 *
 * Apanha dígitos trocados, que é o erro real — um IBAN com um número a mais ou
 * a menos passaria numa validação de comprimento e enviaria o dinheiro para
 * lado nenhum, ou pior, para outra pessoa.
 */
function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return false;

  // Move os quatro primeiros caracteres para o fim e converte letras em números
  // (A=10 … Z=35), como manda a norma.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  // O número é longo demais para caber num inteiro: resto calculado por partes.
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function toPublic(row: {
  userId: string;
  iban: string | null;
  holderName: string | null;
  pendingIban: string | null;
  pendingHolderName: string | null;
  pendingAt: Date | null;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  updatedAt: Date;
} | null, userId: string): BankAccountPublic {
  if (!row) {
    return {
      userId,
      iban: null, holderName: null,
      pendingIban: null, pendingHolderName: null, pendingAt: null,
      rejectionReason: null, reviewedAt: null, updatedAt: null,
      hasPending: false, isUsable: false,
    };
  }

  return {
    userId: row.userId,
    iban: row.iban,
    holderName: row.holderName,
    pendingIban: row.pendingIban,
    pendingHolderName: row.pendingHolderName,
    pendingAt: row.pendingAt,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt,
    updatedAt: row.updatedAt,
    hasPending: !!row.pendingIban,
    isUsable: !!row.iban,
  };
}

const publicSelect = {
  userId: true,
  iban: true,
  holderName: true,
  pendingIban: true,
  pendingHolderName: true,
  pendingAt: true,
  rejectionReason: true,
  reviewedAt: true,
  updatedAt: true,
} as const;

export class BankService {
  private ensureSelfOrManager(actor: Actor, userId: string) {
    if (!canManage(actor.role) && actor.id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
  }

  async get(actor: Actor, userId: string): Promise<BankAccountPublic> {
    this.ensureSelfOrManager(actor, userId);

    const row = await prisma.bankAccount.findUnique({
      where: { userId },
      select: publicSelect,
    });

    return toPublic(row, userId);
  }

  /** Contas com alteração à espera de decisão. Alimenta a fila do painel. */
  async listPending(actor: Actor) {
    if (!canManage(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const rows = await prisma.bankAccount.findMany({
      where: { pendingIban: { not: null } },
      select: {
        ...publicSelect,
        pendingProofUrl: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { pendingAt: 'asc' },
    });

    return rows.map((r) => ({
      ...toPublic(r, r.userId),
      proofUrl: r.pendingProofUrl,
      user: r.user,
    }));
  }

  /**
   * Submete dados bancários. Ficam pendentes; o IBAN em vigor não muda.
   *
   * O comprovativo é exigido em cada submissão, e não apenas na primeira: a
   * prova tem de corresponder ao IBAN que está a ser submetido, e reaproveitar
   * a anterior validaria uma conta diferente da que se está a registar.
   */
  async submit(actor: Actor, userId: string, input: SubmitBankInput): Promise<BankAccountPublic> {
    this.ensureSelfOrManager(actor, userId);

    const iban = normalizeIban(input.iban);
    if (!isValidIban(iban)) {
      throw new AppError(
        'IBAN inválido. Confirme o número — um dígito trocado envia o dinheiro para outro sítio.',
        400,
        'INVALID_IBAN',
      );
    }

    const holderName = input.holderName.trim();
    if (holderName.length < 3) {
      throw new AppError('Indique o nome do titular da conta.', 400, 'INVALID_HOLDER');
    }

    const existing = await prisma.bankAccount.findUnique({ where: { userId } });

    // Submeter o IBAN que já está em vigor não é alteração nenhuma; deixar
    // passar criaria uma pendência que o administrador teria de decidir sem
    // nada para decidir.
    if (existing?.iban && normalizeIban(existing.iban) === iban) {
      throw new AppError(
        'Este já é o IBAN em vigor na sua conta.',
        400,
        'IBAN_UNCHANGED',
      );
    }

    const data = {
      pendingIban: iban,
      pendingHolderName: holderName,
      pendingProofUrl: input.proofUrl,
      pendingProofKey: input.proofKey,
      pendingAt: new Date(),
      // Uma submissão nova apaga a recusa anterior: o motivo referia-se aos
      // dados antigos e mantê-lo confundiria quem lê.
      rejectionReason: null,
      reviewedById: null,
      reviewedAt: null,
    };

    const row = await prisma.bankAccount.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      select: publicSelect,
    });

    logger.info(`[bank] ${userId} submeteu dados bancários para aprovação`);

    return toPublic(row, userId);
  }

  /**
   * Aprova ou recusa a alteração pendente.
   *
   * Aprovar promove os dados pendentes a vigentes. Recusar limpa a pendência e
   * guarda o motivo — o IBAN anterior, se existia, fica intacto nos dois casos.
   */
  async review(
    actor: Actor,
    userId: string,
    input: ReviewBankInput,
  ): Promise<BankAccountPublic> {
    if (!canManage(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const existing = await prisma.bankAccount.findUnique({ where: { userId } });
    if (!existing?.pendingIban) {
      throw new AppError('Não há alteração pendente para este motorista.', 404, 'NO_PENDING_CHANGE');
    }

    const reason = input.reason?.trim();
    if (!input.approve && !reason) {
      throw new AppError('Indique o motivo da recusa.', 400, 'NOTES_REQUIRED');
    }

    const cleared = {
      pendingIban: null,
      pendingHolderName: null,
      pendingProofUrl: null,
      pendingProofKey: null,
      pendingAt: null,
      reviewedById: actor.id,
      reviewedAt: new Date(),
    };

    const row = await prisma.bankAccount.update({
      where: { userId },
      data: input.approve
        ? {
            iban: existing.pendingIban,
            holderName: existing.pendingHolderName,
            rejectionReason: null,
            ...cleared,
          }
        : { rejectionReason: reason, ...cleared },
      select: publicSelect,
    });

    try {
      await prisma.notification.create({
        data: {
          userId,
          title: input.approve ? 'Dados bancários aprovados' : 'Dados bancários recusados',
          message: input.approve
            ? 'Os seus dados bancários foram validados. Já pode pedir retiradas.'
            : `A alteração dos dados bancários foi recusada. Motivo: ${reason}`,
        },
      });
    } catch (notifErr) {
      logger.error('Erro ao notificar revisão de dados bancários', notifErr);
    }

    return toPublic(row, userId);
  }

  /**
   * IBAN em vigor, para congelar numa retirada ao aprová-la.
   *
   * Devolve null quando não há: quem chama decide se isso impede a operação.
   */
  async getActiveIban(userId: string): Promise<{ iban: string; holderName: string } | null> {
    const row = await prisma.bankAccount.findUnique({
      where: { userId },
      select: { iban: true, holderName: true },
    });
    if (!row?.iban) return null;
    return { iban: row.iban, holderName: row.holderName ?? '' };
  }
}

export const bankService = new BankService();
