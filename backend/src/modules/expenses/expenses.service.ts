// src/modules/expenses/expenses.service.ts
//
// Combustível (Prio) e portagens (Via Verde): da tabela do portal ao fecho.
//
// ─── O CAMINHO ───────────────────────────────────────────────────────────────
//
//   1. A extensão lê a tabela do portal e envia o TEXTO CRU de cada célula.
//   2. `parseRows` lê esse texto com as funções testadas do expenses.math.
//   3. `matchAll` decide de quem é cada linha.
//   4. `preview` mostra o resultado sem gravar; `ingest` grava.
//   5. O formulário do fecho pede `forSettlement` e oferece os totais.
//
// ─── PORQUE O SERVIDOR LÊ O TEXTO, E NÃO A EXTENSÃO ──────────────────────────
//
// A extensão é carregada à mão no Chrome de quem a usa. Se um portal escrever
// uma data de outra forma, corrigir na extensão obriga cada pessoa a
// reinstalá-la; corrigir aqui não obriga ninguém a nada. E as funções de
// leitura têm testes; código dentro da extensão não tem.
//
// ─── DE QUEM É CADA LINHA ────────────────────────────────────────────────────
//
// PRIO — pelo CARTÃO primeiro. Um cartão associado a um motorista vai para ele;
// associado a um veículo, vai para quem tinha o veículo no instante do
// abastecimento. Sem cartão conhecido, cai para a MATRÍCULA que a célula também
// traz.
//
// VIA VERDE — pela MATRÍCULA: quem tinha o carro no instante da portagem. É a
// consulta da Fase 1 ("quem teve este carro neste dia") a trabalhar.
//
// O que não emparelha NÃO é descartado: grava-se sem motorista e aparece na
// fila de revisão, onde se atribui à mão.

import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import { UserRole } from '../../shared/types/enums';
import { vehiclesRepository } from '../vehicles/vehicles.repository';
import { plateCandidates } from '../vehicles/assignment-lookup';
import {
  canonicalPlate, normalizeCard, splitPrioCardCell, parseMoney, parsePortalDateTime,
  settlementWeekOf, movementRangeFor, categorizeViaVerde, defaultChargeable, externalKey,
  type ExpenseSource, type ExpenseCategory,
} from './expenses.math';

type Actor = { id: string; role?: UserRole };

/** Uma linha como a extensão a envia: o texto cru de cada célula. */
export interface RawRow {
  date?: string | null;
  card?: string | null;
  plate?: string | null;
  identifier?: string | null;
  description?: string | null;
  service?: string | null;
  amount?: string | null;
  status?: string | null;
  receipt?: string | null;
  station?: string | null;
  fuel?: string | null;
}

/** Uma linha já lida. */
export interface ParsedRow {
  index: number;
  source: ExpenseSource;
  category: ExpenseCategory;
  occurredAt: Date;
  day: string;
  settlementWeek: string;
  plate: string | null;
  cardNumber: string | null;
  identifier: string | null;
  receipt: string | null;
  description: string;
  amount: number;
  statusText: string | null;
  chargeable: boolean;
  externalKey: string;
}

export interface MatchedRow extends ParsedRow {
  userId: string | null;
  userName: string | null;
  vehicleId: string | null;
  matchedBy: 'CARD' | 'PLATE' | null;
}

export interface InvalidRow {
  index: number;
  reason: string;
  raw: RawRow;
}

export interface IngestSummary {
  source: ExpenseSource;
  total: number;
  matched: number;
  unmatched: number;
  invalid: InvalidRow[];
  inserted?: number;
  duplicates?: number;
  chargeableTotal: number;
  rows: MatchedRow[];
}

const MAX_LINHAS = 2000;

function soStaff(actor: Actor) {
  if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.MANAGER) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
}

