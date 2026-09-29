// src/modules/analytics/fleet-stats.service.ts
//
// As estatísticas da frota, montadas para uma tela só.
//
// ─── UM PEDIDO E NÃO SEIS ───────────────────────────────────────────────────
//
// A tela mostra totais, uma tabela por carro, uma por motorista, destaques e
// um gráfico. Seis endpoints dariam seis estados de carregamento no ecrã e —
// pior — seis fotografias da base tiradas em instantes diferentes: bastava
// alguém registar um fecho pelo meio para a soma por carro deixar de bater
// com o total lá em cima.
//
// ─── OS DESTAQUES SAEM DAQUI E NÃO DO SQL ───────────────────────────────────
//
// "Quem fatura mais", "quem fatura menos", "que carro andou mais" são o
// primeiro e o último de listas que já viemos a buscar. Fazê-lo em SQL eram
// mais três varreduras para não saber nada de novo.

import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import {
  fleetStatsRepository,
  type CarroStats, type FleetTotals, type MotoristaStats,
} from './fleet-stats.repository';

type Actor = { id: string; role?: UserRole };

function podeVer(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export interface FleetStatsResponse {
  periodo: { from: string; to: string };
  totais: FleetTotals;
  porCarro: CarroStats[];
  porMotorista: MotoristaStats[];
  evolucao: { mes: string; faturacao: number; lucro: number; pago: number }[];
  destaques: {
    maisFatura: MotoristaStats | null;
    menosFatura: MotoristaStats | null;
    maisLucro: CarroStats | null;
    maisKm: CarroStats | null;
  };
}

export class FleetStatsService {
  async get(actor: Actor, params: { from?: Date; to?: Date }): Promise<FleetStatsResponse> {
    if (!podeVer(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    // Sem período, o ano civil corrente. Escolhido em vez de "últimos 12
    // meses" porque a pergunta que traz alguém a esta tela é quase sempre
    // "como está a correr o ano", e é o número que o contabilista procura.
    const hoje = new Date();
    const from = params.from ?? new Date(Date.UTC(hoje.getUTCFullYear(), 0, 1));
    const to = params.to ?? new Date(Date.UTC(hoje.getUTCFullYear(), 11, 31, 23, 59, 59));

    if (from > to) {
      throw new AppError('A data de início é posterior à de fim.', 400, 'INVALID_PERIOD');
    }

    const [totais, porCarro, porMotorista, evolucao] = await Promise.all([
      fleetStatsRepository.totais(from, to),
      fleetStatsRepository.porCarro(from, to),
      fleetStatsRepository.porMotorista(from, to),
      fleetStatsRepository.evolucao(from, to),
    ]);

    // `porMotorista` já vem ordenado pela faturação, do maior para o menor.
    //
    // "Quem fatura menos" ignora quem tem UMA semana só: um motorista que
    // entrou na sexta-feira aparecia sempre em último, e apontá-lo como o que
    // fatura menos era uma acusação e não uma estatística. Se ninguém tiver
    // mais do que uma semana, mostra-se o último que houver.
    const comHistorico = porMotorista.filter((m) => m.semanas > 1);
    const paraMenos = comHistorico.length ? comHistorico : porMotorista;

    const comKm = porCarro.filter((c) => c.km !== null);

    return {
      periodo: { from: from.toISOString(), to: to.toISOString() },
      totais,
      porCarro,
      porMotorista,
      evolucao,
      destaques: {
        maisFatura: porMotorista[0] ?? null,
        menosFatura: paraMenos.length ? paraMenos[paraMenos.length - 1] : null,
        // `porCarro` vem ordenado por lucro.
        maisLucro: porCarro[0] ?? null,
        maisKm: comKm.length
          ? comKm.reduce((a, b) => ((a.km ?? 0) >= (b.km ?? 0) ? a : b))
          : null,
      },
    };
  }
}

export const fleetStatsService = new FleetStatsService();
