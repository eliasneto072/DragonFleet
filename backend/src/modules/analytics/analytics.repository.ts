import { prisma } from '../../config/prisma';
import {
  UserRole, UserStatus, WithdrawalStatus, DocumentStatus, EarningPlatform,
  EarningStatus, SettlementStatus, TicketStatus,
} from '../../shared/types/enums';

/**
 * Agregações do módulo de análises.
 *
 * Tudo é somado em SQL. As telas de administração faziam GET /users,
 * /earnings, /withdrawals e /documents — as tabelas inteiras — e totalizavam
 * em JavaScript no browser. Com uma centena de motoristas isso são dezenas de
 * milhares de linhas pela rede para mostrar um único número, além de expor os
 * dados individuais de toda a gente onde bastava uma soma.
 *
 * getStats  → tendência ao longo do tempo (tela de Análises)
 * getOverview → o que precisa de ação agora (painel)
 */

/**
 * 'week' e não 'day': cada ponto do gráfico é uma SEMANA fechada.
 *
 * Enquanto as análises somavam lançamentos, que têm data própria, um ponto por
 * dia fazia sentido. Agora somam fechos, e um fecho cobre a semana inteira —
 * chamar-lhe "dia" era rotular o gráfico com uma unidade que ele não usa.
 *
 * O bucket continua a ser AAAA-MM-DD: é a segunda-feira que abre a semana.
 */
export type Granularity = 'week' | 'month';

/**
 * ─── AS ANÁLISES LEEM DOS FECHOS, NÃO DOS LANÇAMENTOS ────────────────────────
 *
 * A versão anterior somava a tabela `earnings` e tinha dois defeitos, ambos
 * a produzir números errados na tela todos os dias:
 *
 * 1. NÃO FILTRAVA O ESTADO. Um lançamento comunicado e depois REJEITADO
 *    continuava a contar no total, no gráfico, na média e no ranking. Um
 *    lançamento rejeitado é precisamente um que foi julgado errado.
 *
 * 2. MEDIA O QUE FOI DITO, NÃO O QUE FOI PAGO. Neste sistema, `earnings` são
 *    valores comunicados — informação por conferir. Dinheiro a sério só existe
 *    num WeeklySettlement REGISTERED. A tela de Análises estava a apresentar
 *    declarações como se fossem faturação.
 *
 * E a receita da empresa era calculada no browser como
 * `grossEarnings × comissão atual`, o que ignorava duas coisas de uma vez: que
 * cada fecho grava a SUA percentagem — mudar a comissão hoje reescrevia a
 * receita histórica — e que a comissão incide sobre o LUCRO, não sobre o bruto,
 * portanto o número saía sempre acima do que a empresa recebeu.
 *
 * Agora tudo vem de colunas gravadas e congeladas no fecho: commissionAmount,
 * netToDriver, grossRevenue, uberAmount, boltAmount. Nenhuma é recalculada, e
 * por isso nenhuma pode divergir do recibo que o motorista tem na mão.
 *
 * CONSEQUÊNCIA A CONHECER: as Análises passam a refletir SEMANAS FECHADAS. Uma
 * semana ainda por registar não aparece — o que é correto, porque ainda não é
 * dinheiro, mas explica por que um período recente pode aparecer vazio.
 */
export interface AnalyticsStats {
  range: { from: Date; to: Date; granularity: Granularity };
  totalDrivers: number;
  activeDrivers: number;
  /** Faturação bruta dos fechos registados: Uber + Bolt + outras receitas. */
  grossEarnings: number;
  /** Comissão da empresa, somada tal como ficou gravada em cada fecho. */
  companyRevenue: number;
  /** O que os motoristas receberam, líquido de despesas e comissão. */
  netToDrivers: number;
  /** Quantos fechos entram nestes números. */
  settlementsCount: number;
  activeInPeriod: number;
  pendingWithdrawals: number;
  /**
   * Repartição por plataforma, das colunas do fecho.
   *
   * Vem daqui e não do `platform` dos lançamentos porque é o valor auditado —
   * é o que foi usado para pagar. `count` é o número de fechos que tiveram
   * receita nessa plataforma, não o número de lançamentos.
   */
  earningsByPlatform: { platform: EarningPlatform; total: number; count: number }[];
  series: { bucket: string; total: number }[];
  topDrivers: { name: string; email: string; total: number }[];
}

