// src/modules/analytics/fleet-stats.repository.ts
//
// As estatísticas da frota: o que entrou, o que saiu, e quanto ficou.
//
// ═══ A REGRA DO LUCRO ═══════════════════════════════════════════════════════
//
// Definida pelo cliente, nas palavras dele:
//
//   "lucro da empresa = valor de carros de todos menos eu
//                     + valor do fecho da semana meu apenas"
//
// Traduzido, fecho a fecho:
//
//   motorista normal  →  conta o ALUGUER DA VIATURA (`vehicle_fee`)
//   o dono, a conduzir →  conta o LÍQUIDO DA SEMANA (`net_to_driver`)
//
// E é só isto — uma expressão, usada em todas as consultas deste ficheiro:
//
//   CASE WHEN u.is_company THEN s.net_to_driver ELSE s.vehicle_fee END
//
// ─── O QUE FICA DELIBERADAMENTE DE FORA ─────────────────────────────────────
//
// A COMISSÃO dos outros motoristas. O cliente foi explícito: "nos outros só a
// comissão do veículo mais nada". Ela é somada e devolvida à parte, para o
// ecrã a poder mostrar como informação — mas não entra no lucro.
//
// O ALUGUER lançado ao dono. É a empresa a cobrar a si própria; contá-lo
// inventava receita. Cai fora sozinho, porque para ele a expressão usa o
// líquido.
//
// ─── E O QUE O LUCRO NÃO SABE ───────────────────────────────────────────────
//
// Seguro, manutenção, pneus, IUC, prestações. Nada disso existe na base de
// dados, portanto isto é lucro ANTES desses custos, e o ecrã diz-lo. Um número
// apresentado como "lucro" sem essa ressalva seria pior do que não o mostrar.
//
// ─── PORQUÊ SÓ OS FECHOS REGISTADOS ─────────────────────────────────────────
//
// Um rascunho ainda não é dinheiro. É a mesma regra do resto do sistema
// (`driver_balances` conta `status = 'REGISTERED'`), e é o que impede que as
// estatísticas e o saldo de um motorista contem histórias diferentes.

import { prisma } from '../../config/prisma';

/**
 * O lucro, fecho a fecho. Uma definição só, para não haver duas a divergirem.
 * `u` é a tabela dos utilizadores, `s` a dos fechos.
 */
const LUCRO = `CASE WHEN u.is_company THEN s.net_to_driver ELSE s.vehicle_fee END`;

// Antes havia aqui uma constante `ELETRICO` que separava combustível de
// carregamento pelo tipo do CARRO, porque os dois partilhavam uma coluna.
// Já não: cada um tem a sua, e a soma lê o que foi escrito em vez de o
// deduzir. A diferença aparece num híbrido — que tem os dois na mesma semana
// — e no dia em que um carro for reclassificado, que com a versão antiga
// mudava retroativamente as despesas de todas as semanas passadas.

export interface FleetTotals {
  faturacaoBruta: number;
  pagoAosMotoristas: number;
  viaVerde: number;
  combustivel: number;
  carregamento: number;
  aluguerViaturas: number;
  comissao: number;
  imposto: number;
  outrasDeducoes: number;
  /** A regra do cliente. Ver o cabeçalho. */
  lucroEmpresa: number;
  semanas: number;
  kmPercorridos: number | null;
}

export interface CarroStats {
  vehicleId: string;
  plate: string;
  brand: string;
  model: string;
  energyType: 'FUEL' | 'ELECTRIC' | 'HYBRID';
  semanas: number;
  faturacaoBruta: number;
  viaVerde: number;
  /** Combustível e carregamento, separados — e a soma dos dois em `energia`. */
  combustivel: number;
  carregamento: number;
  energia: number;
  aluguer: number;
  pagoAoMotorista: number;
  lucro: number;
  /** Nulo quando nenhuma semana desse carro trouxe quilómetros. */
  km: number | null;
}

export interface MotoristaStats {
  userId: string;
  name: string;
  isCompany: boolean;
  semanas: number;
  faturacaoBruta: number;
  recebido: number;
  lucroParaEmpresa: number;
  mediaSemanal: number;
}

