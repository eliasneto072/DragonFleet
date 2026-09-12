import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { IWithdrawalPublic } from './withdrawals.types';
import { IWithdrawalRepository } from './withdrawals.repository.interfaces';
import { CreateWithdrawalData, UpdateWithdrawalData } from './withdrawals.repository.types';
import {
  buildPageInfo, buildSearchWhere, type PageParams, type Paged,
} from '../../shared/http/pagination';

/**
 * Valor especial do filtro de sociedade: retiradas ainda sem sociedade
 * registada.
 *
 * Vive aqui e e exportado porque o `where` desta camada e o seletor da tela tem
 * de concordar no valor exato. Uma constante duplicada dos dois lados divergia
 * no dia em que alguem a mudasse num so.
 */
export const UNCLASSIFIED = '__unclassified__';

export class WithdrawalsRepository implements IWithdrawalRepository {
  private readonly publicSelect = {
    id: true,
    amount: true,
    status: true,
    notes: true,
    requestedAt: true,
    processedAt: true,
    userId: true,
    receiptUrl: true,
    receiptKey: true,
    paidToIban: true,
    paidToHolder: true,
    companyId: true,
    companyOther: true,
    companySetById: true,
    companySetAt: true,
    // O nome vem junto para as telas não terem de cruzar duas listas. Vem da
    // relação e não de uma cópia: renomear a sociedade atualiza o histórico
    // todo, porque é a mesma entidade jurídica com outro nome.
    company: { select: { name: true } },
  } as const;

  /** Achata a relação: as telas recebem companyName e não um objeto aninhado. */
  private toPublic<T extends { amount: { toNumber(): number }; company?: { name: string } | null }>(
    row: T,
  ) {
    const { company, ...rest } = row as T & { company?: { name: string } | null };
    return { ...rest, amount: row.amount.toNumber(), companyName: company?.name ?? null };
  }

  /**
   * Uma página de retiradas, com pesquisa por motorista e filtro de estado.
   *
   * A tela do Financeiro descarregava TODAS. Com um ano de operação são
   * milhares, e o histórico só tinha filtro de estado — encontrar a retirada
   * de uma pessoa obrigava a percorrer a lista com os olhos.
   *
   * A pesquisa atravessa a relação: a retirada não tem nome, o utilizador tem.
   */
  async findManyPaged(
    filter: {
      userId?: string;
      status?: string;
      terms?: string[];
      /**
       * Sociedade a que o recibo foi emitido.
       *
       * `UNCLASSIFIED` apanha as que ainda nao tem sociedade registada. Aceita
       * um valor especial em vez de um booleano separado porque na tela e UM
       * seletor: "todas", "por classificar", ou uma das sociedades.
       */
      companyId?: string;
    },
    page: PageParams,
  ): Promise<Paged<IWithdrawalPublic> & { totals: { unclassified: number } }> {
    try {
      const termos = filter.terms ?? [];

      // ─── PORQUE O FILTRO DE SOCIEDADE VEIO PARA CA ─────────────────────────
      //
      // Estava no cliente: a tela pedia uma pagina de 25 e depois filtrava-a
      // em memoria. O `pageInfo` continuava a contar as 2004 retiradas.
      //
      // O resultado era um filtro avariado. Escolher "Renas e Elfos", que tem
      // dois recibos, mostrava ZERO linhas com o pager a dizer "1-25 de 2004":
      // os dois recibos estavam em alguma das 81 paginas, e so se chegava la
      // percorrendo-as uma a uma. E como a sociedade estava na chave da
      // consulta sem ir no pedido, trocar de filtro refazia o pedido e dava a
      // impressao de que algo tinha acontecido.
      const porSociedade =
        filter.companyId === undefined
          ? {}
          : filter.companyId === UNCLASSIFIED
            ? { companySetAt: null }
            : { companyId: filter.companyId };

      const base = {
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
        ...(termos.length > 0 ? { user: buildSearchWhere(termos, ['name', 'email']) } : {}),
      };

      const where = { ...base, ...porSociedade };

      const [rows, total, semSociedade] = await Promise.all([
        prisma.withdrawal.findMany({
          where,
          select: this.publicSelect,
          orderBy: { requestedAt: 'desc' },
          skip: page.skip,
          take: page.pageSize,
        }),
        prisma.withdrawal.count({ where }),

        // ─── PORQUE ISTO E CONTADO EM SQL ────────────────────────────────────
        //
        // A tela dos Recibos Verdes contava as retiradas sem sociedade a
        // percorrer a PAGINA carregada. Com 25 por pagina, o aviso dizia
        // "22 retiradas sem sociedade registada" quando a base tinha 2000.
        //
        // E o pior tipo de numero errado: subestima trabalho pendente. Quem le
        // acha que tem vinte e dois recibos para classificar, fecha a tela, e
        // tem dois mil. Um numero que mente por defeito e pior do que numero
        // nenhum, porque parece informacao.
        //
        // Sobre `base` e nao sobre `where`: este numero e uma LISTA DE TAREFAS,
        // nao uma descricao do que esta no ecra. Filtrar por "Renas e Elfos"
        // nao faz desaparecer o trabalho de classificar as outras — se usasse
        // o `where`, o aviso dava zero e quem lesse pensava que estava feito.
        prisma.withdrawal.count({ where: { ...base, companySetAt: null } }),
      ]);

      return {
        items: rows.map((w) => this.toPublic(w) as IWithdrawalPublic),
        page: buildPageInfo(page, total),
        totals: { unclassified: semSociedade },
      };
    } catch (err) {
      logger.error('Erro ao obter retiradas paginadas', err);
      throw err;
    }
  }

