// src/jobs/scheduled-payments.job.ts
//
// Lança os pagamentos agendados que chegaram à data.
//
// ─── PORQUE É QUE CADA AGENDAMENTO VAI NA SUA PRÓPRIA TRANSAÇÃO ─────────────
//
// Uma transação só, à volta de todos, seria mais arrumada e muito pior: um
// motorista apagado a meio, um valor que a base recusa, e a passagem inteira
// desfazia-se — incluindo os quarenta que estavam certos. Separados, um
// problema afeta um agendamento e os outros seguem.
//
// ─── PORQUE É QUE O MOVIMENTO E A ACTUALIZAÇÃO VÃO JUNTOS ──────────────────
//
// Dentro de cada agendamento, o `balanceAdjustment` que se cria e o avanço da
// `nextRunOn` têm de ser atómicos. Se o movimento entrasse e a data não
// avançasse, a passagem seguinte lançava-o outra vez — o motorista descontado
// duas vezes pela mesma coisa, e sem nada no ecrã a explicá-lo.

import { prisma } from '../config/prisma';
import { logger } from '../shared/utils/logger';
import { AdjustmentType } from '../shared/types/enums';
import { decidir, soDia, comoDia, type Frequencia } from '../modules/scheduled-payments/recorrencia';
import { avisar } from '../shared/services/avisos';

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

export async function runScheduledPayments(hoje = new Date()): Promise<void> {
  const dia = soDia(hoje);

  const vencidos = await prisma.scheduledPayment.findMany({
    where: { active: true, nextRunOn: { lte: dia } },
    include: { user: { select: { id: true, name: true } } },
  });

  if (vencidos.length === 0) return;

  logger.info(`[agendamentos] ${vencidos.length} agendamento(s) vencido(s) a processar`);

  for (const p of vencidos) {
    try {
      const decisao = decidir(
        {
          frequency: p.frequency as Frequencia,
          startsOn: p.startsOn,
          nextRunOn: p.nextRunOn,
          endsOn: p.endsOn,
          remaining: p.remaining,
          active: p.active,
          runCount: p.runCount,
        },
        dia,
      );

      if (decisao.lancarEm.length === 0) {
        // Nada a lançar, mas o estado pode ter mudado — passou do fim, por
        // exemplo. Gravar à mesma, senão volta a ser apanhado todos os dias.
        await prisma.scheduledPayment.update({
          where: { id: p.id },
          data: {
            nextRunOn: decisao.proximo.nextRunOn,
            remaining: decisao.proximo.remaining,
            active: decisao.proximo.active,
          },
        });
        continue;
      }

      const valor = Number(p.amount);

      await prisma.$transaction(async (tx) => {
        for (const data of decisao.lancarEm) {
          // Um ajuste manual, em tudo. A `createdAt` é a data AGENDADA e não a
          // de hoje: é ela que ancora o movimento no extrato, e um pagamento de
          // dia 1 lançado por um job que correu a dia 3 pertence ao dia 1.
          await tx.balanceAdjustment.create({
            data: {
              amount: valor,
              type: p.type,
              reason: p.description,
              userId: p.userId,
              createdBy: p.createdById,
              createdAt: data,
              // A origem, escrita. É daqui que sai o total por categoria, e é
              // isto que permite ao extrato do motorista dizer de onde veio um
              // débito em vez de mostrar só o texto.
              scheduledPaymentId: p.id,
            },
          });
        }

        await tx.scheduledPayment.update({
          where: { id: p.id },
          data: {
            nextRunOn: decisao.proximo.nextRunOn,
            remaining: decisao.proximo.remaining,
            active: decisao.proximo.active,
            runCount: { increment: decisao.lancarEm.length },
            lastRunAt: new Date(),
          },
        });
      });

      // ── Avisar, sem deixar o aviso derrubar o lançamento ─────────────────
      //
      // O dinheiro já mexeu. Se a notificação falhar — e é uma escrita como
      // outra qualquer — deixar o erro subir faria esta passagem parecer
      // falhada, e a seguinte não voltaria a lançar (a data já avançou), mas o
      // registo ficaria a dizer que correu mal. Entre as duas, um erro no
      // diário é muito melhor do que um movimento perdido.
      try {
        const sinal = p.type === AdjustmentType.CREDIT ? '+' : '−';
        const total = valor * decisao.lancarEm.length;
        const quantos = decisao.lancarEm.length;

        await avisar(p.userId, {
          titulo: p.type === AdjustmentType.CREDIT
            ? 'Crédito adicionado ao seu saldo'
            : 'Débito aplicado ao seu saldo',
          mensagem: `${sinal}${eur(valor)} — ${p.description}`
            + (quantos > 1 ? ` (${quantos} lançamentos em atraso)` : ''),
        });

        // E o aviso a quem criou o agendamento, que foi o que ele pediu: o
        // movimento entra sozinho, mas ninguém fica sem saber que entrou.
        await avisar(p.createdById, {
          titulo: 'Pagamento agendado lançado',
          mensagem: `${sinal}${eur(total)} em ${p.user.name} — ${p.description}`
            + (quantos > 1 ? ` (${quantos} lançamentos)` : '')
            + (decisao.proximo.active && decisao.proximo.nextRunOn
              ? ` · próximo a ${comoDia(decisao.proximo.nextRunOn)}`
              : ' · foi o último'),
        });
      } catch (erro) {
        logger.error('[agendamentos] falhou a notificação', erro);
      }

      logger.info(
        `[agendamentos] ${p.id}: ${decisao.lancarEm.length} lançamento(s) de ${eur(valor)} `
        + `em ${p.user.name}`,
      );
    } catch (erro) {
      // Um agendamento com problema não trava os outros.
      logger.error(`[agendamentos] erro no agendamento ${p.id}`, erro);
    }
  }
}
