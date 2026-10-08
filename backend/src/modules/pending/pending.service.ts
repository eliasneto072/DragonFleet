// src/modules/pending/pending.service.ts
//
// Tudo o que está por fazer, contado num pedido só.
//
// ─── PARA QUE SERVE ─────────────────────────────────────────────────────────
//
// Para duas coisas ao mesmo tempo: os resumos do painel, e os números ao lado
// de cada entrada do menu. São a mesma pergunta — "o que falta fazer, e onde"
// — e por isso são uma consulta só. Dois sítios a contar a mesma coisa acabam
// sempre a discordar, e aí é o menu a dizer três e o painel a dizer dois.
//
// ─── PORQUE É QUE SÃO MUITAS CONSULTAS PEQUENAS ─────────────────────────────
//
// Cada fonte é um `count` com um `where` indexado, e vão todas no mesmo
// `Promise.all` — uma ida à base de dados, em paralelo. A alternativa, uma
// consulta grande em SQL cru com dezoito subselects, era mais rápida em
// milissegundos e muito pior de manter: acrescentar uma fonte passava a ser
// mexer num bloco de SQL que ninguém se atreve a tocar.
//
// ─── O QUE CADA UM VÊ ───────────────────────────────────────────────────────
//
// O filtro é pelas permissões por área, aplicado DEPOIS de contar. Contar tudo
// e esconder o que não é dele é seguro porque o que sai daqui são números — e
// é muito mais simples de conferir do que dezoito consultas condicionais.
// O que NUNCA sai são nomes ou dados de quem quer que seja: só contagens,
// datas, e os nomes dos motoristas que já vinham no painel.

import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import { permissionsService, ehEquipa } from '../permissions/permissions.service';
import { settingsService } from '../settings/settings.service';
import {
  FONTES, estaAtrasado, fontesVisiveis, ordenar, resumoPorArea, totalPorFazer,
  type ChaveDaFonte, type Fonte,
} from './fontes';

export interface Actor { id: string; role?: UserRole }

/** Segunda-feira da semana anterior, em UTC. A mesma conta do painel. */
function semanaPassada(ref: Date): { start: Date; end: Date } {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const diaDaSemana = (d.getUTCDay() + 6) % 7; // 0 = segunda
  d.setUTCDate(d.getUTCDate() - diaDaSemana - 7);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: d, end };
}

