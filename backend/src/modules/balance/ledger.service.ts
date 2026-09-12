// src/modules/balance/ledger.service.ts
//
// O extrato de um motorista: os movimentos por ordem, e com quanto ele ficou
// depois de cada um.
//
// Pedido do cliente, textualmente: "dar para filtrar por motorista, e aparecer
// não só o movimento, mas também aparecer com quanto é que ele ficou depois
// daquele movimento".
//
// ─── QUE MOVIMENTOS ENTRAM ───────────────────────────────────────────────────
//
// Os mesmos quatro que a view `driver_balances` soma, porque o objetivo é
// explicar o número que o portal mostra e não produzir um segundo número:
//
//   + fechos semanais REGISTERED        (net_to_driver)
//   + ajustes de crédito
//   − ajustes de débito
//   − retiradas APPROVED e PAID
//
// As retiradas PENDING NÃO entram. Decisão do cliente, e é a certa: uma
// pendente ainda pode ser recusada, e mostrar no extrato uma linha que pode
// desaparecer é pior do que não a mostrar.
//
// ─── A CONSEQUÊNCIA DISSO, QUE NÃO SE PODE ESCONDER ──────────────────────────
//
// A última linha NÃO é o `available` da view. A view subtrai também as
// pendentes. O que o extrato dá é:
//
//     settlements + credits − debits − withdrawn
//   = available + pending_withdrawals
//
// É por isso que a coluna se chama "Saldo em conta" e nunca "disponível", e é
// por isso que a resposta traz a reconciliação inteira. O portal do motorista
// mostra "Saldo disponível para retirada"; se a administração lhe disser outro
// número sem explicar a diferença, gera exactamente os telefonemas que isto
// devia evitar.
//
// ─── QUE DATA ANCORA CADA LINHA ──────────────────────────────────────────────
//
// Fecho semanal → `weekStart`. É a semana a que o dinheiro pertence, e é o que
// o motorista reconhece. O `registeredAt` seria a data em que alguém lançou,
// que pode ser semanas depois.
//
// Retirada → `requestedAt`. NUNCA `processedAt`: esse é reescrito a cada mudança
// de estado, portanto uma retirada aprovada e depois paga MUDA DE SÍTIO no
// extrato, e o saldo acumulado de todas as linhas pelo meio muda com ela. Um
// documento que se reordena sozinho entre duas consultas não serve para
// explicar nada. O `requestedAt` é estável e é a única data que o motorista vê
// na tela de retiradas dele.
//
// Ajuste → `createdAt`. É a única que tem.

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/AppError';
import { balanceService } from './balance.service';
import { SettlementStatus, AdjustmentType, UserRole } from '../../shared/types/enums';
// De `shared` e nao do `xlsx-kit`: importar do modulo de relatorios punha o
// balance a depender do reports, que e a direcao errada. Ver a nota no ficheiro
// sobre as duas copias antigas que ficam por migrar.
import { cents } from '../../shared/utils/money';

// Declarado aqui como o resto do projeto faz — o balance, o settlements, o bank
// e o users tem cada um a sua copia. Nao inventei um sitio partilhado a meio de
// uma funcionalidade; se isso se fizer, faz-se de proposito e num pacote so.
type Actor = { id: string; role?: UserRole };

export type LedgerKind = 'SETTLEMENT' | 'CREDIT' | 'DEBIT' | 'WITHDRAWAL';

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  /** A data que ancora a linha. Ver nota no topo sobre qual é para cada tipo. */
  date: string;
  /** Descrição curta, pronta para a tela. */
  label: string;
  /** Detalhe secundário: a semana do fecho, o motivo do ajuste. */
  detail?: string | null;
  /** Assinado: positivo entra, negativo sai. */
  amount: number;
  /** O saldo em conta DEPOIS deste movimento. É o que o cliente pediu. */
  balance: number;
  /** Só nos fechos, para a tela poder ligar à linha correspondente. */
  settlementId?: string;
}

export interface LedgerReconciliation {
  /** A última linha do extrato. */
  accountBalance: number;
  /** Reservado por pedidos por decidir. Não está no extrato. */
  pendingWithdrawals: number;
  /** O que o portal do motorista mostra. accountBalance − pendingWithdrawals. */
  availableToWithdraw: number;
}

export interface LedgerResult {
  entries: LedgerEntry[];
  reconciliation: LedgerReconciliation;
}

const ESTADO_RETIRADA: Record<string, string> = {
  APPROVED: 'aprovada',
  PAID: 'paga',
};

