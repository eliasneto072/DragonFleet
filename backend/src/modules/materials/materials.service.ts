// src/modules/materials/materials.service.ts
//
// Inventário de material: o que há, o que se gastou, e quanto custou.
//
// ─── A PERGUNTA A QUE ISTO SERVE ────────────────────────────────────────────
//
// "Quanto é que me custa mesmo cada carro." A factura da oficina é metade da
// resposta; a outra metade é o material que saiu da nossa prateleira e não
// aparece em factura nenhuma — o óleo, os filtros, as pastilhas. Sem isso, o
// custo por carro está sempre abaixo do real, e a decisão de vender ou manter
// um carro é tomada com o número errado.
//
// ─── ONDE ESTÃO AS CONTAS ───────────────────────────────────────────────────
//
// Em `custeio.ts`, fora daqui e testado lá. Este ficheiro vai à base de dados,
// chama essas contas, e grava o movimento e o saldo na MESMA transação. Quando
// uma média ponderada aparecer aqui escrita à mão, é sinal de que foi parar ao
// sítio errado.

import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import {
  entrada, saida, ajuste, emDinheiro, emQuantidade, stockBaixo, valorDoStock,
  ErroDeStock, type Estado,
} from './custeio';

export interface Actor { id: string; role?: UserRole }

type Perfil = 'ADMIN' | 'MANAGER' | 'SUPPORT' | 'DRIVER' | 'MECHANIC' | 'INVESTOR';

const ehGestao = (p: Perfil) => p === 'ADMIN' || p === 'MANAGER';
const podeVer = (p: Perfil) => ehGestao(p) || p === 'SUPPORT';

/**
 * Quem está a pedir, e se pode estar aqui.
 *
 * ─── PORQUE É QUE ISTO RECUSA O MOTORISTA EXPLICITAMENTE ────────────────────
 *
 * Porque o `requireArea` que protege estas rotas constrange SÓ quem é da
 * equipa — um motorista atravessa-o, de propósito, porque é assim que ele vê
 * os carros dele em `/vehicles`. Aqui não há nada que lhe diga respeito: os
 * preços de compra e as margens da frota não são dele. Sem esta linha, as
 * rotas ficavam abertas a qualquer motorista autenticado.
 */
