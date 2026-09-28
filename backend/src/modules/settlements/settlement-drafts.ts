// src/modules/settlements/settlement-drafts.ts
//
// O que uma semana tem de cada motorista, lido do que a extensão importou.
//
// É a matéria-prima do botão "Gerar rascunhos da semana". Vive à parte do
// serviço dos fechos porque é só LEITURA: junta ganhos, despesas e o carro, e
// não decide nem grava nada. Quem decide o que fazer com isto é o serviço.
//
// ─── DE ONDE VEM CADA CAMPO ──────────────────────────────────────────────────
//
//   Uber, Bolt       lançamentos da semana, por confirmar ou confirmados — os
//                    mesmos que o formulário mostra ao lado dos campos. Os
//                    RECUSADOS ficam de fora: foram julgados errados.
//   Outras receitas  lançamentos de outras plataformas (Free Now, Outra).
//   Combustível      movimentos da Prio desta semana de fecho que se descontam.
//   Portagens        movimentos da Via Verde desta semana de fecho que se
//                    descontam — que são os da semana ANTERIOR, já resolvido na
//                    importação.
//   Viatura          o encargo semanal do carro que o motorista teve nessa
//                    semana. Se trocou a meio, o que teve durante mais tempo.
//
// ─── QUEM ENTRA ──────────────────────────────────────────────────────────────
//
// Só motoristas com ganhos OU despesas descontáveis na semana. Decisão do
// cliente: quem não trabalhou não recebe rascunho, mesmo que tivesse carro.

import { prisma } from '../../config/prisma';

const DIA = 86_400_000;

function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface WeekCandidate {
  userId: string;
  userName: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
  /** Os outros carros que teve na semana, se trocou a meio. */
  otherPlates: string[];
  amounts: {
    uberAmount: number;
    boltAmount: number;
    otherRevenue: number;
    fuelAmount: number;
    tollsAmount: number;
    vehicleFee: number;
    otherDeductions: number;
  };
  counts: { uber: number; bolt: number; other: number; fuel: number; tolls: number };
  /** Um fecho que já ocupa a semana. Com ele, o motorista é saltado. */
  existing: { id: string; status: string; weekStart: Date; weekEnd: Date } | null;
}

/**
 * Tudo o que a semana que começa em `weekStart` tem, por motorista.
 *
 * `weekStart` é a segunda-feira à meia-noite UTC, como o resto do sistema a
 * guarda (@db.Date).
 */
export async function gatherWeek(weekStart: Date): Promise<WeekCandidate[]> {
  const weekEnd = new Date(weekStart.getTime() + 6 * DIA);
  const depoisDoFim = new Date(weekStart.getTime() + 7 * DIA);

  const [ganhos, despesas] = await Promise.all([
    prisma.earning.groupBy({
      by: ['userId', 'platform'],
      where: {
        date: { gte: weekStart, lte: weekEnd },
        status: { not: 'REJECTED' },
        user: { role: 'DRIVER' },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.expenseMovement.groupBy({
      by: ['userId', 'source'],
      where: { settlementWeek: weekStart, userId: { not: null }, chargeable: true },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const ids = [...new Set([
    ...ganhos.map((g) => g.userId),
    ...despesas.map((d) => d.userId).filter((x): x is string => !!x),
  ])];
  if (ids.length === 0) return [];

  const [motoristas, existentes, atribuicoes, carrosAtuais] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids }, role: 'DRIVER' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    // Quem ocupa a semana: qualquer fecho que se sobreponha a ela, e ainda um
    // CANCELADO que comece na mesma segunda-feira.
    //
    // O segundo caso existe por causa do índice único (motorista, início da
    // semana): um cancelado liberta a semana para a verificação de
    // sobreposição, mas continua a ocupar o índice, e a criação rebentava.
    // Até o índice passar a ignorar os cancelados, o caminho é apagar o
    // cancelado — e a pré-visualização tem de o dizer.
    prisma.weeklySettlement.findMany({
      where: {
        userId: { in: ids },
        OR: [
          { status: { not: 'CANCELLED' }, weekStart: { lte: weekEnd }, weekEnd: { gte: weekStart } },
          { status: 'CANCELLED', weekStart },
        ],
      },
      select: { id: true, userId: true, status: true, weekStart: true, weekEnd: true },
      // Os não cancelados primeiro: são o motivo mais forte para saltar.
      orderBy: { status: 'desc' },
    }),
    // Os carros que cada um teve durante a semana.
    prisma.vehicleAssignment.findMany({
      where: {
        userId: { in: ids },
        startedAt: { lt: depoisDoFim },
        OR: [{ endedAt: null }, { endedAt: { gt: weekStart } }],
      },
      select: {
        userId: true, startedAt: true, endedAt: true,
        vehicle: { select: { id: true, plate: true, weeklyFee: true } },
      },
    }),
    // Recurso, para quem não tem atribuições registadas: o carro atual.
    prisma.vehicle.findMany({
      where: { userId: { in: ids } },
      select: { id: true, plate: true, weeklyFee: true, userId: true },
    }),
  ]);

  return motoristas.map((m) => {
    const soma = (plataforma: string) =>
      ganhos.filter((g) => g.userId === m.id && g.platform === plataforma);
    const somaOutras = ganhos.filter((g) => g.userId === m.id && g.platform !== 'UBER' && g.platform !== 'BOLT');
    const total = (xs: { _sum: { amount: unknown } }[]) =>
      cents(xs.reduce((a, x) => a + Number(x._sum.amount ?? 0), 0));
    const conta = (xs: { _count: { _all: number } }[]) => xs.reduce((a, x) => a + x._count._all, 0);
    const desp = (fonte: string) => despesas.filter((d) => d.userId === m.id && d.source === fonte);

    // O carro da semana: o que esteve com ele mais tempo dentro dela.
    const meus = atribuicoes
      .filter((a) => a.userId === m.id)
      .map((a) => {
        const ini = Math.max(a.startedAt.getTime(), weekStart.getTime());
        const fim = Math.min((a.endedAt ?? depoisDoFim).getTime(), depoisDoFim.getTime());
        return { v: a.vehicle, dur: Math.max(0, fim - ini) };
      })
      .filter((x) => x.dur > 0)
      .sort((a, b) => b.dur - a.dur);
    const escolhido = meus[0]?.v ?? carrosAtuais.find((c) => c.userId === m.id) ?? null;
    const outros = [...new Set(meus.slice(1).map((x) => x.v.plate))].filter((p) => p !== escolhido?.plate);

    const existente = existentes.find((e) => e.userId === m.id) ?? null;

    return {
      userId: m.id,
      userName: m.name,
      vehicleId: escolhido?.id ?? null,
      vehiclePlate: escolhido?.plate ?? null,
      otherPlates: outros,
      amounts: {
        uberAmount: total(soma('UBER')),
        boltAmount: total(soma('BOLT')),
        otherRevenue: total(somaOutras),
        fuelAmount: total(desp('PRIO')),
        tollsAmount: total(desp('VIA_VERDE')),
        vehicleFee: cents(Number(escolhido?.weeklyFee ?? 0)),
        otherDeductions: 0,
      },
      counts: {
        uber: conta(soma('UBER')),
        bolt: conta(soma('BOLT')),
        other: conta(somaOutras),
        fuel: conta(desp('PRIO')),
        tolls: conta(desp('VIA_VERDE')),
      },
      existing: existente
        ? { id: existente.id, status: existente.status, weekStart: existente.weekStart, weekEnd: existente.weekEnd }
        : null,
    };
  });
}