export interface StalledDriver {
  id: string;
  name: string;
  email: string;
  lastEarningAt: Date;
  totalEarned: number;
}

/** Motorista ativo sem fecho da semana de referência. */
export interface DriverWithoutSettlement {
  id: string;
  name: string;
}

export interface OverviewRaw {
  documentsPending: { count: number; oldestAt: Date | null };
  withdrawalsPending: { count: number; total: number; oldestAt: Date | null };
  earningsPending: { count: number; oldestAt: Date | null };
  /** Tickets abertos ou em progresso, com a data do mais antigo. */
  supportOpen: { count: number; oldestAt: Date | null };
  /**
   * Dados bancários à espera de aprovação.
   *
   * Faltava nesta fila desde que a aprovação de IBAN foi construída, e a
   * ausência tinha consequência: um motorista submetia o IBAN e ficava à
   * espera indefinidamente, porque nada no painel o mostrava e ninguém tinha
   * motivo para abrir a aba do Financeiro. Sem IBAN aprovado ele não consegue
   * pedir retiradas — ou seja, o silêncio bloqueava-lhe o dinheiro.
   */
  bankPending: { count: number; oldestAt: Date | null };
  driversBlocked: number;
  documentsExpiringSoon: number;
  /** Quem ainda não tem a semana passada fechada. */
  missingSettlements: DriverWithoutSettlement[];
  grossThisMonth: number;
  grossPrevMonth: number;
  paidThisMonth: number;
  paidCountThisMonth: number;
  owedToDrivers: number;
  owedByDrivers: number;
  /** Quem está com saldo abaixo de zero. */
  negativeDrivers: { id: string; name: string; balance: number }[];
  totalDrivers: number;
  activeLast30: number;
  stalledDrivers: StalledDriver[];
}

/**
 * Intervalos curtos ganham barras diárias; longos, mensais. A decisão fica
 * aqui e não no frontend porque é ela que define o GROUP BY.
 */
function pickGranularity(from: Date, to: Date): Granularity {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  return days <= 62 ? 'week' : 'month';
}