function quem(actor: Actor): Perfil {
  const p = (actor.role ?? 'DRIVER') as Perfil;
  if (!podeVer(p)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
  return p;
}

function exigirGestao(actor: Actor): Perfil {
  const p = quem(actor);
  if (!ehGestao(p)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
  return p;
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/** Um erro das contas é um erro de quem pediu, não uma avaria. */
function traduzir(erro: unknown): never {
  if (erro instanceof ErroDeStock) throw new AppError(erro.message, 400, erro.codigo);
  throw erro;
}

function materialParaPublico(m: any) {
  const qty = emQuantidade(num(m.qty));
  const avgCost = num(m.avgCost);
  const minQty = m.minQty === null || m.minQty === undefined ? null : emQuantidade(num(m.minQty));
  return {
    id: m.id,
    name: m.name,
    sku: m.sku ?? null,
    unit: m.unit,
    category: m.category ?? null,
    minQty,
    qty,
    avgCost,
    /// O valor desta linha, já feito: a tela precisa dele em todas as linhas e
    /// fazê-lo lá dava duas versões da mesma conta.
    stockValue: emDinheiro(qty * avgCost),
    low: stockBaixo(qty, minQty),
    notes: m.notes ?? null,
    active: m.active,
  };
}

function movimentoParaPublico(mv: any) {
  return {
    id: mv.id,
    materialId: mv.materialId,
    materialName: mv.material?.name ?? null,
    unit: mv.material?.unit ?? null,
    kind: mv.kind,
    qty: emQuantidade(num(mv.qty)),
    unitCost: mv.unitCost === null || mv.unitCost === undefined ? null : num(mv.unitCost),
    totalCost: mv.totalCost === null || mv.totalCost === undefined ? null : num(mv.totalCost),
    supplier: mv.supplier ?? null,
    invoiceRef: mv.invoiceRef ?? null,
    vehicleId: mv.vehicleId ?? null,
    vehiclePlate: mv.vehicle?.plate ?? null,
    bookingId: mv.bookingId ?? null,
    bookingLabel: mv.booking
      ? `${mv.booking.serviceType?.label ?? 'Marcação'} · ${mv.booking.workshop?.name ?? ''}`.trim()
      : null,
    driverId: mv.driverId ?? null,
    driverName: mv.driver?.name ?? null,
    notes: mv.notes ?? null,
    occurredAt: mv.occurredAt,
    createdByName: mv.createdBy?.name ?? null,
    createdAt: mv.createdAt,
  };
}

const incluirMovimento = {
  material: { select: { id: true, name: true, unit: true } },
  vehicle: { select: { id: true, plate: true } },
  driver: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  booking: {
    select: {
      id: true,
      serviceType: { select: { label: true } },
      workshop: { select: { name: true } },
    },
  },
} as const;

/** Um dia AAAA-MM-DD às 00:00, ou o fim do dia. */
function dia(texto: string, fim = false): Date {
  const [a, m, d] = texto.split('-').map(Number);
  return fim
    ? new Date(Date.UTC(a, m - 1, d, 23, 59, 59, 999))
    : new Date(Date.UTC(a, m - 1, d));
}

export const materialsService = {
  // ══ Materiais ════════════════════════════════════════════════════════════

  async list(actor: Actor, filtro: {
    search?: string; category?: string; includeInactive?: boolean; lowOnly?: boolean;
  } = {}) {
    quem(actor);

    const procura = filtro.search?.trim();
    const linhas = await prisma.material.findMany({
      where: {
        ...(filtro.includeInactive ? {} : { active: true }),
        ...(filtro.category ? { category: filtro.category } : {}),
        ...(procura
          ? {
            OR: [
              { name: { contains: procura, mode: 'insensitive' as const } },
              { sku: { contains: procura, mode: 'insensitive' as const } },
            ],
          }
          : {}),
      },
      orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });

    const publicos = linhas.map(materialParaPublico);
    // O filtro do stock baixo é feito aqui e não no `where` porque compara duas
    // colunas (`qty <= min_qty`), e isso em Prisma obrigava a SQL cru. A lista
    // de materiais de uma frota tem dezenas ou centenas de linhas, não
    // milhares: filtrar em memória custa menos do que manter SQL à parte.
    return filtro.lowOnly ? publicos.filter((m) => m.low) : publicos;
  },

  /** As categorias que já existem, para a tela sugerir em vez de obrigar. */
  async categories(actor: Actor) {
    quem(actor);
    const linhas = await prisma.material.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return linhas.map((l) => l.category!).filter(Boolean);
  },

  async create(actor: Actor, dados: {
    name: string; sku?: string | null; unit?: string;
    category?: string | null; minQty?: number | null; notes?: string | null;
  }) {
    exigirGestao(actor);
    const nome = dados.name.trim();
    if (!nome) throw new AppError('Escreva o nome do material.', 400, 'EMPTY_NAME');

    // Reaproveitar um desligado com o mesmo nome em vez de recusar: quem
    // escreve "Óleo 5W30" outra vez quer aquele óleo, não um erro sobre um
    // registo que não vê em lado nenhum. É o mesmo padrão dos tipos de serviço.
    const existente = await prisma.material.findUnique({ where: { name: nome } });
    if (existente) {
      if (existente.active) {
        throw new AppError('Já existe um material com este nome.', 409, 'NAME_IN_USE');
      }
      const revivido = await prisma.material.update({
        where: { id: existente.id },
        data: { active: true },
      });
      return materialParaPublico(revivido);
    }

    const criado = await prisma.material.create({
      data: {
        name: nome,
        sku: dados.sku?.trim() || null,
        unit: dados.unit?.trim() || 'un',
        category: dados.category?.trim() || null,
        minQty: dados.minQty === null || dados.minQty === undefined
          ? null
          : emQuantidade(dados.minQty),
        notes: dados.notes?.trim() || null,
      },
    });
    return materialParaPublico(criado);
  },

  /**
   * Editar o que o material É — não o que tem.
   *
   * `qty` e `avgCost` NÃO se editam por aqui, e é deliberado: um saldo escrito
   * à mão deixa de ter movimento que o explique, e o histórico passa a mentir.
   * Para corrigir uma contagem há o ajuste, que fica com data e com autor.
   */
  async update(actor: Actor, id: string, dados: {
    name?: string; sku?: string | null; unit?: string;
    category?: string | null; minQty?: number | null; notes?: string | null;
    active?: boolean;
  }) {
    exigirGestao(actor);
    const atual = await prisma.material.findUnique({ where: { id } });
    if (!atual) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');

    if (dados.name !== undefined) {
      const nome = dados.name.trim();
      if (!nome) throw new AppError('Escreva o nome do material.', 400, 'EMPTY_NAME');
      const outro = await prisma.material.findUnique({ where: { name: nome } });
      if (outro && outro.id !== id) {
        throw new AppError('Já existe um material com este nome.', 409, 'NAME_IN_USE');
      }
    }

    const atualizado = await prisma.material.update({
      where: { id },
      data: {
        ...(dados.name !== undefined ? { name: dados.name.trim() } : {}),
        ...(dados.sku !== undefined ? { sku: dados.sku?.trim() || null } : {}),
        ...(dados.unit !== undefined ? { unit: dados.unit.trim() || 'un' } : {}),
        ...(dados.category !== undefined ? { category: dados.category?.trim() || null } : {}),
        ...(dados.minQty !== undefined
          ? { minQty: dados.minQty === null ? null : emQuantidade(dados.minQty) }
          : {}),
        ...(dados.notes !== undefined ? { notes: dados.notes?.trim() || null } : {}),
        ...(dados.active !== undefined ? { active: dados.active } : {}),
      },
    });
    return materialParaPublico(atualizado);
  },

  // ══ Movimentos ═══════════════════════════════════════════════════════════

  async moves(actor: Actor, filtro: {
    materialId?: string; vehicleId?: string; bookingId?: string;
    kind?: string; from?: string; to?: string; take?: number;
  } = {}) {
    quem(actor);

    const linhas = await prisma.stockMove.findMany({
      where: {
        ...(filtro.materialId ? { materialId: filtro.materialId } : {}),
        ...(filtro.vehicleId ? { vehicleId: filtro.vehicleId } : {}),
        ...(filtro.bookingId ? { bookingId: filtro.bookingId } : {}),
        ...(filtro.kind ? { kind: filtro.kind as never } : {}),
        ...(filtro.from || filtro.to
          ? {
            occurredAt: {
              ...(filtro.from ? { gte: dia(filtro.from) } : {}),
              ...(filtro.to ? { lte: dia(filtro.to, true) } : {}),
            },
          }
          : {}),
      },
      include: incluirMovimento,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      // Um limite por omissão em vez de nenhum: ao segundo ano isto tem
      // milhares de linhas, e uma tela que as traz todas deixa de abrir.
      take: Math.min(Math.max(filtro.take ?? 200, 1), 1000),
    });
    return linhas.map(movimentoParaPublico);
  },

  /**
   * Registar um movimento.
   *
   * ─── PORQUE É QUE É UMA TRANSAÇÃO ───────────────────────────────────────
   *
   * O movimento e o saldo são a mesma verdade escrita em dois sítios. Gravar o
   * movimento e falhar o saldo deixa um consumo que nunca saiu da prateleira;
   * o contrário deixa um saldo que ninguém consegue explicar. Juntos, ou
   * nenhum.
   *
   * O `update` do saldo lê o material DENTRO da transação: entre a leitura e a
   * escrita pode entrar outro movimento do mesmo material, e com a leitura
   * feita fora, o segundo movimento escrevia um saldo calculado a partir de um
   * número já velho — e um dos dois desaparecia da conta.
   */
  async registerMove(actor: Actor, dados: {
    materialId: string;
    kind: 'ENTRADA' | 'SAIDA' | 'AJUSTE';
    /** Na ENTRADA e na SAIDA é a quantidade movida; no AJUSTE é a CONTADA. */
    qty: number;
    unitCost?: number | null;
    supplier?: string | null;
    invoiceRef?: string | null;
    vehicleId?: string | null;
    bookingId?: string | null;
    driverId?: string | null;
    notes?: string | null;
    occurredAt?: string | null;
  }) {
    exigirGestao(actor);

    const quando = dados.occurredAt ? new Date(dados.occurredAt) : new Date();
    if (Number.isNaN(quando.getTime())) {
      throw new AppError('Data inválida.', 400, 'INVALID_DATE');
    }
    // Uma data no futuro é sempre um erro de escrita: o material ou entrou ou
    // saiu, e nenhuma das duas coisas acontece amanhã.
    if (quando.getTime() > Date.now() + 86_400_000) {
      throw new AppError('A data não pode ser no futuro.', 400, 'FUTURE_DATE');
    }

    return prisma.$transaction(async (tx) => {
      const m = await tx.material.findUnique({ where: { id: dados.materialId } });
      if (!m) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');

      const antes: Estado = { qty: num(m.qty), avgCost: num(m.avgCost) };

      let r: { estado: Estado; unitCost: number; totalCost: number };
      let qtyDoMovimento: number;

      try {
        if (dados.kind === 'ENTRADA') {
          if (dados.unitCost === null || dados.unitCost === undefined) {
            throw new AppError('Escreva o preço pago por unidade.', 400, 'MISSING_COST');
          }
          r = entrada(antes, dados.qty, dados.unitCost);
          qtyDoMovimento = emQuantidade(dados.qty);
        } else if (dados.kind === 'SAIDA') {
          r = saida(antes, dados.qty);
          qtyDoMovimento = emQuantidade(dados.qty);
        } else {
          const a = ajuste(
            antes,
            dados.qty,
            dados.unitCost === null || dados.unitCost === undefined
              ? undefined
              : dados.unitCost,
          );
          r = a;
          // No ajuste, o que fica gravado é a DIFERENÇA — é ela que explica o
          // salto do saldo. A quantidade contada já está no saldo novo.
          qtyDoMovimento = Math.abs(a.diferenca);
        }
      } catch (erro) {
        if (erro instanceof AppError) throw erro;
        traduzir(erro);
      }

      // Os três são validados porque são do utilizador e podem vir de uma tela
      // desactualizada — um carro vendido, uma marcação apagada.
      if (dados.vehicleId) {
        const v = await tx.vehicle.findUnique({ where: { id: dados.vehicleId } });
        if (!v) throw new AppError('Carro não encontrado', 404, 'VEHICLE_NOT_FOUND');
      }
      if (dados.bookingId) {
        const b = await tx.booking.findUnique({ where: { id: dados.bookingId } });
        if (!b) throw new AppError('Marcação não encontrada', 404, 'BOOKING_NOT_FOUND');
      }

      const movimento = await tx.stockMove.create({
        data: {
          materialId: m.id,
          kind: dados.kind,
          qty: qtyDoMovimento,
          unitCost: r.unitCost,
          totalCost: r.totalCost,
          supplier: dados.supplier?.trim() || null,
          invoiceRef: dados.invoiceRef?.trim() || null,
          vehicleId: dados.vehicleId || null,
          bookingId: dados.bookingId || null,
          driverId: dados.driverId || null,
          notes: dados.notes?.trim() || null,
          occurredAt: quando,
          createdById: actor.id,
        },
        include: incluirMovimento,
      });

      await tx.material.update({
        where: { id: m.id },
        data: { qty: r.estado.qty, avgCost: r.estado.avgCost },
      });

      return {
        move: movimentoParaPublico(movimento),
        material: materialParaPublico({ ...m, qty: r.estado.qty, avgCost: r.estado.avgCost }),
      };
    });
  },

  // ══ Os números ═══════════════════════════════════════════════════════════

  /**
   * O resumo: quanto vale o stock, o que se comprou e o que se gastou.
   *
   * Os AJUSTES ficam de fora das duas somas de propósito — não são compra nem
   * consumo, são a contagem a corrigir a conta. Vão à parte, porque um número
   * de ajustes a crescer é a informação mais útil desta tela: ou a contagem
   * está mal feita, ou está a desaparecer material.
   */
  async summary(actor: Actor, periodo: { from?: string; to?: string } = {}) {
    quem(actor);

    const materiais = await prisma.material.findMany({
      where: { active: true },
      select: { qty: true, avgCost: true, minQty: true },
    });

    const estados: Estado[] = materiais.map((m) => ({
      qty: num(m.qty), avgCost: num(m.avgCost),
    }));

    const emFalta = materiais.filter((m) => stockBaixo(
      num(m.qty),
      m.minQty === null || m.minQty === undefined ? null : num(m.minQty),
    )).length;

    const janela = periodo.from || periodo.to
      ? {
        occurredAt: {
          ...(periodo.from ? { gte: dia(periodo.from) } : {}),
          ...(periodo.to ? { lte: dia(periodo.to, true) } : {}),
        },
      }
      : {};

    const porTipo = await prisma.stockMove.groupBy({
      by: ['kind'],
      where: janela,
      _sum: { totalCost: true },
      _count: { _all: true },
    });

    const soma = (k: string) => {
      const linha = porTipo.find((p) => p.kind === k);
      return {
        total: emDinheiro(num(linha?._sum.totalCost)),
        count: linha?._count._all ?? 0,
      };
    };

    return {
      stockValue: valorDoStock(estados),
      materials: materiais.length,
      low: emFalta,
      purchases: soma('ENTRADA'),
      consumption: soma('SAIDA'),
      adjustments: soma('AJUSTE'),
    };
  },

  /**
   * Quanto material se gastou em cada carro.
   *
   * Só as SAIDAS: é o consumo real. As compras não pertencem a um carro — o
   * óleo compra-se aos vinte litros e gasta-se em quatro carros, e atribuir a
   * compra ao carro da altura punha o custo todo no primeiro que aparecesse.
   */
  async costByVehicle(actor: Actor, periodo: { from?: string; to?: string } = {}) {
    quem(actor);

    const linhas = await prisma.stockMove.groupBy({
      by: ['vehicleId'],
      where: {
        kind: 'SAIDA',
        ...(periodo.from || periodo.to
          ? {
            occurredAt: {
              ...(periodo.from ? { gte: dia(periodo.from) } : {}),
              ...(periodo.to ? { lte: dia(periodo.to, true) } : {}),
            },
          }
          : {}),
      },
      _sum: { totalCost: true },
      _count: { _all: true },
    });

    const ids = linhas.map((l) => l.vehicleId).filter((v): v is string => !!v);
    // O tipo é escrito à mão porque o ramo vazio é `never[]`, e a união dos
    // dois ramos perdia os campos — o `plate` deixava de existir no tipo.
    type Carro = { id: string; plate: string; brand: string; model: string };
    const carros: Carro[] = ids.length
      ? await prisma.vehicle.findMany({
        where: { id: { in: ids } },
        select: { id: true, plate: true, brand: true, model: true },
      })
      : [];
    const porId = new Map(carros.map((c) => [c.id, c]));

    return linhas
      .map((l) => {
        const c = l.vehicleId ? porId.get(l.vehicleId) : undefined;
        return {
          vehicleId: l.vehicleId,
          // Sem carro é material gasto na frota e não num carro: ferramentas,
          // consumíveis da oficina. Aparece na mesma, com nome próprio — somá-lo
          // a um carro qualquer era inventar um custo.
          plate: c?.plate ?? (l.vehicleId ? '—' : 'Sem carro atribuído'),
          name: c ? `${c.brand} ${c.model}` : null,
          total: emDinheiro(num(l._sum.totalCost)),
          moves: l._count._all,
        };
      })
      .sort((a, b) => b.total - a.total);
  },
};
