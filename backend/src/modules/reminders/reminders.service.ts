// src/modules/reminders/reminders.service.ts
//
// Lembretes que insistem até alguém os dar por feitos.
//
// ─── PORQUE É QUE INSISTE ───────────────────────────────────────────────────
//
// Foi o ponto do pedido: "ele vai mandando notificação desse lembrete, até eu
// carregar no concluir". Um lembrete que avisa uma vez perde-se entre as outras
// notificações do dia. Um que volta todos os dias é uma lista de coisas por
// fazer que se esvazia sozinha quando se fazem.
//
// ─── DE QUEM SÃO ────────────────────────────────────────────────────────────
//
// De quem os criou, e de mais ninguém. Um lembrete não é uma tarefa atribuída:
// é uma nota que uma pessoa deixa a si própria. Partilhá-los entre a equipa
// transformaria isto noutra coisa — e essa outra coisa precisa de dono,
// estado e prazo, que é um sistema inteiro e não um cartão no painel.

import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';

interface Actor { id: string; role?: UserRole }

/** Quem tem painel. O motorista tem o dele, e também pode ter lembretes. */
function podeUsar(role?: UserRole) {
  return role !== undefined && role !== UserRole.INVESTOR;
}

function paraDia(valor: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new AppError('Data inválida.', 400, 'INVALID_DATE');
  }
  return new Date(`${valor}T00:00:00.000Z`);
}

export const remindersService = {
  /**
   * Os lembretes de quem pergunta.
   *
   * Por omissão só os POR FAZER, porque é isso que um painel mostra. Os
   * concluídos continuam gravados e vêm com `done: true` — servem para
   * confirmar que algo foi tratado, que é metade da utilidade de uma lista.
   */
  async list(actor: Actor, incluirConcluidos = false) {
    if (!podeUsar(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const linhas = await prisma.reminder.findMany({
      where: {
        ownerId: actor.id,
        ...(incluirConcluidos ? {} : { doneAt: null }),
      },
      orderBy: [{ doneAt: 'asc' }, { dueOn: 'asc' }],
      take: 200,
    });

    return linhas.map((r) => ({
      id: r.id,
      title: r.title,
      notes: r.notes,
      dueOn: r.dueOn,
      doneAt: r.doneAt,
      createdAt: r.createdAt,
    }));
  },

  async create(actor: Actor, entrada: { title: string; notes?: string | null; dueOn?: string }) {
    if (!podeUsar(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const titulo = entrada.title.trim();
    if (!titulo) throw new AppError('Escreva o lembrete.', 400, 'EMPTY_TITLE');

    // Sem data, é para hoje. É o caso comum — alguém lembra-se de uma coisa e
    // escreve-a; obrigar a escolher uma data a cada vez fazia desistir.
    const dueOn = entrada.dueOn ? paraDia(entrada.dueOn) : new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
    );

    return prisma.reminder.create({
      data: {
        title: titulo,
        notes: entrada.notes?.trim() || null,
        dueOn,
        ownerId: actor.id,
      },
    });
  },

  /**
   * Concluir, e voltar a abrir.
   *
   * Reabrir existe porque o engano mais provável nesta tela é carregar em
   * concluído na linha errada — e sem forma de desfazer, o lembrete
   * desaparecia e a pessoa ficava sem saber o que lá estava escrito.
   */
  async setDone(actor: Actor, id: string, done: boolean) {
    const r = await prisma.reminder.findUnique({ where: { id }, select: { ownerId: true } });
    if (!r) throw new AppError('Lembrete não encontrado', 404, 'NOT_FOUND');
    if (r.ownerId !== actor.id) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    return prisma.reminder.update({
      where: { id },
      data: {
        doneAt: done ? new Date() : null,
        // Ao reabrir, limpa-se o dia do último aviso para voltar a avisar hoje
        // em vez de só amanhã.
        ...(done ? {} : { lastNotifiedOn: null }),
      },
    });
  },

  async remove(actor: Actor, id: string) {
    const r = await prisma.reminder.findUnique({ where: { id }, select: { ownerId: true } });
    if (!r) throw new AppError('Lembrete não encontrado', 404, 'NOT_FOUND');
    if (r.ownerId !== actor.id) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    await prisma.reminder.delete({ where: { id } });
  },
};
