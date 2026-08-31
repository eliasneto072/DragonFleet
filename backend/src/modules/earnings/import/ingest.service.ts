// src/modules/earnings/import/ingest.service.ts
//
// Receção dos valores recolhidos pela extensão de browser.
//
// ─── O QUE MUDA FACE À IMPORTAÇÃO DE CSV ─────────────────────────────────────
//
// A importação de CSV é do motorista para si próprio: ele carrega o extrato e
// tudo fica na conta dele. Aqui é o administrador a enviar a folha da FROTA
// INTEIRA, lida do portal que tem aberto. Cada linha traz um nome, e é esse
// nome que decide a quem pertence o valor.
//
// Por isso este serviço existe em vez de se alargar o outro: são dois fluxos
// com donos diferentes, permissões diferentes e modos de falha diferentes. O
// que partilham — a criação dos lançamentos e a conferência posterior — é a
// tela de revisão, que é a mesma porta de entrada para as duas origens.
//
// ─── A EXTENSÃO NÃO CRIA DINHEIRO ────────────────────────────────────────────
//
// Tudo o que entra por aqui nasce PENDING e não mexe em saldo nenhum. O
// dinheiro continua a entrar só pelo fecho semanal, que é um ato do
// administrador depois de conferir. O que isto elimina é a transcrição manual,
// não a conferência.
//
// ─── NADA ENTRA PELA METADE ──────────────────────────────────────────────────
//
// Um envio de trinta motoristas ou entra todo ou não entra nada. Isso é
// garantido pelo `createMany`, que é uma única instrução e portanto atómica no
// Postgres — não é preciso transação à volta dela, e envolvê-la numa daria a
// impressão de haver ali uma garantia extra que não existe.
//
// A regra a manter: se um dia isto escrever em mais do que uma tabela, aí sim
// passa a precisar de transação. Metade dos lançamentos criados, com a extensão
// a comunicar erro e o administrador a tentar outra vez, produzia duplicados
// silenciosos naquela metade.

import { prisma } from '../../../config/prisma';
import { AppError } from '../../../shared/errors/AppError';
import { EarningPlatform, UserRole } from '../../../shared/types/enums';
import { logger } from '../../../shared/utils/logger';
import { matchDriver, type MatchCandidate } from './name-matching';
import { sameWeek, suggestWeek, toDayString } from '../../../shared/utils/week';

export interface IngestRow {
  /** O nome como o portal o escreve. */
  driverName: string;
  amount: number;
}

export interface IngestInput {
  platform: EarningPlatform;
  /** Início do período reportado pelo portal, em AAAA-MM-DD. */
  periodStart: string;
  /** Fim do período, inclusive. */
  periodEnd: string;
  rows: IngestRow[];
}

export interface IngestResult {
  inserted: number;
  skippedDuplicates: number;
  totalAmount: number;
  /** Linhas que não deram um motorista único. Vão para a tela de conferência. */
  unmatched: {
    driverName: string;
    amount: number;
    reason: 'not_found' | 'ambiguous';
    candidates?: MatchCandidate[];
  }[];
}

/** Limite de linhas por envio. A frota do cliente é de dezenas, não de milhares. */
const MAX_ROWS = 500;

class IngestService {
  /**
   * Recebe uma folha lida do portal e cria os lançamentos correspondentes.
   *
   * Devolve o que entrou e o que não emparelhou. O que não emparelha NÃO é
   * descartado em silêncio: volta na resposta para a extensão o mostrar e para
   * alguém decidir. Uma linha perdida sem aviso é uma semana de trabalho de um
   * motorista que desaparece.
   */
  async ingest(actor: { id: string; role?: UserRole }, input: IngestInput): Promise<IngestResult> {
    // Só gestão. Um motorista não envia a folha da frota — e se pudesse,
    // escrevia os ganhos de toda a gente.
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    if (input.rows.length === 0) {
      throw new AppError('Nenhuma linha recebida.', 400, 'INGEST_EMPTY');
    }
    if (input.rows.length > MAX_ROWS) {
      throw new AppError(
        `Demasiadas linhas (${input.rows.length}). O máximo por envio é ${MAX_ROWS}.`,
        400,
        'INGEST_TOO_LARGE',
      );
    }

    const { periodStart, periodEnd } = this.parsePeriod(input);
    // O lançamento fica carimbado no fim do período, que é quando ele fechou.
    const date = periodEnd;

    // Motoristas ativos apenas: um inativo não devia receber lançamentos novos,
    // e mantê-lo na lista de candidatos só serve para gerar ambiguidades.
    const drivers = await prisma.user.findMany({
      where: { role: UserRole.DRIVER, status: 'ACTIVE' },
      select: { id: true, name: true },
    });

    // Lançamentos já existentes para este dia e plataforma. Reenviar a mesma
    // folha — porque a extensão foi clicada duas vezes, ou porque a primeira
    // resposta se perdeu — não pode duplicar valores.
    const existentes = await prisma.earning.findMany({
      where: { date, platform: input.platform },
      select: { userId: true, amount: true },
    });
    const jaLa = new Set(existentes.map((e) => `${e.userId}|${Number(e.amount).toFixed(2)}`));

    const paraInserir: {
      userId: string; amount: number; date: Date;
      platform: EarningPlatform; notes: string;
    }[] = [];
    const unmatched: IngestResult['unmatched'] = [];
    let duplicados = 0;

    for (const row of input.rows) {
      const valor = Number(row.amount);
      if (isNaN(valor)) {
        unmatched.push({ driverName: row.driverName, amount: 0, reason: 'not_found' });
        continue;
      }

      const match = matchDriver(row.driverName, drivers);

      if (match.status !== 'matched') {
        unmatched.push({
          driverName: row.driverName,
          amount: valor,
          reason: match.status,
          candidates: match.status === 'ambiguous' ? match.candidates : undefined,
        });
        continue;
      }

      const chave = `${match.userId}|${valor.toFixed(2)}`;
      if (jaLa.has(chave)) { duplicados++; continue; }
      jaLa.add(chave);

      paraInserir.push({
        userId: match.userId,
        amount: valor,
        date,
        platform: input.platform,
        // O período fica escrito, e não só implícito na data. Sem isto, quem
        // confere vê um valor carimbado num domingo sem saber quantos dias ele
        // cobre — e um total de dois dias é indistinguível de um de sete.
        notes: `Recolhido do portal · ${toDayString(periodStart)} a ${toDayString(periodEnd)}`,
      });
    }

    if (paraInserir.length > 0) {
      // Uma instrução só: ou entram todas as linhas ou não entra nenhuma.
      await prisma.earning.createMany({ data: paraInserir });
    }

    logger.info(
      `[ingest] ${actor.id} enviou ${input.rows.length} linhas de ${input.platform} ` +
      `(${toDayString(periodStart)} a ${toDayString(periodEnd)}): ${paraInserir.length} criadas, ` +
      `${duplicados} repetidas, ${unmatched.length} por emparelhar`,
    );

    return {
      inserted: paraInserir.length,
      skippedDuplicates: duplicados,
      totalAmount: paraInserir.reduce((s, r) => s + r.amount, 0),
      unmatched,
    };
  }

