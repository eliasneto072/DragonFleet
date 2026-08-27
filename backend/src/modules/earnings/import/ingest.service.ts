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

export interface IngestRow {
  /** O nome como o portal o escreve. */
  driverName: string;
  amount: number;
}

export interface IngestInput {
  platform: EarningPlatform;
  /** Dia a que os valores dizem respeito, em AAAA-MM-DD. */
  date: string;
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

    const date = new Date(`${input.date}T00:00:00.000Z`);
    if (isNaN(date.getTime())) {
      throw new AppError('Data inválida.', 400, 'INVALID_DATE');
    }

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

    const paraInserir: { userId: string; amount: number; date: Date; platform: EarningPlatform }[] = [];
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
      });
    }

    if (paraInserir.length > 0) {
      // Uma instrução só: ou entram todas as linhas ou não entra nenhuma.
      await prisma.earning.createMany({ data: paraInserir });
    }

    logger.info(
      `[ingest] ${actor.id} enviou ${input.rows.length} linhas de ${input.platform} ` +
      `(${input.date}): ${paraInserir.length} criadas, ${duplicados} repetidas, ` +
      `${unmatched.length} por emparelhar`,
    );

    return {
      inserted: paraInserir.length,
      skippedDuplicates: duplicados,
      totalAmount: paraInserir.reduce((s, r) => s + r.amount, 0),
      unmatched,
    };
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
