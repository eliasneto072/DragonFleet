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
// Extraidas para shared/utils/iban.ts: sao funcoes puras, e viviam dentro
// deste modulo que importa o Prisma — o que as tornava impossiveis de testar
// sem levantar uma base de dados para verificar aritmetica de strings.
import { isValidIban, normalizeIban } from '../../shared/utils/iban';
import {
  buildPageInfo, buildSearchWhere, parsePage, parseSearchTerms,
} from '../../shared/http/pagination';
import type {
  Actor, BankAccountPublic, ReviewBankInput, SubmitBankInput,
} from './bank.types';

function canManage(role?: UserRole) {
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

/**
 * Esconde o IBAN, deixando só os últimos quatro dígitos.
 *
 * Para o SUPPORT. Ele precisa de confirmar para onde o dinheiro foi quando
 * alguém pergunta "não recebi" — e para isso os últimos quatro chegam. O IBAN
 * inteiro não: cada pessoa que o consegue copiar é mais uma superfície, e um
 * papel que existe para responder a perguntas não precisa de o poder copiar.
 *
 * Fica com a mesma forma de um IBAN para a interface não ter de saber disto.
 */
function mascaraIban(iban: string | null): string | null {
  if (!iban) return null;
  const limpo = iban.replace(/\s/g, '');
  if (limpo.length <= 4) return limpo;
  return `${limpo.slice(0, 2)}•• •••• •••• •••• ${limpo.slice(-4)}`;
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
} | null, userId: string, mascarar = false): BankAccountPublic {
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
    iban: mascarar ? mascaraIban(row.iban) : row.iban,
    holderName: row.holderName,
    pendingIban: mascarar ? mascaraIban(row.pendingIban) : row.pendingIban,
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
    if (!podeVer(actor.role) && actor.id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
  }

  async get(actor: Actor, userId: string): Promise<BankAccountPublic> {
    this.ensureSelfOrManager(actor, userId);

    const row = await prisma.bankAccount.findUnique({
      where: { userId },
      select: publicSelect,
    });

    // Mascarado para o SUPPORT, inteiro para quem gere e para o próprio dono.
    return toPublic(row, userId, actor.role === UserRole.SUPPORT);
  }

  /** Contas com alteração à espera de decisão. Alimenta a fila do painel. */
  /**
   * Fila de IBAN por aprovar, com pesquisa e paginação.
   *
   * Devolvia todos. Com uma frota grande são centenas à espera, e encontrar
   * um motorista específico obrigava a percorrer a lista com os olhos — numa
   * tela onde a decisão é comparar um comprovativo com um IBAN, ou seja, onde
   * se chega já a saber de quem se anda à procura.
   *
   * `page` continua opcional: sem ela, devolve a primeira com o tamanho por
   * omissão, e o teto de MAX_PAGE_SIZE aplica-se de qualquer maneira.
   */
  async listPending(actor: Actor, filter: {
    search?: unknown; page?: unknown; pageSize?: unknown;
  } = {}) {
    if (!podeVer(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const pagina = parsePage({ page: filter.page, pageSize: filter.pageSize });
    const termos = parseSearchTerms(filter.search);

    // Atravessa a relação: a conta bancária não tem nome, o utilizador tem.
    const where = {
      pendingIban: { not: null },
      ...(termos.length > 0 ? { user: buildSearchWhere(termos, ['name', 'email']) } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.bankAccount.findMany({
        where,
        select: {
          ...publicSelect,
          pendingProofUrl: true,
          user: { select: { id: true, name: true, email: true } },
        },
        // Quem espera há mais tempo primeiro: é uma fila, e a ordem de chegada
        // é a única justa quando o que está em causa é destrancar o acesso de
        // alguém ao próprio dinheiro.
        orderBy: { pendingAt: 'asc' },
        skip: pagina.skip,
        take: pagina.pageSize,
      }),
      prisma.bankAccount.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        ...toPublic(r, r.userId),
        proofUrl: r.pendingProofUrl,
        user: r.user,
      })),
      page: buildPageInfo(pagina, total),
    };
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
