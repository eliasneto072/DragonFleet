// src/modules/settlements/settlements.service.ts
//
// Fecho semanal de faturação.
//
// Substitui o lançamento de ganhos pelo próprio motorista: o administrador
// regista, por semana, o que entrou em cada plataforma e o que saiu em
// despesas, e o líquido é creditado.
//
// É também o mecanismo pelo qual a empresa passa a ser paga. Antes disto, a
// percentagem existia apenas como número nas telas de análise — o saldo do
// motorista era 100% do que ele lançava, e a comissão nunca era cobrada.

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/AppError';
import { UserRole, SettlementStatus } from '../../shared/types/enums';
import { settingsService } from '../settings/settings.service';
import { settlementsRepository } from './settlements.repository';
import { computeTotals } from './settlements.types';
import type {
  Actor,
  SettlementAmounts,
  SettlementInput,
  SettlementUpdateInput,
  SettlementPublic,
} from './settlements.types';
import { parsePage, parseSearchTerms } from '../../shared/http/pagination';

/** Limite superior para o intervalo de um fecho, como guarda contra enganos. */
const MAX_WEEK_DAYS = 31;

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

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

/** "2026-07-06" → Date à meia-noite UTC, sem deslocamento de fuso. */
function parseDay(value: string, field: string): Date {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) {
    throw new AppError(`Data inválida em ${field}`, 400, 'INVALID_DATE');
  }
  return new Date(Date.UTC(y, m - 1, d));
}

