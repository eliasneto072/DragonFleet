// src/modules/companies/companies.service.ts
//
// Sociedades a quem os motoristas emitem recibo verde.
//
// O QUE ISTO É: uma lista gerível. Um operador com várias sociedades precisa de
// saber que entidade recebeu que fatura — é contabilidade corrente, e é isso
// que este módulo serve.
//
// O QUE ISTO NÃO FAZ, DELIBERADAMENTE: não calcula quanto foi para cada
// sociedade em percentagem do total de um motorista, não compara nada com
// limiares, e não sugere para onde emitir a seguir. Um registo diz o que
// aconteceu; essas contas diriam o que fazer a seguir, e são outra ferramenta.

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/AppError';

export interface CompanyPublic {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  /** Quantas retiradas já foram emitidas a esta sociedade. */
  withdrawalCount?: number;
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
    const rows = await prisma.company.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { withdrawals: true } } },
    });

    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      active: c.active,
      sortOrder: c.sortOrder,
      withdrawalCount: c._count.withdrawals,
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
    const count = await prisma.withdrawal.count({ where: { companyId: id } });
    if (count > 0) {
      throw new AppError(
        `Esta sociedade já tem ${count} recibo${count === 1 ? '' : 's'} emitido${count === 1 ? '' : 's'}. ` +
        'Desative-a em vez de a apagar — apagá-la deixaria esses recibos sem sociedade.',
        409,
        'COMPANY_IN_USE',
      );
    }

    await prisma.company.delete({ where: { id } });
    return { deleted: true };
  }
}

export const companiesService = new CompaniesService();
