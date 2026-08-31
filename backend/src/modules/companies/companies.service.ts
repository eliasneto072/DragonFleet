// src/modules/companies/companies.service.ts
//
// Sociedades a quem os motoristas emitem recibo verde.
//
// O QUE ISTO É: uma lista gerível. Um operador com várias sociedades precisa de
// saber que entidade recebeu que fatura — é contabilidade corrente, e é isso
// que este módulo serve.
//
// A listagem traz agora, por sociedade, quantos recibos lhe foram emitidos e
// quanto somam. A versão anterior recusava-se a isto de propósito, com o
// argumento de que um registo diz o que aconteceu e essas contas dizem o que
// fazer a seguir. O argumento não estava errado; o âmbito é que mudou, e a
// contagem por sociedade passou a fazer parte do que se pede a esta tela.
//
// O que se mantém é a exigência que estava por baixo desse argumento: os
// números têm de ser verificáveis. Por isso são dois e não um — o que o
// registo mostra e o que a base tem ligado — e por isso a soma é feita em SQL.

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/AppError';
import { WithdrawalStatus } from '../../shared/types/enums';

/**
 * Os estados que produzem recibo — o mesmo universo da tela de Recibos Verdes.
 *
 * PENDING fica de fora porque ainda pode ser rejeitada. REJECTED fica de fora
 * porque não gera recibo nenhum — mas repare-se que uma rejeitada PODE estar
 * classificada: APPROVED → REJECTED é uma transição legal e não limpa as
 * colunas da sociedade. Contá-la punha o cartão a dizer "4 recibos" enquanto
 * o registo por baixo mostrava 3, sem nada a explicar a diferença.
 */
const RECEIPT_STATUSES = [WithdrawalStatus.APPROVED, WithdrawalStatus.PAID];

export interface CompanyPublic {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;

  /** Recibos emitidos a esta sociedade. Só APPROVED e PAID. */
  receiptCount?: number;

  /**
   * Soma desses recibos, em euros.
   *
   * Somada em SQL sobre o Decimal e convertida uma vez no fim. Somar do lado
   * do JavaScript sobre valores já convertidos acumularia erro de vírgula
   * flutuante — poucos cêntimos, ao fim de um trimestre, sem explicação.
   */
  receiptTotal?: number;

  /**
   * Retiradas a apontar para esta sociedade, seja qual for o estado.
   *
   * É este o número que decide se se pode apagar, e não o de cima: o SET NULL
   * desligaria todas elas, incluindo as rejeitadas que o registo não mostra.
   * Uma sociedade com zero recibos e uma retirada rejeitada continua a não
   * poder ser apagada — e agora os dois números dizem porquê.
   */
  linkedCount?: number;
}