  /**
   * Valida o período reportado pelo portal.
   *
   * RECUSA períodos que atravessem duas semanas de fecho, e essa é a decisão
   * que interessa neste ficheiro.
   *
   * A vista por omissão da Bolt — "Last 7 days" — é uma janela deslizante. Na
   * captura que o cliente enviou, cobria 11 a 17 de agosto: de terça a segunda,
   * seis dias numa semana de fecho e um noutra. Aceitar esse total obrigava a
   * escolher uma das duas semanas, e a escolhida ficava com um dia que não lhe
   * pertence enquanto a outra ficava a menos.
   *
   * O erro seria invisível — o número entra no fecho e nada indica que traz
   * dias de fora. Por isso recusa, e a mensagem diz qual o intervalo a escolher
   * no portal: quem lê resolve num clique em vez de ficar a pensar no que fez
   * de errado.
   */
  private parsePeriod(input: IngestInput): { periodStart: Date; periodEnd: Date } {
    const periodStart = new Date(`${input.periodStart}T00:00:00.000Z`);
    const periodEnd = new Date(`${input.periodEnd}T00:00:00.000Z`);

    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      throw new AppError('Datas do período inválidas.', 400, 'INVALID_PERIOD');
    }
    if (periodStart > periodEnd) {
      throw new AppError('O início do período é posterior ao fim.', 400, 'INVALID_PERIOD');
    }

    if (!sameWeek(periodStart, periodEnd)) {
      const sugestao = suggestWeek(periodEnd);
      throw new AppError(
        `O período de ${input.periodStart} a ${input.periodEnd} atravessa duas semanas de ` +
        `fecho e não pode ser atribuído a nenhuma delas. No portal, escolha ` +
        `${sugestao.from} a ${sugestao.to}.`,
        400,
        'PERIOD_SPANS_WEEKS',
      );
    }

    return { periodStart, periodEnd };
  }

  /**
   * Simula sem gravar.
   *
   * A extensão chama isto primeiro e mostra ao administrador o que vai entrar e
   * o que não emparelhou. Sem esta passagem, ele só descobria os nomes por
   * emparelhar depois de os lançamentos já estarem criados — e ficaria com
   * metade da semana na aplicação e a outra metade por explicar.
   */
  async preview(actor: { id: string; role?: UserRole }, input: IngestInput): Promise<IngestResult> {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    // Valida o período aqui também. Se só o ingest o recusasse, a
    // pré-visualização mostrava tudo verde e o erro aparecia ao gravar — o
    // pior momento para descobrir que o intervalo estava mal escolhido.
    this.parsePeriod(input);

    const drivers = await prisma.user.findMany({
      where: { role: UserRole.DRIVER, status: 'ACTIVE' },
      select: { id: true, name: true },
    });

    const unmatched: IngestResult['unmatched'] = [];
    let emparelhadas = 0;
    let total = 0;

    for (const row of input.rows) {
      const match = matchDriver(row.driverName, drivers);
      if (match.status === 'matched') {
        emparelhadas++;
        total += Number(row.amount) || 0;
      } else {
        unmatched.push({
          driverName: row.driverName,
          amount: Number(row.amount) || 0,
          reason: match.status,
          candidates: match.status === 'ambiguous' ? match.candidates : undefined,
        });
      }
    }

    return { inserted: emparelhadas, skippedDuplicates: 0, totalAmount: total, unmatched };
  }
}

export const ingestService = new IngestService();