/** Linhas cruas do Postgres: tudo desce como número já convertido. */
type LinhaTotais = {
  faturacao: number; pago: number; via_verde: number; combustivel: number;
  carregamento: number; aluguer: number; comissao: number; imposto: number;
  outras: number; lucro: number; semanas: number; km: number | null;
};

export const fleetStatsRepository = {
  /**
   * Os totais do período.
   *
   * Uma consulta só. Sete consultas separadas davam o mesmo resultado e sete
   * varreduras da mesma tabela — e, pior, podiam apanhá-la em estados
   * diferentes se alguém registasse um fecho pelo meio.
   */
  async totais(from: Date, to: Date): Promise<FleetTotals> {
    const [r] = await prisma.$queryRawUnsafe<LinhaTotais[]>(
      `
      SELECT
        CAST(COALESCE(SUM(s.gross_revenue), 0)     AS FLOAT) AS faturacao,
        CAST(COALESCE(SUM(s.net_to_driver), 0)     AS FLOAT) AS pago,
        CAST(COALESCE(SUM(s.tolls_amount), 0)      AS FLOAT) AS via_verde,
        CAST(COALESCE(SUM(s.fuel_amount), 0)       AS FLOAT) AS combustivel,
        CAST(COALESCE(SUM(s.charge_amount), 0)     AS FLOAT) AS carregamento,
        CAST(COALESCE(SUM(s.vehicle_fee), 0)       AS FLOAT) AS aluguer,
        CAST(COALESCE(SUM(s.commission_amount), 0) AS FLOAT) AS comissao,
        CAST(COALESCE(SUM(s.tax_amount), 0)        AS FLOAT) AS imposto,
        CAST(COALESCE(SUM(s.other_deductions), 0)  AS FLOAT) AS outras,
        CAST(COALESCE(SUM(${LUCRO}), 0)            AS FLOAT) AS lucro,
        CAST(COUNT(*) AS INTEGER)                            AS semanas,
        -- NULL quando nenhuma semana trouxe quilómetros, e não zero: "não foi
        -- registado" e "não andou" são coisas diferentes.
        CAST(SUM(CASE WHEN s.odometer_start IS NOT NULL AND s.odometer_end IS NOT NULL
                      THEN s.odometer_end - s.odometer_start END) AS INTEGER) AS km
      FROM weekly_settlements s
      JOIN users u        ON u.id = s.user_id
      LEFT JOIN vehicles v ON v.id = s.vehicle_id
      WHERE s.status = 'REGISTERED' AND s.week_end >= $1 AND s.week_end <= $2
      `,
      from, to,
    );

    return {
      faturacaoBruta: r?.faturacao ?? 0,
      pagoAosMotoristas: r?.pago ?? 0,
      viaVerde: r?.via_verde ?? 0,
      combustivel: r?.combustivel ?? 0,
      carregamento: r?.carregamento ?? 0,
      aluguerViaturas: r?.aluguer ?? 0,
      comissao: r?.comissao ?? 0,
      imposto: r?.imposto ?? 0,
      outrasDeducoes: r?.outras ?? 0,
      lucroEmpresa: r?.lucro ?? 0,
      semanas: r?.semanas ?? 0,
      kmPercorridos: r?.km ?? null,
    };
  },

  /** Por carro, do que mais deu lucro para o que menos deu. */
  async porCarro(from: Date, to: Date): Promise<CarroStats[]> {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        v.id AS vehicle_id, v.plate, v.brand, v.model,
        v.energy_type::text AS energy_type,
        CAST(COUNT(*) AS INTEGER)                            AS semanas,
        CAST(COALESCE(SUM(s.gross_revenue), 0)     AS FLOAT) AS faturacao,
        CAST(COALESCE(SUM(s.tolls_amount), 0)      AS FLOAT) AS via_verde,
        CAST(COALESCE(SUM(s.fuel_amount), 0)       AS FLOAT) AS combustivel,
        CAST(COALESCE(SUM(s.charge_amount), 0)     AS FLOAT) AS carregamento,
        CAST(COALESCE(SUM(s.fuel_amount + s.charge_amount), 0) AS FLOAT) AS energia,
        CAST(COALESCE(SUM(s.vehicle_fee), 0)       AS FLOAT) AS aluguer,
        CAST(COALESCE(SUM(s.net_to_driver), 0)     AS FLOAT) AS pago,
        CAST(COALESCE(SUM(${LUCRO}), 0)            AS FLOAT) AS lucro,
        CAST(SUM(CASE WHEN s.odometer_start IS NOT NULL AND s.odometer_end IS NOT NULL
                      THEN s.odometer_end - s.odometer_start END) AS INTEGER) AS km
      FROM weekly_settlements s
      JOIN users u    ON u.id = s.user_id
      JOIN vehicles v ON v.id = s.vehicle_id
      WHERE s.status = 'REGISTERED' AND s.week_end >= $1 AND s.week_end <= $2
      GROUP BY v.id, v.plate, v.brand, v.model, v.energy_type
      ORDER BY lucro DESC
      `,
      from, to,
    );

    return linhas.map((l) => ({
      vehicleId: l.vehicle_id,
      plate: l.plate,
      brand: l.brand,
      model: l.model,
      energyType: l.energy_type,
      semanas: l.semanas,
      faturacaoBruta: l.faturacao,
      viaVerde: l.via_verde,
      combustivel: l.combustivel,
      carregamento: l.carregamento,
      energia: l.energia,
      aluguer: l.aluguer,
      pagoAoMotorista: l.pago,
      lucro: l.lucro,
      km: l.km ?? null,
    }));
  },

  /** Por motorista, do que mais fatura para o que menos fatura. */
  async porMotorista(from: Date, to: Date): Promise<MotoristaStats[]> {
    const linhas = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        u.id AS user_id, u.name, u.is_company,
        CAST(COUNT(*) AS INTEGER)                        AS semanas,
        CAST(COALESCE(SUM(s.gross_revenue), 0) AS FLOAT) AS faturacao,
        CAST(COALESCE(SUM(s.net_to_driver), 0) AS FLOAT) AS recebido,
        CAST(COALESCE(SUM(${LUCRO}), 0)        AS FLOAT) AS lucro
      FROM weekly_settlements s
      JOIN users u ON u.id = s.user_id
      WHERE s.status = 'REGISTERED' AND s.week_end >= $1 AND s.week_end <= $2
      GROUP BY u.id, u.name, u.is_company
      ORDER BY faturacao DESC
      `,
      from, to,
    );

    return linhas.map((l) => ({
      userId: l.user_id,
      name: l.name,
      isCompany: l.is_company,
      semanas: l.semanas,
      faturacaoBruta: l.faturacao,
      recebido: l.recebido,
      lucroParaEmpresa: l.lucro,
      // A média é por SEMANA FECHADA e não por semana de calendário: um
      // motorista que esteve de baixa duas semanas não deve aparecer com
      // metade da média por causa disso.
      mediaSemanal: l.semanas > 0 ? Math.round((l.faturacao / l.semanas) * 100) / 100 : 0,
    }));
  },

  /**
   * A evolução, mês a mês. Para o gráfico.
   *
   * Agrupa por `week_start` — a semana pertence ao mês em que começou, como no
   * resto do sistema. Uma semana de 30 de março a 5 de abril conta em março
   * nas duas telas, e não numa em cada.
   */
  async evolucao(from: Date, to: Date) {
    const linhas = await prisma.$queryRawUnsafe<
      { mes: string; faturacao: number; lucro: number; pago: number }[]
    >(
      `
      SELECT
        TO_CHAR(s.week_start, 'YYYY-MM')                 AS mes,
        CAST(COALESCE(SUM(s.gross_revenue), 0) AS FLOAT) AS faturacao,
        CAST(COALESCE(SUM(${LUCRO}), 0)        AS FLOAT) AS lucro,
        CAST(COALESCE(SUM(s.net_to_driver), 0) AS FLOAT) AS pago
      FROM weekly_settlements s
      JOIN users u ON u.id = s.user_id
      WHERE s.status = 'REGISTERED' AND s.week_end >= $1 AND s.week_end <= $2
      GROUP BY mes
      ORDER BY mes ASC
      `,
      from, to,
    );
    return linhas;
  },
};
