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
import { primeiraData, proximaData, soDia, porMes, type Frequencia } from './recorrencia';
import { avisar } from '../../shared/services/avisos';

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

  /**
   * O total por categoria.
   *
   * ─── DOIS NÚMEROS, E NÃO UM ─────────────────────────────────────────────
   *
   * `gasto` é o que JÁ SAIU: a soma dos lançamentos reais, cada um com o valor
   * que tinha no dia em que saiu. Vem da ligação `scheduledPaymentId`, e não de
   * `runCount × amount` — essa conta passa a mentir no instante em que alguém
   * edita o valor de um agendamento, e editar é precisamente o que agora se
   * pode fazer.
   *
   * `porMes` é o que está COMPROMETIDO daqui para a frente, com as frequências
   * todas postas na mesma unidade. Sem isso, um semanal de 10 € e um mensal de
   * 40 € aparecem lado a lado como 10 e 40, e lê-se ao contrário da verdade.
   *
   * Os dois juntos respondem às duas perguntas que se fazem a esta tela: «o que
   * é que isto me custou» e «o que é que isto me vai custar».
   *
   * ─── OS DÉBITOS E OS CRÉDITOS NÃO SE SOMAM ──────────────────────────────
   *
   * Um agendamento pode ser crédito (um subsídio) ou débito (um seguro).
   * Somá-los dava um líquido que não é o gasto de ninguém. Vão em colunas
   * separadas e quem lê decide.
   */
  async resumoPorCategoria(
    actor: Actor,
    periodo: { de?: string | null; ate?: string | null } = {},
  ) {
    if (!podeGerir(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const de = periodo.de ? paraDia(periodo.de, 'de') : null;
    const ate = periodo.ate ? paraDia(periodo.ate, 'ate') : null;

    // ── O que já saiu ────────────────────────────────────────────────────
    //
    // Lido pelos lançamentos, com o agendamento e a categoria atrás. O
    // `isNot: null` deixa de fora os ajustes da administração, que não têm
    // agendamento nenhum e não pertencem a esta conta.
    const lancamentos = await prisma.balanceAdjustment.findMany({
      where: {
        scheduledPaymentId: { not: null },
        ...(de || ate
          ? { createdAt: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } }
          : {}),
      },
      select: {
        amount: true,
        type: true,
        scheduledPayment: {
          select: { categoryId: true, category: { select: { label: true } } },
        },
      },
    });

    // ── O que está comprometido ──────────────────────────────────────────
    //
    // Só os ACTIVOS: um agendamento parado não custa nada no mês que vem, e
    // mantê-lo na coluna fazia o compromisso parecer maior do que é.
    const activos = await prisma.scheduledPayment.findMany({
      where: { active: true },
      select: {
        amount: true, type: true, frequency: true, categoryId: true,
        category: { select: { label: true } },
      },
    });

    type Linha = {
      categoriaId: string | null;
      categoria: string;
      gastoDebito: number;
      gastoCredito: number;
      lancamentos: number;
      porMesDebito: number;
      porMesCredito: number;
      agendamentosActivos: number;
    };

    const mapa = new Map<string, Linha>();
    // Em cêntimos enquanto se soma: um seguro semanal somado cinquenta vezes em
    // vírgula flutuante acaba a dar 779,9999999 onde devia dar 780.
    const centimos = new Map<string, { gd: number; gc: number; md: number; mc: number }>();

    const chave = (id: string | null) => id ?? 'sem-categoria';
    const tocar = (id: string | null, label: string | null | undefined) => {
      const k = chave(id);
      if (!mapa.has(k)) {
        mapa.set(k, {
          categoriaId: id,
          // Um agendamento sem categoria é comum e não é um erro — escrever
          // "Sem categoria" é melhor do que uma linha com o nome em branco.
          categoria: label ?? 'Sem categoria',
          gastoDebito: 0, gastoCredito: 0, lancamentos: 0,
          porMesDebito: 0, porMesCredito: 0, agendamentosActivos: 0,
        });
        centimos.set(k, { gd: 0, gc: 0, md: 0, mc: 0 });
      }
      return { linha: mapa.get(k)!, cent: centimos.get(k)! };
    };

    for (const l of lancamentos) {
      const sp = l.scheduledPayment;
      const { linha, cent } = tocar(sp?.categoryId ?? null, sp?.category?.label);
      const v = Math.round(Number(l.amount) * 100);
      if (l.type === AdjustmentType.DEBIT) cent.gd += v; else cent.gc += v;
      linha.lancamentos += 1;
    }

    for (const a of activos) {
      const { linha, cent } = tocar(a.categoryId, a.category?.label);
      const v = Math.round(porMes(Number(a.amount), a.frequency as Frequencia) * 100);
      if (a.type === AdjustmentType.DEBIT) cent.md += v; else cent.mc += v;
      linha.agendamentosActivos += 1;
    }

    const linhas = [...mapa.entries()].map(([k, linha]) => {
      const c = centimos.get(k)!;
      return {
        ...linha,
        gastoDebito: c.gd / 100,
        gastoCredito: c.gc / 100,
        porMesDebito: c.md / 100,
        porMesCredito: c.mc / 100,
      };
    });

    // As que mais custam primeiro: é a ordem por que se olha para uma lista
    // destas, e poupa o clique de ordenar.
    linhas.sort((a, b) => b.gastoDebito - a.gastoDebito || b.porMesDebito - a.porMesDebito);

    const somar = (f: (l: typeof linhas[number]) => number) =>
      Math.round(linhas.reduce((s, l) => s + f(l) * 100, 0)) / 100;

    return {
      periodo: { de: periodo.de ?? null, ate: periodo.ate ?? null },
      categorias: linhas,
      total: {
        gastoDebito: somar((l) => l.gastoDebito),
        gastoCredito: somar((l) => l.gastoCredito),
        porMesDebito: somar((l) => l.porMesDebito),
        porMesCredito: somar((l) => l.porMesCredito),
        lancamentos: linhas.reduce((s, l) => s + l.lancamentos, 0),
      },
    };
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
   * Editar um agendamento, sem apagar e refazer.
   *
   * ─── O QUE ISTO NUNCA TOCA ──────────────────────────────────────────────
   *
   * O que já foi lançado. Os ajustes que o robô criou são movimentos no saldo
   * do motorista — dinheiro que já entrou ou saiu — e editar o agendamento não
   * os reescreve. Um seguro que foi 15 € em Janeiro continua a ser 15 € em
   * Janeiro depois de o valor passar a 25 €.
   *
   * Não é uma precaução: é o que torna o total por categoria verdadeiro. Ver
   * `resumoPorCategoria`, que soma os lançamentos reais exactamente por isto.
   *
   * ─── PORQUE É QUE A DATA DE INÍCIO NÃO SE MUDA DEPOIS DE CORRER ─────────
   *
   * Porque deixa de ser uma intenção e passa a ser um facto: a série começou
   * naquele dia, e há movimentos no extrato a prová-lo. Mudá-la punha o
   * registo a dizer que a série começou numa data em que não começou.
   *
   * Pior do que isso, seria perigoso: recuar a data faria o robô ver datas
   * vencidas que já tinham sido lançadas e lançá-las outra vez. Dois descontos
   * iguais no saldo de alguém, por causa de uma correcção.
   *
   * O engano que se quer corrigir — o valor, a descrição, a categoria — esse
   * corrige-se sempre, tenha corrido ou não.
   *
   * ─── PORQUE É QUE MUDAR A FREQUÊNCIA NÃO MEXE NA PRÓXIMA DATA ───────────
   *
   * Porque a próxima já estava marcada. Passar de mensal a semanal não deve
   * antecipar o lançamento que já estava à espera do dia 1 — deve mudar o
   * ritmo DEPOIS dele. É o que menos surpreende quem está a olhar para a
   * coluna «próximo lançamento» enquanto edita.
   */
  async update(
    actor: Actor,
    id: string,
    entrada: Partial<Omit<EntradaAgendamento, 'userId'>>,
  ) {
    if (!podeGerir(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const actual = await prisma.scheduledPayment.findFirst({
      where: { id },
      select: {
        id: true, userId: true, amount: true, description: true, type: true,
        categoryId: true, frequency: true, startsOn: true, endsOn: true,
        remaining: true, runCount: true, nextRunOn: true, active: true,
      },
    });
    if (!actual) throw new AppError('Agendamento não encontrado.', 404, 'NOT_FOUND');

    const dados: Record<string, unknown> = {};

    if (entrada.amount !== undefined) {
      if (!(entrada.amount > 0)) {
        throw new AppError('O valor deve ser maior que zero.', 400, 'INVALID_AMOUNT');
      }
      dados.amount = entrada.amount;
    }

    if (entrada.description !== undefined) {
      const d = entrada.description.trim();
      if (!d) {
        throw new AppError(
          'Escreva a descrição — é o que o motorista vai ler.', 400, 'EMPTY_DESCRIPTION',
        );
      }
      dados.description = d;
    }

    if (entrada.categoryId !== undefined) dados.categoryId = entrada.categoryId ?? null;
    if (entrada.type !== undefined) dados.type = entrada.type;
    if (entrada.frequency !== undefined) dados.frequency = entrada.frequency;

    // ── A data de início ────────────────────────────────────────────────
    const novoInicio = entrada.startsOn !== undefined
      ? paraDia(entrada.startsOn, 'startsOn')
      : null;

    if (novoInicio && novoInicio.getTime() !== actual.startsOn.getTime()) {
      if (actual.runCount > 0) {
        throw new AppError(
          'Este agendamento já fez lançamentos — a data de início faz parte do '
          + 'histórico e não se altera. Pode mudar o valor, a descrição, a '
          + 'categoria, a frequência e o fim.',
          409,
          'ALREADY_RAN',
        );
      }

      // A mesma guarda do ano trocado que o `create` faz, e pela mesma razão:
      // 2020 em vez de 2026 é um engano de teclado, e sem isto o primeiro job
      // lançava setenta descontos.
      const limite = new Date();
      limite.setUTCFullYear(limite.getUTCFullYear() - 1);
      if (novoInicio < soDia(limite)) {
        throw new AppError(
          'A data de início é de há mais de um ano. Confirme o ano antes de gravar.',
          400,
          'START_TOO_OLD',
        );
      }

      dados.startsOn = novoInicio;
      // Nunca correu: a próxima é a primeira, recalculada do início novo.
      dados.nextRunOn = primeiraData(novoInicio);
    }

    // ── O fim ───────────────────────────────────────────────────────────
    if (entrada.endsOn !== undefined) {
      const fim = entrada.endsOn ? paraDia(entrada.endsOn, 'endsOn') : null;
      const inicio = (dados.startsOn as Date | undefined) ?? actual.startsOn;
      if (fim && fim < inicio) {
        throw new AppError('A data de fim é anterior à de início.', 400, 'INVALID_RANGE');
      }
      dados.endsOn = fim;
    }

    if (entrada.remaining !== undefined) {
      if (entrada.remaining !== null && entrada.remaining < 1) {
        throw new AppError('O número de vezes tem de ser pelo menos 1.', 400, 'INVALID_COUNT');
      }
      dados.remaining = entrada.remaining;
    }

    if (Object.keys(dados).length === 0) {
      throw new AppError('Nada para alterar.', 400, 'NOTHING_TO_UPDATE');
    }

    const guardado = await prisma.scheduledPayment.update({ where: { id }, data: dados });

    logger.info(`[agendamentos] ${actor.id} editou ${id}: ${Object.keys(dados).join(', ')}`);

    // ── O motorista tem de saber ────────────────────────────────────────
    //
    // Só quando muda o que ele sente: o valor, o sentido ou o texto que vai
    // ler no extrato. Uma mudança de categoria é arrumação interna e avisá-lo
    // disso é ruído — e ruído faz as pessoas deixarem de ler os avisos.
    const sente = ['amount', 'type', 'description'].some((k) => k in dados);
    if (sente) {
      const sinal = (dados.type ?? actual.type) === AdjustmentType.CREDIT ? '+' : '−';
      const valor = Number(dados.amount ?? actual.amount);
      await avisar(actual.userId, {
        titulo: 'Pagamento agendado alterado',
        mensagem: `"${dados.description ?? actual.description}" passa a ${sinal}`
          + `${valor.toFixed(2)} €. Os lançamentos já feitos não mudam.`,
      });
    }

    return guardado;
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