function dia(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const expensesService = {
  // ─── LEITURA ───────────────────────────────────────────────────────────────

  /**
   * Lê as linhas cruas. As que não se conseguem ler são DEVOLVIDAS com o
   * motivo, nunca descartadas em silêncio — uma portagem que desaparece sem
   * aviso é uma portagem que a empresa paga e ninguém desconta.
   */
  parseRows(source: ExpenseSource, raws: RawRow[]): { rows: ParsedRow[]; invalid: InvalidRow[] } {
    const rows: ParsedRow[] = [];
    const invalid: InvalidRow[] = [];

    raws.forEach((raw, index) => {
      const amount = parseMoney(raw.amount);
      if (amount === null) {
        invalid.push({ index, reason: 'Valor ilegível', raw });
        return;
      }

      if (source === 'PRIO') {
        const quando = parsePortalDateTime(raw.date);
        if (!quando) { invalid.push({ index, reason: 'Data ilegível', raw }); return; }

        const celula = splitPrioCardCell(raw.card ?? '');
        const plate = canonicalPlate(raw.plate) ?? celula.plate;
        // Da célula SEPARADA, nunca da célula inteira. A Prio mostra o cartão e a
        // matrícula na mesma caixa — "7824000011112222 / XY-27-QZ" — e o
        // normalizeCard guarda só os dígitos: aplicado à célula inteira colava os
        // algarismos da matrícula ao fim do número, e nenhum cartão emparelhava.
        const card = celula.card;
        const statusText = raw.status?.trim() || null;
        const description = [raw.station, raw.fuel].map((x) => x?.trim()).filter(Boolean).join(' · ')
          || 'Abastecimento';

        rows.push({
          index, source, category: 'FUEL',
          occurredAt: quando.occurredAt, day: quando.day,
          settlementWeek: settlementWeekOf(source, quando.day),
          plate, cardNumber: card, identifier: null,
          receipt: raw.receipt?.trim() || null,
          description, amount, statusText,
          chargeable: defaultChargeable('FUEL', statusText),
          externalKey: externalKey({
            source, occurredAt: quando.occurredAt, amount,
            receipt: raw.receipt, card, plate,
          }),
        });
        return;
      }

      // VIA VERDE — a data vem DENTRO da descrição:
      //   "Pontinha >> Belas PV 2026-09-22 09:23:20 > 2026-09-22 09:26:23"
      const texto = (raw.description ?? '').replace(/\s+/g, ' ').trim();
      const quando = parsePortalDateTime(raw.date) ?? parsePortalDateTime(texto);
      if (!quando) { invalid.push({ index, reason: 'Data ilegível', raw }); return; }

      // O trajeto é o que vem antes da primeira data.
      const corte = texto.search(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/);
      const description = (corte > 0 ? texto.slice(0, corte) : texto).trim() || 'Movimento Via Verde';
      const category = categorizeViaVerde(description, raw.service);
      const plate = canonicalPlate(raw.plate);
      const identifier = raw.identifier?.replace(/\s+/g, '').trim() || null;
      const statusText = raw.status?.trim() || null;

      rows.push({
        index, source, category,
        occurredAt: quando.occurredAt, day: quando.day,
        settlementWeek: settlementWeekOf(source, quando.day),
        plate, cardNumber: null, identifier, receipt: null,
        description, amount, statusText,
        chargeable: defaultChargeable(category, statusText),
        externalKey: externalKey({
          source, occurredAt: quando.occurredAt, amount, identifier, plate, description,
        }),
      });
    });

    return { rows, invalid };
  },

  // ─── EMPARELHAMENTO ────────────────────────────────────────────────────────

  /**
   * De quem é cada linha.
   *
   * Com caches por chamada: uma tabela de 500 linhas da mesma frota tem poucas
   * matrículas e poucos cartões distintos, e ir à base 1000 vezes para as mesmas
   * vinte respostas era o tipo de lentidão que só aparece no dia da reunião.
   */
  async matchAll(rows: ParsedRow[]): Promise<MatchedRow[]> {
    const cartoes = await prisma.fuelCard.findMany({
      where: { active: true },
      select: { number: true, provider: true, userId: true, vehicleId: true },
    });
    const porCartao = new Map<string, { userId: string | null; vehicleId: string | null }>(
      cartoes.map((c: { provider: string; number: string; userId: string | null; vehicleId: string | null }) =>
        [`${c.provider}|${c.number}`, { userId: c.userId, vehicleId: c.vehicleId }]),
    );

    const veiculoPorMatricula = new Map<string, string | null>();
    // userId pode ser nulo: a atribuição sobrevive ao motorista apagado (SetNull).
    // Nesse caso a linha fica por emparelhar, que é o certo — não há a quem
    // descontar, e atribuí-la a outro seria pior.
    const atribuicoes = new Map<string, Array<{ userId: string | null; startedAt: Date; endedAt: Date | null }>>();

    const veiculoDe = async (plate: string): Promise<string | null> => {
      if (!veiculoPorMatricula.has(plate)) {
        const v = await vehiclesRepository.findByAnyPlate(plateCandidates(plate));
        veiculoPorMatricula.set(plate, v?.id ?? null);
      }
      return veiculoPorMatricula.get(plate) ?? null;
    };

    // Quem tinha o veículo no instante — intervalo semiaberto [início, fim).
    const condutorEm = async (vehicleId: string, t: Date): Promise<string | null> => {
      if (!atribuicoes.has(vehicleId)) {
        const lista = await prisma.vehicleAssignment.findMany({
          where: { vehicleId },
          select: { userId: true, startedAt: true, endedAt: true },
          orderBy: { startedAt: 'desc' },
        });
        atribuicoes.set(vehicleId, lista);
      }
      const a = atribuicoes.get(vehicleId)!.find(
        (x) => x.startedAt <= t && (x.endedAt === null || x.endedAt > t),
      );
      return a?.userId ?? null;
    };

    const resultado: MatchedRow[] = [];
    for (const r of rows) {
      let userId: string | null = null;
      let vehicleId: string | null = null;
      let matchedBy: MatchedRow['matchedBy'] = null;

      // 1. O cartão. Decisão do cliente: o cartão vai com o motorista.
      if (r.cardNumber) {
        const c = porCartao.get(`${r.source}|${r.cardNumber}`);
        if (c?.userId) { userId = c.userId; matchedBy = 'CARD'; }
        else if (c?.vehicleId) {
          vehicleId = c.vehicleId;
          userId = await condutorEm(c.vehicleId, r.occurredAt);
          if (userId) matchedBy = 'CARD';
        }
      }

      // 2. A matrícula, e quem tinha o carro nesse instante.
      if (!userId && r.plate) {
        vehicleId = vehicleId ?? await veiculoDe(r.plate);
        if (vehicleId) {
          userId = await condutorEm(vehicleId, r.occurredAt);
          if (userId) matchedBy = 'PLATE';
        }
      }

      resultado.push({ ...r, userId, userName: null, vehicleId, matchedBy });
    }

    // Os nomes, numa consulta só, para a pré-visualização ser legível.
    const ids = [...new Set(resultado.map((r) => r.userId).filter((x): x is string => !!x))];
    if (ids.length) {
      const nomes = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      const porId = new Map<string, string>(nomes.map((u: { id: string; name: string }) => [u.id, u.name]));
      for (const r of resultado) if (r.userId) r.userName = porId.get(r.userId) ?? null;
    }

    return resultado;
  },

  // ─── PRÉ-VISUALIZAR E IMPORTAR ─────────────────────────────────────────────

  async preview(actor: Actor, source: ExpenseSource, raws: RawRow[]): Promise<IngestSummary> {
    soStaff(actor);
    this.limite(raws);
    const { rows, invalid } = this.parseRows(source, raws);
    const matched = await this.matchAll(rows);
    return this.resumo(source, matched, invalid);
  },

  /**
   * Grava. Reenviar a mesma tabela NÃO duplica: a chave (fonte, externalKey) é
   * única na base, e as repetidas são contadas e devolvidas.
   */
  async ingest(actor: Actor, source: ExpenseSource, raws: RawRow[]): Promise<IngestSummary> {
    soStaff(actor);
    this.limite(raws);
    const { rows, invalid } = this.parseRows(source, raws);
    const matched = await this.matchAll(rows);

    const { count } = await prisma.expenseMovement.createMany({
      data: matched.map((r) => ({
        source: r.source,
        category: r.category,
        occurredAt: r.occurredAt,
        day: dia(r.day),
        settlementWeek: dia(r.settlementWeek),
        plate: r.plate,
        cardNumber: r.cardNumber,
        identifier: r.identifier,
        receipt: r.receipt,
        description: r.description,
        amount: r.amount,
        statusText: r.statusText,
        chargeable: r.chargeable,
        userId: r.userId,
        matchedBy: r.matchedBy,
        vehicleId: r.vehicleId,
        externalKey: r.externalKey,
        importedById: actor.id,
      })),
      skipDuplicates: true,
    });

    const s = this.resumo(source, matched, invalid);
    s.inserted = count;
    s.duplicates = matched.length - count;

    logger.info(
      `[expenses] ${actor.id} importou ${matched.length} linhas de ${source}: ` +
      `${count} novas, ${s.duplicates} repetidas, ${s.unmatched} por emparelhar, ${invalid.length} ilegíveis`,
    );
    return s;
  },

  limite(raws: RawRow[]) {
    if (raws.length === 0) throw new AppError('Nenhuma linha recebida.', 400, 'EMPTY');
    if (raws.length > MAX_LINHAS) {
      throw new AppError(`Máximo de ${MAX_LINHAS} linhas por envio.`, 413, 'TOO_MANY_ROWS');
    }
  },

  resumo(source: ExpenseSource, rows: MatchedRow[], invalid: InvalidRow[]): IngestSummary {
    const matched = rows.filter((r) => r.userId).length;
    return {
      source,
      total: rows.length,
      matched,
      unmatched: rows.length - matched,
      invalid,
      chargeableTotal: cents(rows.filter((r) => r.chargeable).reduce((a, r) => a + r.amount, 0)),
      rows,
    };
  },

  // ─── PARA O FORMULÁRIO DO FECHO ────────────────────────────────────────────

  /**
   * As despesas de um motorista para o fecho de uma semana: a Prio dessa
   * semana e a Via Verde da ANTERIOR — já resolvido pela `settlementWeek`
   * gravada na importação.
   *
   * Devolve TODAS as linhas, descontáveis e não, para o administrador ver o que
   * ficou de fora e porquê. Os totais só somam as descontáveis.
   */
  async forSettlement(actor: Actor, userId: string, weekStart: string) {
    soStaff(actor);
    const semana = dia(weekStart);

    const linhas = await prisma.expenseMovement.findMany({
      where: { userId, settlementWeek: semana },
      orderBy: { occurredAt: 'asc' },
    });

    const bloco = (source: ExpenseSource) => {
      const doTipo = linhas.filter((l) => l.source === source);
      return {
        range: movementRangeFor(source, weekStart),
        movements: doTipo.map((l) => ({
          id: l.id,
          category: l.category,
          occurredAt: l.occurredAt.toISOString(),
          description: l.description,
          plate: l.plate,
          amount: Number(l.amount),
          statusText: l.statusText,
          chargeable: l.chargeable,
          matchedBy: l.matchedBy,
        })),
        chargeableTotal: cents(doTipo.filter((l) => l.chargeable).reduce((a, l) => a + Number(l.amount), 0)),
      };
    };

    return { weekStart, fuel: bloco('PRIO'), tolls: bloco('VIA_VERDE') };
  },

  // ─── REVISÃO ───────────────────────────────────────────────────────────────

  /** O que ficou por emparelhar: atribui-se à mão. */
  async unmatched(actor: Actor) {
    soStaff(actor);
    return prisma.expenseMovement.findMany({
      where: { userId: null },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
  },

  /**
   * Atribuir um motorista à mão, ou mudar o "descontar ou não".
   *
   * Recusa mexer num movimento cujo fecho já foi REGISTADO: esse valor já foi
   * creditado ou descontado, e mudá-lo aqui desalinhava o comprovativo do
   * dinheiro que de facto saiu.
   */
  async update(actor: Actor, id: string, input: { userId?: string | null; chargeable?: boolean }) {
    soStaff(actor);
    const m = await prisma.expenseMovement.findUnique({ where: { id } });
    if (!m) throw new AppError('Movimento não encontrado.', 404, 'NOT_FOUND');

    if (m.userId) {
      const fecho = await prisma.weeklySettlement.findFirst({
        where: { userId: m.userId, weekStart: m.settlementWeek, status: 'REGISTERED' },
        select: { id: true },
      });
      if (fecho) {
        throw new AppError(
          'O fecho desta semana já foi registado. Cancele-o antes de mudar este movimento.',
          400, 'SETTLEMENT_REGISTERED',
        );
      }
    }

    if (input.userId) {
      const u = await prisma.user.findUnique({ where: { id: input.userId }, select: { role: true } });
      if (!u || u.role !== UserRole.DRIVER) {
        throw new AppError('Só se atribui a um motorista.', 400, 'NOT_A_DRIVER');
      }
    }

    return prisma.expenseMovement.update({
      where: { id },
      data: {
        ...(input.userId !== undefined ? { userId: input.userId, matchedBy: input.userId ? 'MANUAL' : null } : {}),
        ...(input.chargeable !== undefined ? { chargeable: input.chargeable } : {}),
      },
    });
  },

  // ─── CARTÕES ───────────────────────────────────────────────────────────────

  async listCards(actor: Actor, filtro: { userId?: string; vehicleId?: string }) {
    soStaff(actor);
    return prisma.fuelCard.findMany({
      where: {
        ...(filtro.userId ? { userId: filtro.userId } : {}),
        ...(filtro.vehicleId ? { vehicleId: filtro.vehicleId } : {}),
      },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
  },

  /**
   * Um cartão pertence a um motorista OU a um veículo. A base recusa os dois
   * (CHECK na migração); aqui recusa-se antes, com uma mensagem que se lê.
   */
  async saveCard(actor: Actor, input: {
    id?: string; number: string; label?: string | null;
    userId?: string | null; vehicleId?: string | null; active?: boolean;
  }) {
    soStaff(actor);
    const number = normalizeCard(input.number);
    if (!number) throw new AppError('Número de cartão inválido.', 400, 'INVALID_CARD');
    if (input.userId && input.vehicleId) {
      throw new AppError('O cartão pertence a um motorista OU a um veículo, não aos dois.', 400, 'CARD_TWO_OWNERS');
    }

    const data = {
      number,
      label: input.label ?? null,
      userId: input.userId ?? null,
      vehicleId: input.vehicleId ?? null,
      ...(input.active !== undefined ? { active: input.active } : {}),
    };

    try {
      return input.id
        ? await prisma.fuelCard.update({ where: { id: input.id }, data })
        : await prisma.fuelCard.create({ data: { ...data, provider: 'PRIO' } });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new AppError('Esse cartão já está registado.', 409, 'CARD_EXISTS');
      }
      throw err;
    }
  },

  /**
   * Apagar um cartão.
   *
   * Seguro: os movimentos guardam o NÚMERO e o motorista a quem ficaram, não
   * uma ligação ao cartão. O que já foi importado fica como estava; os envios
   * seguintes deixam de emparelhar por este número e caem para a matrícula.
   *
   * Existe ao lado do "desativar" para o caso do número mal escrito: o número
   * não se pode repetir, e um cartão errado só desativado ocupava-o para
   * sempre.
   */
  async deleteCard(actor: Actor, id: string) {
    soStaff(actor);
    const c = await prisma.fuelCard.findUnique({ where: { id } });
    if (!c) throw new AppError('Cartão não encontrado.', 404, 'NOT_FOUND');
    await prisma.fuelCard.delete({ where: { id } });
    logger.info(`[expenses] ${actor.id} apagou o cartão ${c.provider} ${c.number}`);
  },
};