export const analyticsRepository = {
  async getStats(from: Date, to: Date): Promise<AnalyticsStats> {
    const granularity = pickGranularity(from, to);
    const bucketFormat = granularity === 'week' ? 'YYYY-MM-DD' : 'YYYY-MM';

    // Um fecho entra no período quando a SEMANA A QUE DIZ RESPEITO acaba lá
    // dentro — não quando foi registado. Um fecho da semana de março lançado
    // com atraso em abril continua a ser faturação de março, e é assim que o
    // contabilista o vai procurar.
    const noPeriodo = {
      status: SettlementStatus.REGISTERED,
      weekEnd: { gte: from, lte: to },
    };

    const [
      totalDrivers,
      activeDrivers,
      totais,
      pendingWithdrawals,
      seriesRaw,
      activeRaw,
      topDriversRaw,
    ] = await Promise.all([
      prisma.user.count({ where: { role: UserRole.DRIVER } }),

      prisma.user.count({
        where: { role: UserRole.DRIVER, status: UserStatus.ACTIVE },
      }),

      // Uma agregação só para tudo o que é dinheiro. Cada coluna já foi
      // calculada e congelada no momento do fecho; aqui apenas se somam.
      prisma.weeklySettlement.aggregate({
        where: noPeriodo,
        _sum: {
          grossRevenue: true,
          commissionAmount: true,
          netToDriver: true,
          uberAmount: true,
          boltAmount: true,
          otherRevenue: true,
        },
        _count: { _all: true },
      }),

      prisma.withdrawal.count({ where: { status: WithdrawalStatus.PENDING } }),

      // TO_CHAR aceita o formato como parâmetro, por isso a interpolação
      // continua parametrizada e não vira concatenação de SQL.
      //
      // Agrupa por week_start e não por week_end: a semana pertence ao dia em
      // que começou, e é assim que fica alinhada com o resto do sistema.
      prisma.$queryRaw<{ bucket: string; total: number }[]>`
        SELECT
          TO_CHAR(week_start, ${bucketFormat})   AS bucket,
          CAST(SUM(gross_revenue) AS FLOAT)      AS total
        FROM weekly_settlements
        WHERE status = 'REGISTERED' AND week_end >= ${from} AND week_end <= ${to}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,

      // Quem teve semana fechada no período. É retenção a sério: diferente de
      // status = ACTIVE, que é estado de cadastro — alguém pode estar ativo e
      // parado há meses.
      prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(DISTINCT user_id)::int AS count
        FROM weekly_settlements
        WHERE status = 'REGISTERED' AND week_end >= ${from} AND week_end <= ${to}
      `,

      prisma.$queryRaw<{ name: string; email: string; total: number }[]>`
        SELECT u.name, u.email, CAST(SUM(s.gross_revenue) AS FLOAT) AS total
        FROM weekly_settlements s
        JOIN users u ON u.id = s.user_id
        WHERE s.status = 'REGISTERED' AND s.week_end >= ${from} AND s.week_end <= ${to}
        GROUP BY u.id, u.name, u.email
        ORDER BY total DESC
        LIMIT 10
      `,
    ]);

    const soma = totais._sum;
    const n = (v: unknown) => Number(v ?? 0);

    // Só entram as plataformas com valor. Uma linha "Free Now: 0 €" num
    // gráfico de repartição não informa nada e ocupa legenda.
    const porPlataforma = [
      { platform: EarningPlatform.UBER, total: n(soma.uberAmount) },
      { platform: EarningPlatform.BOLT, total: n(soma.boltAmount) },
      { platform: EarningPlatform.OTHER, total: n(soma.otherRevenue) },
    ]
      .filter((p) => p.total > 0)
      .sort((a, b) => b.total - a.total)
      .map((p) => ({ ...p, count: totais._count._all }));

    return {
      range: { from, to, granularity },
      totalDrivers,
      activeDrivers,
      grossEarnings: n(soma.grossRevenue),
      companyRevenue: n(soma.commissionAmount),
      netToDrivers: n(soma.netToDriver),
      settlementsCount: totais._count._all,
      activeInPeriod: Number(activeRaw[0]?.count ?? 0),
      pendingWithdrawals,
      earningsByPlatform: porPlataforma,
      series: seriesRaw.map((s) => ({ bucket: s.bucket, total: Number(s.total) })),
      topDrivers: topDriversRaw.map((d) => ({ ...d, total: Number(d.total) })),
    };
  },

  async getOverview(
    stalledSince: Date,
    expiringUntil: Date,
    lastWeek: { start: Date; end: Date },
  ): Promise<OverviewRaw> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

    const [
      docsPendingCount,
      docsPendingOldest,
      withdrawalsPendingAgg,
      withdrawalsPendingOldest,
      earningsPendingCount,
      earningsPendingOldest,
      supportOpenCount,
      supportOpenOldest,
      bankPendingCount,
      bankPendingOldest,
      driversBlocked,
      documentsExpiringSoon,
      activeDriverRows,
      settledUserRows,
      grossThisMonthAgg,
      grossPrevMonthAgg,
      paidThisMonthAgg,
      totalDrivers,
      activeLast30Raw,
      balancesRaw,
      negativeRows,
      stalledRaw,
    ] = await Promise.all([
      prisma.document.count({ where: { status: DocumentStatus.PENDING } }),

      prisma.document.findFirst({
        where: { status: DocumentStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      prisma.withdrawal.aggregate({
        where: { status: WithdrawalStatus.PENDING },
        _sum: { amount: true },
        _count: { _all: true },
      }),

      prisma.withdrawal.findFirst({
        where: { status: WithdrawalStatus.PENDING },
        orderBy: { requestedAt: 'asc' },
        select: { requestedAt: true },
      }),

      // Lançamentos comunicados à espera de confirmação. Não movimentam saldo,
      // mas cada um é um motorista à espera de resposta.
      prisma.earning.count({ where: { status: EarningStatus.PENDING } }),

      prisma.earning.findFirst({
        where: { status: EarningStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      // Um ticket sem resposta é alguém à espera, e não aparecia em lado
      // nenhum: era preciso abrir Suporte para saber que existia.
      prisma.supportTicket.count({
        where: { status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } },
      }),

      prisma.supportTicket.findFirst({
        where: { status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      // Dados bancários por aprovar. `pendingAt` não nulo é o que marca uma
      // submissão à espera de decisão — o campo `iban` pode estar preenchido
      // ao mesmo tempo, porque o IBAN em vigor continua a valer enquanto a
      // alteração espera.
      prisma.bankAccount.count({ where: { pendingAt: { not: null } } }),

      prisma.bankAccount.findFirst({
        where: { pendingAt: { not: null } },
        orderBy: { pendingAt: 'asc' },
        select: { pendingAt: true },
      }),

      prisma.user.count({
        where: { role: UserRole.DRIVER, status: UserStatus.AGUARDANDO_REGULARIZACAO },
      }),

      // Aviso preventivo: o job já notifica o motorista, mas a gestão não via
      // nada. Ver antes evita que a pessoa pare de trabalhar.
      prisma.document.count({
        where: {
          status: DocumentStatus.APPROVED,
          expiresAt: { gte: now, lte: expiringUntil },
        },
      }),

      // Quem devia ter fecho da semana passada. As duas consultas são
      // separadas e cruzadas em memória: um NOT EXISTS com sobreposição de
      // intervalos em SQL fica difícil de ler e de conferir, e são poucas
      // dezenas de linhas de cada lado.
      prisma.user.findMany({
        where: { role: UserRole.DRIVER, status: UserStatus.ACTIVE },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),

      // Rascunho conta como feito: quem preparou e ainda não registou não
      // precisa de ver o aviso a meio do trabalho.
      prisma.weeklySettlement.findMany({
        where: {
          status: { not: SettlementStatus.CANCELLED },
          weekStart: { lte: lastWeek.end },
          weekEnd: { gte: lastWeek.start },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),

      prisma.earning.aggregate({
        where: { date: { gte: startOfMonth } },
        _sum: { amount: true },
      }),

      prisma.earning.aggregate({
        where: { date: { gte: startOfPrevMonth, lt: startOfMonth } },
        _sum: { amount: true },
      }),

      prisma.withdrawal.aggregate({
        where: { status: WithdrawalStatus.PAID, processedAt: { gte: startOfMonth } },
        _sum: { amount: true },
        _count: { _all: true },
      }),

      prisma.user.count({ where: { role: UserRole.DRIVER } }),

      prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(DISTINCT user_id)::int AS count
        FROM earnings
        WHERE date >= ${last30}
      `,

      // Passivo real: soma apenas os saldos POSITIVOS. Um motorista com saldo
      // negativo não abate o que a empresa deve aos outros — isso é valor a
      // receber, não menos dívida.
      //
      // A origem do dinheiro são os FECHOS SEMANAIS registados. Esta consulta
      // somava a tabela de ganhos, do tempo em que o motorista lançava o
      // próprio saldo; os lançamentos passaram a ser conferência e não creditam
      // nada, por isso somá-los aqui inflava o passivo e ignorava o que foi
      // efetivamente fechado.
      //
      // A fórmula vive na view `driver_balances`. Estava escrita aqui e em
      // mais dois sítios, e uma correção chegou a ser aplicada a uma cópia e
      // esquecida noutra — o painel divergiu das contas individuais até alguém
      // reparar. Com a view não há segunda definição para ficar para trás.
      prisma.$queryRaw<{ owed_to: number; owed_by: number }[]>`
        SELECT
          CAST(COALESCE(SUM(CASE WHEN available > 0 THEN available ELSE 0 END), 0) AS FLOAT) AS owed_to,
          CAST(COALESCE(SUM(CASE WHEN available < 0 THEN -available ELSE 0 END), 0) AS FLOAT) AS owed_by
        FROM driver_balances b
        JOIN users u ON u.id = b.user_id AND u.role = 'DRIVER'
      `,

      // Quem está negativo, por nome. O total já era calculado, mas sem os
      // nomes o alerta obrigaria a abrir ficha a ficha para descobrir quem é.
      prisma.$queryRaw<{ id: string; name: string; available: number }[]>`
        SELECT b.user_id AS id, b.user_name AS name, CAST(b.available AS FLOAT) AS available
        FROM driver_balances b
        JOIN users u ON u.id = b.user_id AND u.role = 'DRIVER'
        WHERE b.available < 0
        ORDER BY b.available ASC
      `,

      // JOIN e não LEFT JOIN: só entram motoristas que JÁ faturaram alguma vez.
      // Quem nunca lançou nada não "parou", ainda não começou — é outro
      // problema, com outra conversa.
      prisma.$queryRaw<{
        id: string; name: string; email: string; last_earning: Date; total_earned: number;
      }[]>`
        SELECT
          u.id, u.name, u.email,
          MAX(e.date)                AS last_earning,
          CAST(SUM(e.amount) AS FLOAT) AS total_earned
        FROM users u
        JOIN earnings e ON e.user_id = u.id
        WHERE u.role = 'DRIVER' AND u.status = 'ACTIVE'
        GROUP BY u.id, u.name, u.email
        HAVING MAX(e.date) < ${stalledSince}
        ORDER BY total_earned DESC
        LIMIT 8
      `,
    ]);

    const balances = balancesRaw[0] ?? { owed_to: 0, owed_by: 0 };

    const settledIds = new Set(settledUserRows.map((r) => r.userId));
    const missingSettlements = activeDriverRows.filter((d) => !settledIds.has(d.id));

    return {
      documentsPending: {
        count: docsPendingCount,
        oldestAt: docsPendingOldest?.createdAt ?? null,
      },
      earningsPending: {
        count: earningsPendingCount,
        oldestAt: earningsPendingOldest?.createdAt ?? null,
      },
      supportOpen: {
        count: supportOpenCount,
        oldestAt: supportOpenOldest?.createdAt ?? null,
      },
      bankPending: {
        count: bankPendingCount,
        oldestAt: bankPendingOldest?.pendingAt ?? null,
      },
      missingSettlements,
      withdrawalsPending: {
        count: withdrawalsPendingAgg._count._all,
        total: Number(withdrawalsPendingAgg._sum.amount ?? 0),
        oldestAt: withdrawalsPendingOldest?.requestedAt ?? null,
      },
      driversBlocked,
      documentsExpiringSoon,
      grossThisMonth: Number(grossThisMonthAgg._sum.amount ?? 0),
      grossPrevMonth: Number(grossPrevMonthAgg._sum.amount ?? 0),
      paidThisMonth: Number(paidThisMonthAgg._sum.amount ?? 0),
      paidCountThisMonth: paidThisMonthAgg._count._all,
      owedToDrivers: Number(balances.owed_to),
      owedByDrivers: Number(balances.owed_by),
      negativeDrivers: negativeRows.map((r) => ({
        id: r.id,
        name: r.name,
        balance: Number(r.available),
      })),
      totalDrivers,
      activeLast30: Number(activeLast30Raw[0]?.count ?? 0),
      stalledDrivers: stalledRaw.map((d) => ({
        id: d.id,
        name: d.name,
        email: d.email,
        lastEarningAt: d.last_earning,
        totalEarned: Number(d.total_earned),
      })),
    };
  },
};