// src/modules/scheduled-payments/scheduled-payments.service.ts
//
// Pagamentos que entram ou saem do saldo de um motorista, sozinhos, numa data.
//
// ─── O QUE ISTO CRIA NÃO É UM TIPO NOVO DE MOVIMENTO ────────────────────────
//
// Quando chega a data, nasce um `BalanceAdjustment` normal — o mesmo registo
// que sairia de alguém o lançar à mão, com a mesma descrição e o mesmo sentido.
//
// Foi o que o cliente pediu ("aparece esse movimento ao motorista como se fosse
// manual") e é a decisão certa por mais do que gosto: o extrato, o saldo, os
// relatórios e o recibo já sabem ler ajustes. Um movimento de um tipo novo
// obrigaria a ensinar-lhes a todos, e algum ficaria por ensinar — provavelmente
// o recibo, que é o que o contabilista vê.

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/AppError';
import { UserRole, AdjustmentType } from '../../shared/types/enums';
import { primeiraData, proximaData, soDia, type Frequencia } from './recorrencia';

interface Actor { id: string; role?: UserRole }

/** Quem mexe em dinheiro. O mesmo critério do resto do módulo financeiro. */
function podeGerir(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export interface EntradaAgendamento {
  userId: string;
  type: AdjustmentType;
  amount: number;
  description: string;
  categoryId?: string | null;
  frequency: Frequencia;
  /** "YYYY-MM-DD" */
  startsOn: string;
  endsOn?: string | null;
  /** Número de lançamentos a fazer ao todo. Nulo = sem limite. */
  remaining?: number | null;
}

function paraDia(valor: string, campo: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new AppError(`Data inválida em ${campo}.`, 400, 'INVALID_DATE');
  }
  return new Date(`${valor}T00:00:00.000Z`);
}

