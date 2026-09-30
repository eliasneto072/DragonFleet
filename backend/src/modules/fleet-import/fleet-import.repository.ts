// src/modules/fleet-import/fleet-import.repository.ts
//
// O que a importação precisa de saber da base de dados: que carros existem, e
// com quem estiveram na semana que se está a fechar.
//
// Fica separado do service pela mesma razão que o `planear` é uma função pura:
// as decisões estão lá e testam-se sem Postgres; aqui só se vai buscar dados.

import { prisma } from '../../config/prisma';
import type { Atribuicao, Veiculo } from './planear';

export interface VeiculoComTaxa extends Veiculo {
  /** A mensalidade/semanalidade da viatura, para o fecho não sair incompleto. */
  weeklyFee: number;
}

export const fleetImportRepository = {
  /** Todos os veículos, com a taxa semanal. */
  async veiculos(): Promise<VeiculoComTaxa[]> {
    const linhas = await prisma.vehicle.findMany({
      select: { id: true, plate: true, weeklyFee: true },
      orderBy: { plate: 'asc' },
    });
    return linhas.map((v) => ({
      id: v.id,
      plate: v.plate,
      weeklyFee: Number(v.weeklyFee ?? 0),
    }));
  },

  /**
   * As atribuições que TOCAM a semana.
   *
   * O filtro é a sobreposição de intervalos e não "começou nesta semana": um
   * carro que está com o mesmo motorista desde janeiro tem de aparecer no fecho
   * de outubro. Uma atribuição sem fim (`endedAt` nulo) está em vigor, por isso
   * entra sempre que começou antes do fim da semana.
   *
   * Quem decide a quem fica a despesa é o `planear` — aqui só se recolhe o
   * histórico, inteiro, para ele poder contar os dias.
   */
  async atribuicoes(inicio: Date, fim: Date): Promise<Atribuicao[]> {
    const linhas = await prisma.vehicleAssignment.findMany({
      where: {
        startedAt: { lte: fim },
        OR: [{ endedAt: null }, { endedAt: { gte: inicio } }],
      },
      select: { vehicleId: true, userId: true, startedAt: true, endedAt: true },
    });
    return linhas.map((a) => ({
      vehicleId: a.vehicleId,
      userId: a.userId,
      inicio: a.startedAt,
      fim: a.endedAt,
    }));
  },

  /**
   * Os motoristas que já têm fecho a cruzar esta semana.
   *
   * Sem isto, a importação tentava criar e apanhava um erro de sobreposição a
   * meio, com metade dos rascunhos criados. Saber antes permite avisar e
   * continuar — que é o comportamento certo: o resto da semana não tem culpa.
   */
  async jaComFecho(inicio: Date, fim: Date): Promise<Set<string>> {
    const linhas = await prisma.weeklySettlement.findMany({
      where: { weekStart: { lte: fim }, weekEnd: { gte: inicio } },
      select: { userId: true },
    });
    return new Set(linhas.map((l) => l.userId));
  },

  /** Nome de cada motorista, para os avisos falarem de pessoas e não de ids. */
  async nomes(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const linhas = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(linhas.map((l) => [l.id, l.name]));
  },
};