export const ledgerService = {
  /**
   * O extrato de UM motorista.
   *
   * Exige `userId` e não aceita listas. O acumulado só tem significado para uma
   * pessoa — somar movimentos de gente diferente daria um número que não
   * corresponde a conta nenhuma. É também por isso que a tela exige escolha
   * explícita em vez de pesquisa por texto: procurar "Silva" pode apanhar
   * quatro pessoas.
   */
  async forDriver(actor: Actor, userId: string): Promise<LedgerResult> {
    try {
      // ─── A AUTORIZACAO VEM PRIMEIRO, SOZINHA ───────────────────────────
      //
      // Estava dentro do Promise.all, ao lado das tres leituras. Os dados nunca
      // chegavam a resposta — a rejeicao do getSummary rejeitava o Promise.all
      // — mas as consultas COMPLETAVAM-SE de qualquer maneira, porque o
      // Promise.all nao cancela as restantes. Cada pedido recusado fazia
      // trabalho real sobre os dados financeiros de outra pessoa.
      //
      // Custa um ida-e-volta a mais. Autorizar antes de ler nao e uma
      // otimizacao que se troca por latencia.
      //
      // O `getSummary` faz `ensureOwnerOrManager` e `ensureUserExists`, e e
      // tambem a fonte da reconciliacao: o `pendingWithdrawals` vem da MESMA
      // view que o portal do motorista le, para os dois numeros nao poderem
      // discordar.
      const resumo = await balanceService.getSummary(actor, userId);

      const [fechos, ajustes, retiradas] = await Promise.all([
        prisma.weeklySettlement.findMany({
          where: { userId, status: SettlementStatus.REGISTERED },
          select: { id: true, weekStart: true, weekEnd: true, netToDriver: true },
        }),
        prisma.balanceAdjustment.findMany({
          where: { userId },
          select: { id: true, amount: true, type: true, reason: true, createdAt: true },
        }),
        prisma.withdrawal.findMany({
          // Os mesmos estados que a view conta como `withdrawn`. Se um dia
          // mudarem lá, tem de mudar aqui — e o teste de integração compara as
          // duas contas precisamente para isso não passar em silêncio.
          where: { userId, status: { in: ['APPROVED', 'PAID'] } },
          select: { id: true, amount: true, requestedAt: true, status: true },
        }),
      ]);

      const movimentos: Array<Omit<LedgerEntry, 'balance'>> = [
        ...fechos.map((f) => ({
          id: `s:${f.id}`,
          kind: 'SETTLEMENT' as const,
          date: f.weekStart.toISOString(),
          label: 'Fecho semanal',
          detail: `${diaCurto(f.weekStart)} a ${diaCurto(f.weekEnd)}`,
          amount: cents(Number(f.netToDriver)),
          settlementId: f.id,
        })),

        ...ajustes.map((a) => ({
          id: `a:${a.id}`,
          kind: (a.type === AdjustmentType.CREDIT ? 'CREDIT' : 'DEBIT') as LedgerKind,
          date: a.createdAt.toISOString(),
          label: a.type === AdjustmentType.CREDIT ? 'Crédito manual' : 'Débito manual',
          detail: a.reason,
          // O `amount` do ajuste é sempre positivo na base; o sinal vem do tipo.
          amount: cents(Number(a.amount)) * (a.type === AdjustmentType.CREDIT ? 1 : -1),
        })),

        ...retiradas.map((r) => ({
          id: `w:${r.id}`,
          kind: 'WITHDRAWAL' as const,
          date: r.requestedAt.toISOString(),
          label: `Retirada ${ESTADO_RETIRADA[r.status] ?? r.status.toLowerCase()}`,
          detail: null,
          amount: -cents(Number(r.amount)),
        })),
      ];

      // Ordem cronológica. O desempate por `id` não é decorativo: sem ele, dois
      // movimentos com a mesma data podiam trocar de posição entre duas
      // consultas, e o saldo das linhas pelo meio mudava sem nada ter mudado.
      movimentos.sort((a, b) =>
        a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date),
      );

      let acumulado = 0;
      const entries: LedgerEntry[] = movimentos.map((m) => {
        acumulado = cents(acumulado + m.amount);
        return { ...m, balance: acumulado };
      });

      const pendingWithdrawals = cents(Number(resumo.pendingWithdrawals ?? 0));

      return {
        entries,
        reconciliation: {
          accountBalance: acumulado,
          pendingWithdrawals,
          availableToWithdraw: cents(acumulado - pendingWithdrawals),
        },
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('Erro ao montar o extrato do motorista', err);
      throw err;
    }
  },
};

function diaCurto(d: Date): string {
  return d.toISOString().slice(0, 10);
}