export const scheduledPaymentsService = {
  // ── Tipos de pagamento ────────────────────────────────────────────────────

  /**
   * A lista para o formulário.
   *
   * Os desligados saem na listagem de gestão mas não no formulário: um tipo
   * que se deixou de usar não deve voltar a aparecer para escolher, e apagá-lo
   * deixaria os agendamentos antigos a apontar para nada.
   */
  async listCategories(actor: Actor, incluirInativas = false) {
    if (!podeGerir(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    return prisma.paymentCategory.findMany({
      where: incluirInativas ? {} : { active: true },
      orderBy: { label: 'asc' },
    });
  },

  async createCategory(actor: Actor, label: string) {
    if (!podeGerir(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    const limpo = label.trim();
    if (!limpo) throw new AppError('Escreva o nome do tipo.', 400, 'EMPTY_LABEL');

    // Reaproveitar um desligado com o mesmo nome em vez de recusar: quem
    // escreve "Seguro" outra vez quer o "Seguro", não uma mensagem de erro
    // sobre um registo que não vê em lado nenhum.
    const existente = await prisma.paymentCategory.findFirst({ where: { label: limpo } });
    if (existente) {
      if (existente.active) return existente;
      return prisma.paymentCategory.update({ where: { id: existente.id }, data: { active: true } });
    }
    return prisma.paymentCategory.create({ data: { label: limpo } });
  },

  /** Desligar, nunca apagar — os agendamentos antigos ainda lhe apontam. */
  async setCategoryActive(actor: Actor, id: string, active: boolean) {
    if (!podeGerir(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    return prisma.paymentCategory.update({ where: { id }, data: { active } });
  },

  // ── Agendamentos ──────────────────────────────────────────────────────────

  async list(actor: Actor, filtro: { userId?: string; active?: boolean } = {}) {
    if (!podeGerir(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    const linhas = await prisma.scheduledPayment.findMany({
      where: {
        ...(filtro.userId ? { userId: filtro.userId } : {}),
        ...(filtro.active !== undefined ? { active: filtro.active } : {}),
      },
      orderBy: [{ active: 'desc' }, { nextRunOn: 'asc' }],
      include: {
        user: { select: { name: true } },
        category: { select: { label: true } },
      },
    });
    return linhas.map((p) => ({
      id: p.id,
      userId: p.userId,
      userName: p.user.name,
      type: p.type,
      amount: Number(p.amount),
      description: p.description,
      categoryId: p.categoryId,
      categoryLabel: p.category?.label ?? null,
      frequency: p.frequency,
      startsOn: p.startsOn,
      nextRunOn: p.nextRunOn,
      endsOn: p.endsOn,
      remaining: p.remaining,
      active: p.active,
      runCount: p.runCount,
      lastRunAt: p.lastRunAt,
    }));
  },

  async create(actor: Actor, entrada: EntradaAgendamento) {
    if (!podeGerir(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const motorista = await prisma.user.findUnique({
      where: { id: entrada.userId }, select: { id: true },
    });
    if (!motorista) throw new AppError('Motorista não encontrado', 404, 'USER_NOT_FOUND');

    if (!(entrada.amount > 0)) {
      throw new AppError('O valor deve ser maior que zero.', 400, 'INVALID_AMOUNT');
    }
    if (!entrada.description.trim()) {
      throw new AppError('Escreva a descrição — é o que o motorista vai ler.', 400, 'EMPTY_DESCRIPTION');
    }

    const startsOn = paraDia(entrada.startsOn, 'startsOn');
    const endsOn = entrada.endsOn ? paraDia(entrada.endsOn, 'endsOn') : null;
    if (endsOn && endsOn < startsOn) {
      throw new AppError('A data de fim é anterior à de início.', 400, 'INVALID_RANGE');
    }
    if (entrada.remaining !== null && entrada.remaining !== undefined && entrada.remaining < 1) {
      throw new AppError('O número de vezes tem de ser pelo menos 1.', 400, 'INVALID_COUNT');
    }

    // ── A guarda contra o ano trocado ──────────────────────────────────────
    //
    // Uma data de início muito no passado não é recusada: pode ser legítimo
    // querer recuperar meses em atraso. Mas 2020 em vez de 2026 é um engano de
    // teclado, e sem esta guarda gerava setenta descontos no primeiro job.
    //
    // O teto de doze por passagem já evita o pior, mas é melhor recusar aqui,
    // onde ainda há alguém a olhar para o ecrã.
    const limite = new Date();
    limite.setUTCFullYear(limite.getUTCFullYear() - 1);
    if (startsOn < soDia(limite)) {
      throw new AppError(
        'A data de início é de há mais de um ano. Confirme o ano antes de gravar.',
        400,
        'START_TOO_OLD',
      );
    }

    const criado = await prisma.scheduledPayment.create({
      data: {
        userId: entrada.userId,
        type: entrada.type,
        amount: entrada.amount,
        description: entrada.description.trim(),
        categoryId: entrada.categoryId ?? null,
        frequency: entrada.frequency,
        startsOn,
        nextRunOn: primeiraData(startsOn),
        endsOn,
        remaining: entrada.remaining ?? null,
        createdById: actor.id,
      },
    });

    logger.info(
      `[agendamentos] ${actor.id} criou ${entrada.type} de €${entrada.amount.toFixed(2)} `
      + `${entrada.frequency} em ${entrada.userId} a partir de ${entrada.startsOn}`,
    );
    return criado;
  },

  /**
   * Ligar e desligar.
   *
   * ─── PORQUE É QUE RELIGAR RECALCULA A DATA ──────────────────────────────
   *
   * Um agendamento desligado há três meses guarda a `nextRunOn` de então. Se
   * religar com ela intacta, o job vê três datas vencidas e lança as três de
   * uma vez — três descontos que ninguém pediu, por se ter carregado num
   * interruptor.
   *
   * Ao religar, a próxima data passa a ser a primeira que ainda não passou.
   */
  async setActive(actor: Actor, id: string, active: boolean) {
    if (!podeGerir(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const atual = await prisma.scheduledPayment.findUnique({ where: { id } });
    if (!atual) throw new AppError('Agendamento não encontrado', 404, 'NOT_FOUND');

    if (!active) {
      return prisma.scheduledPayment.update({ where: { id }, data: { active: false } });
    }

    if (atual.remaining !== null && atual.remaining <= 0) {
      throw new AppError(
        'Este agendamento já fez todos os lançamentos. Crie um novo.',
        400,
        'ALREADY_FINISHED',
      );
    }

    const hoje = soDia(new Date());
    const fim = atual.endsOn ? soDia(atual.endsOn) : null;
    const diaPreferido = soDia(atual.startsOn).getUTCDate();

    // A primeira data que ainda NÃO passou.
    //
    // Avançar sem lançar é de propósito: religar um agendamento não é a mesma
    // coisa que recuperar atrasados. Quem o desligou durante três meses não
    // quer três descontos ao voltar a ligá-lo — quer que recomece daqui para a
    // frente.
    let proxima: Date | null = atual.nextRunOn ? soDia(atual.nextRunOn) : soDia(atual.startsOn);
    let voltas = 0;
    while (proxima && proxima.getTime() < hoje.getTime() && voltas < 1000) {
      proxima = proximaData(proxima, atual.frequency as Frequencia, diaPreferido);
      voltas += 1;
    }

    if (!proxima || (fim && proxima.getTime() > fim.getTime())) {
      throw new AppError(
        'Este agendamento já passou da data de fim. Crie um novo.',
        400,
        'ALREADY_FINISHED',
      );
    }

    return prisma.scheduledPayment.update({
      where: { id },
      data: { active: true, nextRunOn: proxima },
    });
  },

  async remove(actor: Actor, id: string) {
    if (!podeGerir(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    // Apagar a REGRA não apaga os movimentos que ela já fez: esses são
    // `balance_adjustments` com vida própria, e o saldo depende deles.
    await prisma.scheduledPayment.delete({ where: { id } });
  },
};
