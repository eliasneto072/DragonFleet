// src/jobs/reminders.job.ts
//
// Avisa, uma vez por dia, de cada lembrete por fazer.
//
// ─── PORQUE É QUE lastNotifiedOn GUARDA O DIA E NÃO O INSTANTE ─────────────
//
// Porque o job pode correr mais do que uma vez no mesmo dia: um reinício do
// servidor, um deploy a meio da manhã, uma execução manual. Com um instante, a
// conta "passaram 24 horas?" dava falso na segunda execução e não avisava — ou,
// pior, com o sinal trocado, avisava três vezes.
//
// Com o DIA, a pergunta é "já avisei hoje?", que tem sempre a mesma resposta
// por mais vezes que se corra.

import { prisma } from '../config/prisma';
import { logger } from '../shared/utils/logger';

/** Só a parte do dia, em UTC — a coluna é `@db.Date`. */
function soDia(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function runReminders(hoje = new Date()): Promise<void> {
  const dia = soDia(hoje);

  const porFazer = await prisma.reminder.findMany({
    where: {
      doneAt: null,
      // Já chegou o dia marcado (ou passou).
      dueOn: { lte: dia },
      // E ainda não foi avisado hoje.
      OR: [{ lastNotifiedOn: null }, { lastNotifiedOn: { lt: dia } }],
    },
    take: 500,
  });

  if (porFazer.length === 0) return;

  for (const r of porFazer) {
    try {
      // Há quantos dias é que isto está à espera. Vai na mensagem de propósito:
      // um lembrete que diz "há 9 dias" é muito mais difícil de ignorar do que
      // o mesmo texto repetido pela nona vez.
      const atraso = Math.floor((dia.getTime() - soDia(r.dueOn).getTime()) / 86_400_000);
      const sufixo = atraso <= 0 ? '' : ` · há ${atraso} dia${atraso === 1 ? '' : 's'}`;

      await prisma.$transaction([
        prisma.notification.create({
          data: {
            userId: r.ownerId,
            title: `Lembrete${sufixo}`,
            message: r.notes ? `${r.title}\n${r.notes}` : r.title,
          },
        }),
        prisma.reminder.update({
          where: { id: r.id },
          data: { lastNotifiedOn: dia },
        }),
      ]);
    } catch (erro) {
      // Um lembrete com problema não trava os outros.
      logger.error(`[lembretes] erro no lembrete ${r.id}`, erro);
    }
  }

  logger.info(`[lembretes] ${porFazer.length} aviso(s) enviado(s)`);
}
