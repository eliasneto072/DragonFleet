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
//
// ─── ATÉ TRÊS CONTAS ────────────────────────────────────────────────────────
//
// Cada motorista pode ter até três (`MAX_BANK_ACCOUNTS`), uma delas principal.
// Cada uma passa pela sua aprovação: três contas são três comprovativos e três
// decisões. A confiança é por CONTA e não por pessoa — aprovar o IBAN de
// alguém não pode abrir a porta a que ele acrescente mais dois sem ninguém ver.
//
// O teto existe para a administração continuar a saber para onde paga. Sem
// ele, nada impedia uma conta com quinze IBANs, e a escolha na hora do
// pagamento deixava de ser uma escolha.
//
// ─── ARQUIVAR, NÃO APAGAR ───────────────────────────────────────────────────
//
// Uma conta que já recebeu dinheiro faz parte do histórico. Apagá-la deixava
// retiradas antigas a apontar para o nada; por isso "remover" é marcar
// `archivedAt` e deixar de a mostrar.

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
import {
  MAX_BANK_ACCOUNTS,
  type Actor, type BankAccountPublic, type ChosenAccount,
  type ReviewBankInput, type SubmitBankInput,
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

type RawAccount = {
  id: string;
  userId: string;
  label: string | null;
  isPrimary: boolean;
  iban: string | null;
  holderName: string | null;
  pendingIban: string | null;
  pendingHolderName: string | null;
  pendingAt: Date | null;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  updatedAt: Date;
};

function toPublic(row: RawAccount, mascarar = false): BankAccountPublic {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    isPrimary: row.isPrimary,
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
  id: true,
  userId: true,
  label: true,
  isPrimary: true,
  iban: true,
  holderName: true,
  pendingIban: true,
  pendingHolderName: true,
  pendingAt: true,
  rejectionReason: true,
  reviewedAt: true,
  updatedAt: true,
} as const;

/** Ativas primeiro a principal, depois as mais antigas. Ordem estável. */
const ordem = [
  { isPrimary: 'desc' as const },
  { createdAt: 'asc' as const },
];

export class BankService {
  private ensureSelfOrManager(actor: Actor, userId: string) {
    if (!podeVer(actor.role) && actor.id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
  }

  /** Todas as contas ativas de um motorista. */
  async list(actor: Actor, userId: string): Promise<BankAccountPublic[]> {
    this.ensureSelfOrManager(actor, userId);

    const rows = await prisma.bankAccount.findMany({
      where: { userId, archivedAt: null },
      select: publicSelect,
      orderBy: ordem,
    });

    // Mascarado para o SUPPORT, inteiro para quem gere e para o próprio dono.
    const mascarar = actor.role === UserRole.SUPPORT;
    return rows.map((r) => toPublic(r, mascarar));
  }

  /**
   * Fila de IBAN por aprovar, com pesquisa e paginação.
   *
   * Devolvia todos. Com uma frota grande são centenas à espera, e encontrar
   * um motorista específico obrigava a percorrer a lista com os olhos — numa
   * tela onde a decisão é comparar um comprovativo com um IBAN, ou seja, onde
   * se chega já a saber de quem se anda à procura.
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
      archivedAt: null,
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
        ...toPublic(r),
        proofUrl: r.pendingProofUrl,
        user: r.user,
      })),
      page: buildPageInfo(pagina, total),
    };
  }

  /**
   * Submete dados bancários. Ficam pendentes; o IBAN em vigor não muda.
   *
   * Sem `accountId` cria uma conta nova (até ao teto). Com `accountId`
   * substitui o IBAN de uma que já existe — é a diferença entre "mudei de
   * banco" e "tenho mais um banco", e sem ela corrigir um número gastava uma
   * das três posições.
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

    const existentes = await prisma.bankAccount.findMany({
      where: { userId, archivedAt: null },
      orderBy: ordem,
    });

    const alvo = input.accountId
      ? existentes.find((c) => c.id === input.accountId)
      : undefined;

    if (input.accountId && !alvo) {
      throw new AppError('Conta bancária não encontrada.', 404, 'BANK_ACCOUNT_NOT_FOUND');
    }

    // Submeter o IBAN que já está em vigor NESTA conta não é alteração
    // nenhuma; deixar passar criaria uma pendência que o administrador teria
    // de decidir sem nada para decidir.
    if (alvo?.iban && normalizeIban(alvo.iban) === iban) {
      throw new AppError('Este já é o IBAN em vigor nesta conta.', 400, 'IBAN_UNCHANGED');
    }

    // O mesmo IBAN noutra das contas dele. Recusado com uma mensagem que diz
    // qual, senão o motorista fica a olhar para um erro sem saber o que fez.
    const repetido = existentes.find(
      (c) => c.id !== alvo?.id && c.iban && normalizeIban(c.iban) === iban,
    );
    if (repetido) {
      throw new AppError(
        `Este IBAN já está registado${repetido.label ? ` em "${repetido.label}"` : ''}.`,
        400,
        'IBAN_DUPLICATED',
      );
    }

    if (!alvo && existentes.length >= MAX_BANK_ACCOUNTS) {
      throw new AppError(
        `Só pode ter ${MAX_BANK_ACCOUNTS} contas bancárias. Remova uma antes de acrescentar outra.`,
        409,
        'TOO_MANY_BANK_ACCOUNTS',
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

    const label = input.label?.trim() || null;

    const row = alvo
      ? await prisma.bankAccount.update({
          where: { id: alvo.id },
          data: { ...data, ...(label ? { label } : {}) },
          select: publicSelect,
        })
      : await prisma.bankAccount.create({
          data: {
            userId,
            ...data,
            label: label ?? `Conta ${existentes.length + 1}`,
            // A primeira conta de alguém é a principal. As seguintes não —
            // mudar o destino por omissão é uma decisão, não um efeito
            // secundário de acrescentar uma conta.
            isPrimary: existentes.length === 0,
          },
          select: publicSelect,
        });

    logger.info(`[bank] ${userId} submeteu dados bancários para aprovação (conta ${row.id})`);

    return toPublic(row);
  }

  /**
   * Aprova ou recusa a alteração pendente de UMA conta.
   *
   * Aprovar promove os dados pendentes a vigentes. Recusar limpa a pendência e
   * guarda o motivo — o IBAN anterior, se existia, fica intacto nos dois casos.
   */
  async review(actor: Actor, accountId: string, input: ReviewBankInput): Promise<BankAccountPublic> {
    if (!canManage(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const existing = await prisma.bankAccount.findUnique({ where: { id: accountId } });
    if (!existing) {
      throw new AppError('Conta bancária não encontrada.', 404, 'BANK_ACCOUNT_NOT_FOUND');
    }
    if (!existing.pendingIban) {
      throw new AppError('Não há alteração pendente nesta conta.', 404, 'NO_PENDING_CHANGE');
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
      where: { id: accountId },
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

    const nome = row.label ? ` (${row.label})` : '';
    try {
      await prisma.notification.create({
        data: {
          userId: existing.userId,
          title: input.approve ? 'Dados bancários aprovados' : 'Dados bancários recusados',
          message: input.approve
            ? `A conta${nome} foi validada. Já pode receber retiradas nela.`
            : `A alteração da conta${nome} foi recusada. Motivo: ${reason}`,
        },
      });
    } catch (notifErr) {
      logger.error('Erro ao notificar revisão de dados bancários', notifErr);
    }

    return toPublic(row);
  }

  /**
   * Escolhe qual das contas é a principal.
   *
   * Em transação e a limpar a anterior primeiro: o índice parcial na base
   * recusa duas principais ao mesmo tempo, e sem a ordem certa a própria
   * operação batia contra ele.
   */
  async setPrimary(actor: Actor, accountId: string): Promise<BankAccountPublic[]> {
    const conta = await prisma.bankAccount.findUnique({ where: { id: accountId } });
    if (!conta || conta.archivedAt) {
      throw new AppError('Conta bancária não encontrada.', 404, 'BANK_ACCOUNT_NOT_FOUND');
    }
    this.ensureSelfOrManager(actor, conta.userId);

    if (!conta.iban) {
      throw new AppError(
        'Só uma conta já aprovada pode ser a principal.',
        409,
        'ACCOUNT_NOT_APPROVED',
      );
    }

    await prisma.$transaction([
      prisma.bankAccount.updateMany({
        where: { userId: conta.userId, isPrimary: true },
        data: { isPrimary: false },
      }),
      prisma.bankAccount.update({ where: { id: accountId }, data: { isPrimary: true } }),
    ]);

    return this.list(actor, conta.userId);
  }

  /** Muda só o nome da conta. Não passa por aprovação: não mexe em dinheiro. */
  async rename(actor: Actor, accountId: string, label: string): Promise<BankAccountPublic> {
    const conta = await prisma.bankAccount.findUnique({ where: { id: accountId } });
    if (!conta || conta.archivedAt) {
      throw new AppError('Conta bancária não encontrada.', 404, 'BANK_ACCOUNT_NOT_FOUND');
    }
    this.ensureSelfOrManager(actor, conta.userId);

    const nome = label.trim();
    if (nome.length < 2) {
      throw new AppError('Dê um nome à conta.', 400, 'INVALID_LABEL');
    }

    const row = await prisma.bankAccount.update({
      where: { id: accountId },
      data: { label: nome },
      select: publicSelect,
    });
    return toPublic(row);
  }

  /**
   * Arquiva uma conta.
   *
   * Recusa em dois casos: se for a única, e se houver uma retirada por decidir
   * apontada para ela. O segundo é o que evita um pedido pendente ficar sem
   * destino a meio do caminho.
   */
  async archive(actor: Actor, accountId: string): Promise<BankAccountPublic[]> {
    const conta = await prisma.bankAccount.findUnique({ where: { id: accountId } });
    if (!conta || conta.archivedAt) {
      throw new AppError('Conta bancária não encontrada.', 404, 'BANK_ACCOUNT_NOT_FOUND');
    }
    this.ensureSelfOrManager(actor, conta.userId);

    const [ativas, pendentes] = await Promise.all([
      prisma.bankAccount.count({ where: { userId: conta.userId, archivedAt: null } }),
      prisma.withdrawal.count({ where: { bankAccountId: accountId, status: 'PENDING' } }),
    ]);

    if (ativas <= 1) {
      throw new AppError(
        'Esta é a sua única conta bancária. Registe outra antes de remover esta.',
        409,
        'LAST_BANK_ACCOUNT',
      );
    }
    if (pendentes > 0) {
      throw new AppError(
        'Há uma retirada à espera de decisão para esta conta. Aguarde que seja processada.',
        409,
        'WITHDRAWAL_PENDING',
      );
    }

    await prisma.bankAccount.update({
      where: { id: accountId },
      // Deixa de ser principal ao ser arquivada, senão o índice parcial
      // continuava a contá-la e ninguém conseguia promover outra.
      data: { archivedAt: new Date(), isPrimary: false },
    });

    // Sem principal, a mais antiga aprovada assume. Ficar sem nenhuma deixava
    // o pedido de retirada sem nada pré-escolhido, por uma razão que o
    // motorista não teria como adivinhar.
    const restantes = await prisma.bankAccount.findMany({
      where: { userId: conta.userId, archivedAt: null },
      orderBy: ordem,
    });
    if (restantes.length > 0 && !restantes.some((c) => c.isPrimary)) {
      const candidata = restantes.find((c) => c.iban) ?? restantes[0];
      await prisma.bankAccount.update({
        where: { id: candidata.id },
        data: { isPrimary: true },
      });
    }

    return this.list(actor, conta.userId);
  }

  /**
   * A conta para onde uma retirada vai, resolvida e validada.
   *
   * Com `accountId`, confirma que é mesmo dele, que está ativa e aprovada —
   * um identificador vindo do browser não é prova de nada. Sem `accountId`,
   * usa a principal, e se não houver principal aprovada usa a primeira
   * aprovada que encontrar.
   *
   * Devolve null quando não há nenhuma utilizável: quem chama decide se isso
   * impede a operação.
   */
  async resolveAccount(userId: string, accountId?: string | null): Promise<ChosenAccount | null> {
    const contas = await prisma.bankAccount.findMany({
      where: { userId, archivedAt: null, iban: { not: null } },
      orderBy: ordem,
    });
    if (contas.length === 0) return null;

    const escolhida = accountId
      ? contas.find((c) => c.id === accountId)
      : (contas.find((c) => c.isPrimary) ?? contas[0]);

    if (!escolhida?.iban) return null;

    return {
      id: escolhida.id,
      iban: escolhida.iban,
      holderName: escolhida.holderName ?? '',
      label: escolhida.label,
    };
  }
}

export const bankService = new BankService();