export class SettlementsService {
  private ensureManager(actor: Actor) {
    if (!canManage(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  private async ensureDriver(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (!user) throw new AppError('Motorista não encontrado', 404, 'USER_NOT_FOUND');
    return user;
  }

  private async resolveRate(input: { commissionRate?: number }): Promise<number> {
    if (input.commissionRate !== undefined && input.commissionRate !== null) {
      const rate = Number(input.commissionRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        throw new AppError('Percentagem deve estar entre 0 e 100', 400, 'INVALID_RATE');
      }
      return rate;
    }
    const settings = await settingsService.get();
    return Number(settings.companyCommission ?? 0);
  }

  /**
   * Taxa do imposto, em pontos percentuais.
   *
   * Mesmo padrão do resolveRate: o que vier no pedido manda, senão vale o das
   * configurações. Assim a pré-visualização pode simular outra taxa sem que
   * ninguém tenha de alterar as configurações para experimentar.
   */
  private async resolveTaxRate(input: { taxRate?: number }): Promise<number> {
    if (input.taxRate !== undefined && input.taxRate !== null) {
      const rate = Number(input.taxRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        throw new AppError('Imposto deve estar entre 0 e 100', 400, 'INVALID_TAX_RATE');
      }
      return rate;
    }
    const settings = await settingsService.get();
    return Number(settings.settlementTaxRate ?? 0);
  }

  /** Valida o intervalo e garante que não se sobrepõe a outro fecho. */
  private async validateWeek(
    userId: string,
    weekStart: Date,
    weekEnd: Date,
    excludeId?: string,
  ) {
    if (weekStart > weekEnd) {
      throw new AppError('Data de início posterior à de fim', 400, 'INVALID_RANGE');
    }

    const days = (weekEnd.getTime() - weekStart.getTime()) / 86_400_000 + 1;
    if (days > MAX_WEEK_DAYS) {
      throw new AppError(
        `Intervalo de ${Math.round(days)} dias é demasiado longo para um fecho semanal.`,
        400,
        'RANGE_TOO_LONG',
      );
    }

    const overlap = await settlementsRepository.findOverlapping(
      userId, weekStart, weekEnd, excludeId,
    );
    if (overlap) {
      const from = overlap.weekStart.toISOString().slice(0, 10);
      const to = overlap.weekEnd.toISOString().slice(0, 10);
      throw new AppError(
        `Já existe um fecho deste motorista de ${from} a ${to}. Intervalos sobrepostos creditariam os mesmos dias duas vezes.`,
        409,
        'OVERLAPPING_SETTLEMENT',
      );
    }
  }

  private buildData(input: SettlementAmounts, rate: number, taxRate: number) {
    const totals = computeTotals({ ...input, commissionRate: rate, taxRate });
    return {
      uberAmount: input.uberAmount ?? 0,
      boltAmount: input.boltAmount ?? 0,
      otherRevenue: input.otherRevenue ?? 0,
      tollsAmount: input.tollsAmount ?? 0,
      fuelAmount: input.fuelAmount ?? 0,
      vehicleFee: input.vehicleFee ?? 0,
      otherDeductions: input.otherDeductions ?? 0,
      commissionRate: rate,
      taxRate,
      taxBase: totals.taxBase,
      taxAmount: totals.taxAmount,
      grossRevenue: totals.grossRevenue,
      totalDeductions: totals.totalDeductions,
      profitBase: totals.profitBase,
      commissionAmount: totals.commissionAmount,
      netToDriver: totals.netToDriver,
      notes: input.notes?.trim() || null,
      internalNotes: input.internalNotes?.trim() || null,
    };
  }

  // ── Leitura ────────────────────────────────────────────────────────────────

  async list(
    actor: Actor,
    filter: {
      userId?: string; status?: SettlementStatus; from?: string; to?: string;
      search?: unknown; page?: unknown; pageSize?: unknown;
    } = {},
  ) {
    // Motorista vê apenas os próprios; a gestão vê todos, ou filtra por pessoa.
    const isManager = podeVer(actor.role);
    const userId = isManager ? filter.userId : actor.id;

    // O parsePage aplica o teto. Nenhum valor vindo do URL consegue pedir mais
    // do que MAX_PAGE_SIZE, por muito que insista.
    const page = parsePage({ page: filter.page, pageSize: filter.pageSize });

    return settlementsRepository.findManyPaged({
      userId,
      // Um motorista não procura por nome: só vê os próprios fechos, e
      // procurar dentro deles pelo próprio nome não faz sentido.
      terms: isManager ? parseSearchTerms(filter.search) : [],
      status: filter.status,
      from: filter.from ? parseDay(filter.from, 'from') : undefined,
      to: filter.to ? parseDay(filter.to, 'to') : undefined,
    }, page, isManager);
  }

  async getById(actor: Actor, id: string): Promise<SettlementPublic> {
    const isManager = podeVer(actor.role);
    const found = await settlementsRepository.findById(id, isManager);
    if (!found) throw new AppError('Fecho não encontrado', 404, 'SETTLEMENT_NOT_FOUND');
    if (!isManager && found.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    return found;
  }

  // ── Escrita ────────────────────────────────────────────────────────────────

  /** Cria como rascunho. Nada é creditado até ao registo. */
  async create(actor: Actor, input: SettlementInput): Promise<SettlementPublic> {
    this.ensureManager(actor);
    await this.ensureDriver(input.userId);

    const weekStart = parseDay(input.weekStart, 'weekStart');
    const weekEnd = parseDay(input.weekEnd, 'weekEnd');
    await this.validateWeek(input.userId, weekStart, weekEnd);

    const rate = await this.resolveRate(input);
    const taxRate = await this.resolveTaxRate(input);

    return settlementsRepository.create({
      userId: input.userId,
      vehicleId: input.vehicleId ?? null,
      weekStart,
      weekEnd,
      status: SettlementStatus.DRAFT,
      createdById: actor.id,
      ...this.buildData(input, rate, taxRate),
    });
  }

  /**
   * Atualiza um rascunho. Fechos registados são imutáveis: alterá-los mudaria
   * um valor já creditado sem deixar rasto. Para corrigir, cancela-se e cria-se
   * outro.
   */
  async update(
    actor: Actor,
    id: string,
    input: SettlementUpdateInput,
  ): Promise<SettlementPublic> {
    this.ensureManager(actor);

    const existing = await settlementsRepository.findById(id);
    if (!existing) throw new AppError('Fecho não encontrado', 404, 'SETTLEMENT_NOT_FOUND');

    if (existing.status !== SettlementStatus.DRAFT) {
      throw new AppError(
        'Só rascunhos podem ser editados. Cancele o fecho e crie outro.',
        400,
        'SETTLEMENT_NOT_EDITABLE',
      );
    }

    const weekStart = parseDay(input.weekStart, 'weekStart');
    const weekEnd = parseDay(input.weekEnd, 'weekEnd');
    // O motorista vem do registo existente: a edição não o troca.
    await this.validateWeek(existing.userId, weekStart, weekEnd, id);

    const rate = await this.resolveRate(input);
    const taxRate = await this.resolveTaxRate(input);

    return settlementsRepository.update(id, {
      vehicleId: input.vehicleId ?? null,
      weekStart,
      weekEnd,
      ...this.buildData(input, rate, taxRate),
    });
  }

  /**
   * Regista o fecho e credita o motorista.
   *
   * O crédito não cria nenhum registo à parte: o saldo soma diretamente os
   * fechos com estado REGISTERED. Criar um ajuste de saldo espelho geraria dois
   * registos para o mesmo facto, e bastaria corrigir um deles para as contas
   * divergirem em silêncio.
   */
  async register(actor: Actor, id: string): Promise<SettlementPublic> {
    this.ensureManager(actor);

    const existing = await settlementsRepository.findById(id);
    if (!existing) throw new AppError('Fecho não encontrado', 404, 'SETTLEMENT_NOT_FOUND');

    if (existing.status === SettlementStatus.REGISTERED) {
      throw new AppError('Este fecho já foi registado.', 400, 'ALREADY_REGISTERED');
    }
    if (existing.status === SettlementStatus.CANCELLED) {
      throw new AppError('Fecho cancelado não pode ser registado.', 400, 'SETTLEMENT_CANCELLED');
    }

    // Reconferência da sobreposição: entre criar o rascunho e registá-lo,
    // outro fecho pode ter sido criado para a mesma semana.
    await this.validateWeek(existing.userId, existing.weekStart, existing.weekEnd, id);

    const updated = await settlementsRepository.update(id, {
      status: SettlementStatus.REGISTERED,
      registeredAt: new Date(),
    });

    try {
      const from = existing.weekStart.toISOString().slice(0, 10).split('-').reverse().join('/');
      const to = existing.weekEnd.toISOString().slice(0, 10).split('-').reverse().join('/');
      await prisma.notification.create({
        data: {
          userId: existing.userId,
          title: 'Fecho semanal disponível',
          message: `Semana de ${from} a ${to}: ${eur(existing.netToDriver)} creditados na sua conta.`,
        },
      });
    } catch (notifErr) {
      logger.error('Erro ao notificar fecho semanal', notifErr);
    }

    logger.info(
      `[settlement] ${actor.id} registou fecho ${id} de ${existing.userName}: ${eur(existing.netToDriver)}`,
    );

    return updated;
  }

  /**
   * Cancela um fecho registado, revertendo o crédito.
   *
   * Pode deixar o saldo negativo, e isso é aceite: se o fecho estava errado, o
   * valor não era devido, e o motorista passa a dever o que já levantou. Havia
   * aqui uma guarda que recusava esse caso — escrita quando a regra era que o
   * saldo nunca ficasse abaixo de zero. Impedir o cancelamento não fazia o erro
   * desaparecer; obrigava a mantê-lo registado como se estivesse certo.
   *
   * O motivo fica nas notas internas e o painel assinala quem está negativo.
   */
  async cancel(actor: Actor, id: string, reason?: string): Promise<SettlementPublic> {
    this.ensureManager(actor);

    const existing = await settlementsRepository.findById(id);
    if (!existing) throw new AppError('Fecho não encontrado', 404, 'SETTLEMENT_NOT_FOUND');

    if (existing.status === SettlementStatus.CANCELLED) {
      throw new AppError('Este fecho já está cancelado.', 400, 'ALREADY_CANCELLED');
    }

    const note = reason?.trim();
    const updated = await settlementsRepository.update(id, {
      status: SettlementStatus.CANCELLED,
      // O motivo vai para as notas internas, não para `notes`: aquele campo é
      // do motorista e sobrescrevê-lo apagaria o que lhe foi comunicado.
      ...(note ? { internalNotes: note } : {}),
    });

    logger.info(`[settlement] ${actor.id} cancelou fecho ${id}${note ? `: ${note}` : ''}`);

    return updated;
  }

  /**
   * Remove rascunhos e fechos já cancelados.
   *
   * Um fecho REGISTERED é a explicação de um crédito no saldo: apagá-lo deixa o
   * dinheiro lá e a razão desaparecida, e ninguém consegue responder por que o
   * saldo mudou naquele dia.
   *
   * Cancelado já não afeta saldo nenhum — a reversão aconteceu, e o cancel
   * recusa quando o dinheiro já foi levantado. Por isso apagar aí não deixa
   * nada por explicar. Quem precisa de eliminar um registado faz os dois
   * passos: cancela com motivo, depois apaga.
   */
  async remove(actor: Actor, id: string): Promise<void> {
    this.ensureManager(actor);

    const existing = await settlementsRepository.findById(id);
    if (!existing) throw new AppError('Fecho não encontrado', 404, 'SETTLEMENT_NOT_FOUND');

    if (existing.status === SettlementStatus.REGISTERED) {
      throw new AppError(
        'Um fecho registado explica um crédito no saldo. Cancele-o primeiro — o valor é revertido e o motivo fica registado — e depois apague.',
        400,
        'SETTLEMENT_NOT_DELETABLE',
      );
    }

    await settlementsRepository.delete(id);
  }

  /**
   * Pré-visualização do cálculo, sem gravar. Alimenta a tela enquanto se digita,
   * por isso recebe apenas os valores — não exige motorista nem semana.
   */
  async preview(actor: Actor, input: SettlementAmounts) {
    this.ensureManager(actor);
    const rate = await this.resolveRate(input);
    const taxRate = await this.resolveTaxRate(input);
    return {
      commissionRate: rate,
      taxRate,
      ...computeTotals({ ...input, commissionRate: rate, taxRate }),
    };
  }
}

export const settlementsService = new SettlementsService();