function soDia(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const iso = (d: Date | null | undefined): string | null => d?.toISOString() ?? null;

/** Dentro de quantos dias uma inspeção já conta como coisa a tratar. */
const DIAS_DE_AVISO_DA_INSPECAO = 30;

export const pendingService = {
  /**
   * O que falta fazer.
   *
   * Só para a equipa: um motorista não tem painel de administração, e um
   * investidor ou uma oficina muito menos. A guarda está aqui e não só no
   * `requireArea` porque essa deixa passar quem não é da equipa, de propósito.
   */
  async summary(actor: Actor) {
    if (!ehEquipa(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const agora = new Date();
    const hoje = soDia(agora);
    const settings = await settingsService.get();
    const diasDeAviso = Number(settings.documentExpiryWarningDays ?? 7);

    const expiraAte = new Date(agora);
    expiraAte.setDate(expiraAte.getDate() + diasDeAviso);

    const inspecaoAte = new Date(hoje);
    inspecaoAte.setUTCDate(inspecaoAte.getUTCDate() + DIAS_DE_AVISO_DA_INSPECAO);

    const semana = semanaPassada(agora);

    const abertas = ['PENDENTE', 'NOVA_DATA_PROPOSTA', 'CONFIRMADA'] as const;

    const [
      // ── Oficina ──
      propostasCount, propostasVelha,
      semAcompanhanteCount, semAcompanhanteVelha,
      porConcluirCount, porConcluirVelha,
      pendentesCount, pendentesVelha,
      inspecoes,
      // ── Frota ──
      carrosPorAtivar, carrosPorAtivarVelho,
      materiais,
      // ── Dinheiro ──
      retiradasCount, retiradasVelha,
      ibansCount, ibansVelho,
      agendamentosAtrasados,
      negativos,
      // ── Faturação ──
      ganhosCount, ganhosVelho,
      motoristasAtivos, jaFechados,
      // ── Documentos ──
      docsCount, docsVelho,
      docsAExpirar,
      // ── Resto ──
      ticketsCount, ticketsVelho,
      resgatesCount, resgatesVelho,
      bloqueados,
      lembretes, lembretesVelho,
    ] = await Promise.all([
      prisma.booking.count({ where: { status: 'NOVA_DATA_PROPOSTA' } }),
      prisma.booking.findFirst({
        where: { status: 'NOVA_DATA_PROPOSTA' },
        orderBy: { updatedAt: 'asc' },
        select: { updatedAt: true },
      }),

      prisma.booking.count({
        where: { status: { in: [...abertas] }, needsEscort: true, escortId: null },
      }),
      prisma.booking.findFirst({
        where: { status: { in: [...abertas] }, needsEscort: true, escortId: null },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      // Confirmada e a hora já passou: foi à oficina e ninguém fechou a
      // marcação. É onde o custo da reparação se perde.
      prisma.booking.count({
        where: { status: 'CONFIRMADA', scheduledAt: { lt: agora } },
      }),
      prisma.booking.findFirst({
        where: { status: 'CONFIRMADA', scheduledAt: { lt: agora } },
        orderBy: { scheduledAt: 'asc' },
        select: { scheduledAt: true },
      }),

      prisma.booking.count({ where: { status: 'PENDENTE' } }),
      prisma.booking.findFirst({
        where: { status: 'PENDENTE' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      // As inspeções vêm com a data: é ela que decide se está só a chegar ao
      // fim ou se o carro já não pode circular.
      prisma.vehicle.findMany({
        where: {
          nextInspectionOn: { not: null, lte: inspecaoAte },
          status: { in: ['ACTIVE', 'PENDING', 'MAINTENANCE'] },
        },
        select: { nextInspectionOn: true },
        orderBy: { nextInspectionOn: 'asc' },
      }),

      prisma.vehicle.count({ where: { status: 'PENDING' } }),
      prisma.vehicle.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      // O mínimo compara duas colunas, e isso em Prisma obrigava a SQL cru.
      // São dezenas de linhas: traz-se as que TÊM mínimo e conta-se aqui.
      prisma.material.findMany({
        where: { active: true, minQty: { not: null } },
        select: { qty: true, minQty: true },
      }),

      prisma.withdrawal.count({ where: { status: 'PENDING' } }),
      prisma.withdrawal.findFirst({
        where: { status: 'PENDING' },
        orderBy: { requestedAt: 'asc' },
        select: { requestedAt: true },
      }),

      prisma.bankAccount.count({ where: { pendingIban: { not: null }, archivedAt: null } }),
      prisma.bankAccount.findFirst({
        where: { pendingIban: { not: null }, archivedAt: null },
        orderBy: { pendingAt: 'asc' },
        select: { pendingAt: true },
      }),

      // Activo, com data vencida e ainda não lançado. Não há coluna de erro:
      // esta é a forma de saber que o trabalho nocturno não correu.
      prisma.scheduledPayment.count({
        where: { active: true, nextRunOn: { not: null, lt: hoje } },
      }),

      // A fórmula do saldo vive na view `driver_balances` — ver a nota em
      // `analytics.repository.ts`. Aqui só se conta quantos estão abaixo de zero.
      prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n
        FROM driver_balances b
        JOIN users u ON u.id = b.user_id AND u.role = 'DRIVER'
        WHERE b.available < 0
      `,

      prisma.earning.count({ where: { status: 'PENDING' } }),
      prisma.earning.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      prisma.user.findMany({
        where: { role: UserRole.DRIVER, status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.weeklySettlement.findMany({
        where: {
          status: { not: 'CANCELLED' },
          weekStart: { lte: semana.end },
          weekEnd: { gte: semana.start },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),

      prisma.document.count({ where: { status: 'PENDING' } }),
      prisma.document.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.document.count({
        where: { status: 'APPROVED', expiresAt: { gte: agora, lte: expiraAte } },
      }),

      prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.supportTicket.findFirst({
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      prisma.investorWithdrawal.count({ where: { status: 'PENDING' } }),
      prisma.investorWithdrawal.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),

      prisma.user.count({ where: { role: UserRole.DRIVER, status: 'BLOCKED' } }),

      // Os lembretes são de QUEM PERGUNTA e não de todos: é uma lista pessoal.
      prisma.reminder.count({
        where: { ownerId: actor.id, doneAt: null, dueOn: { lte: hoje } },
      }),
      prisma.reminder.findFirst({
        where: { ownerId: actor.id, doneAt: null, dueOn: { lte: hoje } },
        orderBy: { dueOn: 'asc' },
        select: { dueOn: true },
      }),
    ]);

    // ── As inspeções, separadas entre as que faltam e as que já passaram ────
    const foraDePrazo = inspecoes.filter(
      (v) => v.nextInspectionOn !== null && soDia(v.nextInspectionOn) < hoje,
    ).length;

    // ── O material abaixo do mínimo ─────────────────────────────────────────
    const materialEmFalta = materiais.filter(
      (m) => Number(m.qty) <= Number(m.minQty),
    ).length;

    // ── Quem falta fechar ───────────────────────────────────────────────────
    const fechados = new Set(jaFechados.map((r) => r.userId));
    const semFecho = motoristasAtivos.filter((d) => !fechados.has(d.id));

    const agoraMs = agora.getTime();

    /** Constrói uma fonte, já com o nível e a área do catálogo. */
    const f = (
      key: ChaveDaFonte,
      count: number,
      oldestAt: string | null,
      opcoes: { late?: boolean; extra?: Record<string, unknown> } = {},
    ): Fonte => ({
      key,
      area: FONTES[key].area,
      nivel: FONTES[key].nivel,
      count,
      oldestAt,
      late: count > 0 && estaAtrasado(oldestAt, agoraMs, opcoes.late),
      ...(opcoes.extra ? { extra: opcoes.extra } : {}),
    });

    const todas: Fonte[] = [
      f('bookingsPropostas', propostasCount, iso(propostasVelha?.updatedAt)),
      f('bookingsSemAcompanhante', semAcompanhanteCount, iso(semAcompanhanteVelha?.createdAt)),
      // Atrasada por definição: a hora já passou. Não é a idade que manda.
      f('bookingsPorConcluir', porConcluirCount, iso(porConcluirVelha?.scheduledAt), { late: true }),
      f('bookingsPendentes', pendentesCount, iso(pendentesVelha?.createdAt)),
      f('inspections', inspecoes.length, iso(inspecoes[0]?.nextInspectionOn ?? null), {
        // Um carro fora de prazo não pode circular: isso arde no primeiro dia,
        // e não ao quarto.
        late: foraDePrazo > 0,
        extra: { overdue: foraDePrazo, days: DIAS_DE_AVISO_DA_INSPECAO },
      }),

      f('vehiclesPending', carrosPorAtivar, iso(carrosPorAtivarVelho?.createdAt)),
      f('materialsLow', materialEmFalta, null),

      f('withdrawalsPending', retiradasCount, iso(retiradasVelha?.requestedAt)),
      f('bankPending', ibansCount, iso(ibansVelho?.pendingAt)),
      f('scheduledLate', agendamentosAtrasados, null, { late: agendamentosAtrasados > 0 }),
      f('negativeDrivers', Number(negativos[0]?.n ?? 0), null),

      f('earningsPending', ganhosCount, iso(ganhosVelho?.createdAt)),
      f('missingSettlements', semFecho.length, null, {
        extra: {
          // Os primeiros nomes chegam para a linha do painel; a tela resolve
          // o resto. Ver PANEL_LIMIT no painel.
          drivers: semFecho.slice(0, 5),
          weekStart: semana.start.toISOString().slice(0, 10),
          weekEnd: semana.end.toISOString().slice(0, 10),
        },
      }),

      f('documentsPending', docsCount, iso(docsVelho?.createdAt)),
      f('documentsExpiring', docsAExpirar, null, { extra: { days: diasDeAviso } }),

      f('supportOpen', ticketsCount, iso(ticketsVelho?.createdAt)),
      f('investorWithdrawals', resgatesCount, iso(resgatesVelho?.createdAt)),
      f('driversBlocked', bloqueados, null),
      f('remindersDue', lembretes, iso(lembretesVelho?.dueOn)),
    ];

    const acessos = await permissionsService.grantsFor(actor.id, actor.role);
    const comConteudo = todas.filter((x) => x.count > 0);
    const minhas = ordenar(fontesVisiveis(comConteudo, acessos), agoraMs);

    return {
      sources: minhas,
      byArea: resumoPorArea(minhas),
      total: totalPorFazer(minhas),
      /// O relógio do servidor, para o painel contar os dias na mesma base.
      /// Sem isto, um browser com a hora adiantada mostrava "espera há 2 dias"
      /// no que chegou ontem.
      now: agora.toISOString(),
    };
  },
};