class CompaniesService {
  /**
   * Lista as sociedades.
   *
   * `includeInactive` só para a gestão da lista: quem está a classificar um
   * recibo não deve poder escolher uma sociedade desativada, mas quem
   * administra a lista tem de a ver para a reativar.
   */
  async list(includeInactive = false): Promise<CompanyPublic[]> {
    const [rows, receipts, linked] = await Promise.all([
      prisma.company.findMany({
        where: includeInactive ? {} : { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),

      // Contagem e soma dos recibos. groupBy e não uma contagem por linha:
      // uma consulta para todas as sociedades em vez de uma por cada.
      prisma.withdrawal.groupBy({
        by: ['companyId'],
        where: { companyId: { not: null }, status: { in: RECEIPT_STATUSES } },
        _count: { _all: true },
        _sum: { amount: true },
      }),

      // Ligações totais, para a guarda do apagar. Sem filtro de estado, de
      // propósito: é o mesmo universo que o remove() conta.
      prisma.withdrawal.groupBy({
        by: ['companyId'],
        where: { companyId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    // O `as string` é seguro porque ambos os groupBy filtram `companyId: { not:
    // null }`. O Prisma tipa a coluna agrupada como `string | null` na mesma,
    // porque não lê a cláusula where para estreitar o tipo do resultado.
    const receiptsById = new Map<string, { count: number; total: number }>(
      receipts.map((r) => [
        r.companyId as string,
        { count: r._count._all, total: r._sum.amount?.toNumber() ?? 0 },
      ]),
    );
    const linkedById = new Map<string, number>(
      linked.map((r) => [r.companyId as string, r._count._all]),
    );

    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      active: c.active,
      sortOrder: c.sortOrder,
      receiptCount: receiptsById.get(c.id)?.count ?? 0,
      receiptTotal: receiptsById.get(c.id)?.total ?? 0,
      linkedCount: linkedById.get(c.id) ?? 0,
    }));
  }

  async create(name: string): Promise<CompanyPublic> {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      throw new AppError('Indique o nome da sociedade.', 400, 'INVALID_NAME');
    }

    // Duplicados por descuido são o principal risco desta lista: duas linhas
    // com o mesmo nome partiriam o registo em dois sem ninguém reparar.
    const existing = await prisma.company.findFirst({
      where: { name: { equals: trimmed, mode: 'insensitive' } },
    });
    if (existing) {
      throw new AppError('Já existe uma sociedade com este nome.', 409, 'COMPANY_EXISTS');
    }

    const last = await prisma.company.findFirst({ orderBy: { sortOrder: 'desc' } });

    const created = await prisma.company.create({
      data: { name: trimmed, sortOrder: (last?.sortOrder ?? 0) + 1 },
    });
    logger.info(`[companies] sociedade criada: ${created.name}`);

    return {
      id: created.id, name: created.name,
      active: created.active, sortOrder: created.sortOrder,
    };
  }

  async update(id: string, data: { name?: string; active?: boolean }): Promise<CompanyPublic> {
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) throw new AppError('Sociedade não encontrada.', 404, 'COMPANY_NOT_FOUND');

    const name = data.name?.trim();
    if (name !== undefined && name.length < 2) {
      throw new AppError('Indique o nome da sociedade.', 400, 'INVALID_NAME');
    }

    const updated = await prisma.company.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });

    return {
      id: updated.id, name: updated.name,
      active: updated.active, sortOrder: updated.sortOrder,
    };
  }

  /**
   * Desativar, nunca apagar quando já há recibos emitidos.
   *
   * A chave estrangeira é SET NULL: apagar a sociedade deixaria as retiradas
   * dela sem classificação nenhuma, e o registo perderia justamente a parte
   * que interessa. Uma sociedade dissolvida continua a explicar o passado.
   */
  async remove(id: string): Promise<{ deleted: boolean }> {
    // Todos os estados, e não só os que geram recibo: o SET NULL não distingue.
    // Uma retirada aprovada, classificada e depois rejeitada continua a apontar
    // para cá, e apagar a sociedade desligá-la-ia à mesma.
    const count = await prisma.withdrawal.count({ where: { companyId: id } });
    if (count > 0) {
      const receipts = await prisma.withdrawal.count({
        where: { companyId: id, status: { in: RECEIPT_STATUSES } },
      });

      // Quando os dois números diferem, dizer só um deles deixa quem lê sem
      // perceber por que razão a tela mostra zero recibos e o apagar recusa.
      const detalhe = receipts === count
        ? `${count} retirada${count === 1 ? '' : 's'} ligada${count === 1 ? '' : 's'}`
        : `${count} retirada${count === 1 ? '' : 's'} ligada${count === 1 ? '' : 's'}, ` +
          `${receipts === 0 ? 'nenhuma' : `${receipts}`} com recibo — as outras foram rejeitadas depois de classificadas`;

      throw new AppError(
        `Esta sociedade tem ${detalhe}. ` +
        'Desative-a em vez de a apagar — apagá-la deixaria essas retiradas sem sociedade.',
        409,
        'COMPANY_IN_USE',
      );
    }

    await prisma.company.delete({ where: { id } });
    return { deleted: true };
  }
}

export const companiesService = new CompaniesService();