  async findAll(): Promise<IWithdrawalPublic[]> {
    try {
      const withdrawals = await prisma.withdrawal.findMany({
        select: this.publicSelect,
        orderBy: { requestedAt: 'desc' },
      });

      return withdrawals.map((w) => this.toPublic(w) as IWithdrawalPublic);
    } catch (err) {
      logger.error('Erro ao obter retiradas', err);
      throw err;
    }
  }

  async findById(id: string): Promise<IWithdrawalPublic | null> {
    try {
      const withdrawal = await prisma.withdrawal.findUnique({
        where: { id },
        select: this.publicSelect,
      });

      if (!withdrawal) return null;

      return this.toPublic(withdrawal) as IWithdrawalPublic;
    } catch (err) {
      logger.error('Erro ao obter retirada por id', err);
      throw err;
    }
  }

  async findByUserId(userId: string): Promise<IWithdrawalPublic[]> {
    try {
      const withdrawals = await prisma.withdrawal.findMany({
        where: { userId },
        select: this.publicSelect,
        orderBy: { requestedAt: 'desc' },
      });

      return withdrawals.map((w) => this.toPublic(w) as IWithdrawalPublic);
    } catch (err) {
      logger.error('Erro ao obter retiradas por utilizador', err);
      throw err;
    }
  }

  async create(data: CreateWithdrawalData): Promise<IWithdrawalPublic> {
    try {
      const withdrawal = await prisma.withdrawal.create({
        data: {
          amount: data.amount,
          userId: data.userId,
          receiptUrl: data.receiptUrl,
          receiptKey: data.receiptKey,
          // status omitido — Prisma aplica PENDING por default
        },
        select: this.publicSelect,
      });

      return this.toPublic(withdrawal) as IWithdrawalPublic;
    } catch (err) {
      logger.error('Erro ao criar retirada', err);
      throw err;
    }
  }

  async update(id: string, data: UpdateWithdrawalData): Promise<IWithdrawalPublic> {
    try {
      const withdrawal = await prisma.withdrawal.update({
        where: { id },
        data: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          // processedAt preenchido automaticamente quando status muda para APPROVED, REJECTED ou PAID
          ...(data.status !== undefined ? { processedAt: new Date() } : {}),
          // IBAN congelado na aprovação — ver withdrawals.service.updateStatus.
          ...(data.paidToIban !== undefined ? { paidToIban: data.paidToIban } : {}),
          ...(data.paidToHolder !== undefined ? { paidToHolder: data.paidToHolder } : {}),
          // Classificação do recibo verde. Ver withdrawals.service.updateStatus.
          ...(data.companyId !== undefined ? { companyId: data.companyId } : {}),
          ...(data.companyOther !== undefined ? { companyOther: data.companyOther } : {}),
          ...(data.companySetById !== undefined ? { companySetById: data.companySetById } : {}),
          ...(data.companySetAt !== undefined ? { companySetAt: data.companySetAt } : {}),
        },
        select: this.publicSelect,
      });

      return this.toPublic(withdrawal) as IWithdrawalPublic;
    } catch (err) {
      logger.error('Erro ao atualizar retirada', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.withdrawal.delete({ where: { id } });
    } catch (err) {
      logger.error('Erro ao apagar retirada', err);
      throw err;
    }
  }
}

export const withdrawalsRepository = new WithdrawalsRepository();