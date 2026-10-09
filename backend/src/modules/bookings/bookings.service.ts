// src/modules/bookings/bookings.service.ts
//
// Marcações de oficina: o que é, onde, quando, quem leva o carro, quanto custou.
//
// ─── O QUE ISTO SUBSTITUI ───────────────────────────────────────────────────
//
// Um telefonema e a memória de alguém. O motorista sabia que ia à oficina na
// terça; a oficina sabia que esperava um carro; e quando as duas versões não
// batiam certo, o carro ficava parado um dia — que numa frota de TVDE é o dia
// inteiro de faturação daquele carro.
//
// ─── ONDE ESTÃO AS DECISÕES ─────────────────────────────────────────────────
//
// Quem pode fazer o quê está em `regras.ts`, fora daqui, e testado lá. Este
// ficheiro vai à base de dados, aplica essas regras, e avisa quem precisa de
// saber. Quando uma pergunta de permissão aparecer aqui escrita à mão, é sinal
// de que foi parar ao sítio errado.

import bcrypt from 'bcrypt';
import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import {
  podeVerMarcacao, podeResponderOficina, podeAceitarProposta, podeConcluir,
  podeCancelar, podeDesignarAcompanhante, logisticasPermitidas, podeCriar,
  ehGestao, podeVer,
  type Quem, type Marcacao, type Logistica, type Perfil,
} from './regras';

/** Quem está a pedir. A oficina só é lida para contas de mecânico. */
export interface Actor { id: string; role?: UserRole }

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

/** "17/08/2026 às 14:30" */
function quando(d: Date): string {
  return `${d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
    + ` às ${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Carrega quem está a pedir, com a oficina dele.
 *
 * A oficina NÃO vem do token: vem da base de dados a cada pedido. Com ela no
 * token, mudar um mecânico de oficina — ou tirar-lhe a oficina — só faria
 * efeito quando a sessão dele expirasse, e é precisamente nessa altura que não
 * se quer esperar. É o mesmo raciocínio das permissões por área.
 */
async function quemE(actor: Actor): Promise<Quem> {
  const base: Quem = { id: actor.id, role: (actor.role ?? 'DRIVER') as Perfil };
  if (actor.role !== UserRole.MECHANIC) return base;

  const u = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { workshopId: true },
  });
  return { ...base, workshopId: u?.workshopId ?? null };
}

const incluir = {
  vehicle: { select: { id: true, plate: true, brand: true, model: true } },
  driver: { select: { id: true, name: true, phone: true } },
  escort: { select: { id: true, name: true } },
  workshop: { select: { id: true, name: true, kind: true, address: true, phone: true } },
  serviceType: { select: { id: true, label: true, isInspection: true } },
  createdBy: { select: { id: true, name: true } },
  files: {
    select: {
      id: true, kind: true, fileUrl: true, fileName: true, createdAt: true,
      uploadedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  // ─── O material gasto nesta ida à oficina ────────────────────────────────
  //
  // Vem junto porque é a metade do custo que não aparece em factura nenhuma: o
  // óleo e os filtros saíram da nossa prateleira. Sem isto, o custo de uma
  // revisão feita por nós é zero — e o carro parecia o mais barato da frota
  // precisamente por se gastar material nele.
  stockMoves: {
    where: { kind: 'SAIDA' as const },
    select: {
      id: true, qty: true, totalCost: true,
      material: { select: { name: true, unit: true } },
    },
    orderBy: { occurredAt: 'asc' as const },
  },
} as const;

function paraPublico(b: any) {
  return {
    id: b.id,
    vehicleId: b.vehicleId,
    vehiclePlate: b.vehicle?.plate ?? null,
    vehicleName: b.vehicle ? `${b.vehicle.brand} ${b.vehicle.model}` : null,
    driverId: b.driverId,
    driverName: b.driver?.name ?? null,
    // O telefone do motorista vai para a oficina de propósito: é o que ela
    // precisa quando o carro não aparece. Vai só nesta rota, e só a quem já
    // podia ver a marcação.
    driverPhone: b.driver?.phone ?? null,
    workshopId: b.workshopId,
    workshopName: b.workshop?.name ?? null,
    workshopKind: b.workshop?.kind ?? null,
    workshopAddress: b.workshop?.address ?? null,
    workshopPhone: b.workshop?.phone ?? null,
    serviceTypeId: b.serviceTypeId,
    serviceLabel: b.serviceType?.label ?? null,
    isInspection: b.serviceType?.isInspection ?? false,
    description: b.description,
    scheduledAt: b.scheduledAt,
    proposedAt: b.proposedAt,
    proposalReason: b.proposalReason,
    status: b.status,
    logistics: b.logistics,
    needsEscort: b.needsEscort,
    escortId: b.escortId,
    escortName: b.escort?.name ?? null,
    cost: b.cost === null || b.cost === undefined ? null : Number(b.cost),
    completionNotes: b.completionNotes,
    completedAt: b.completedAt,
    cancelReason: b.cancelReason,
    createdById: b.createdById,
    createdByName: b.createdBy?.name ?? null,
    createdAt: b.createdAt,
    files: (b.files ?? []).map((f: any) => ({
      id: f.id,
      kind: f.kind,
      fileUrl: f.fileUrl,
      fileName: f.fileName,
      uploadedByName: f.uploadedBy?.name ?? null,
      createdAt: f.createdAt,
    })),
    materials: (b.stockMoves ?? []).map((mv: any) => ({
      id: mv.id,
      name: mv.material?.name ?? null,
      unit: mv.material?.unit ?? null,
      qty: Number(mv.qty),
      total: mv.totalCost === null || mv.totalCost === undefined ? 0 : Number(mv.totalCost),
    })),
    /// O material, somado. A tela mostra isto ao lado do que a oficina cobrou
    /// — e a soma dos dois é o custo a sério desta reparação.
    materialCost: (b.stockMoves ?? []).reduce(
      (s: number, mv: any) => s + Number(mv.totalCost ?? 0), 0,
    ),
  };
}

/** Avisa, sem deixar o aviso derrubar a operação que já aconteceu. */
async function avisar(userId: string | null | undefined, title: string, message: string) {
  if (!userId) return;
  try {
    await prisma.notification.create({ data: { userId, title, message } });
  } catch (erro) {
    logger.error('[marcações] falhou a notificação', erro);
  }
}

/** A gestão toda, para avisar de um pedido novo. */
async function idsDaGestao(): Promise<string[]> {
  const linhas = await prisma.user.findMany({
    where: { role: { in: [UserRole.ADMIN, UserRole.MANAGER] }, status: 'ACTIVE' },
    select: { id: true },
  });
  return linhas.map((l) => l.id);
}

export const bookingsService = {
  // ══ Oficinas ═════════════════════════════════════════════════════════════

  async listWorkshops(actor: Actor, incluirInativas = false) {
    const quem = await quemE(actor);
    // O mecânico vê a oficina dele, para o ecrã poder escrever o nome.
    if (quem.role === 'MECHANIC') {
      if (!quem.workshopId) return [];
      const w = await prisma.workshop.findUnique({ where: { id: quem.workshopId } });
      return w ? [w] : [];
    }
    if (!podeVer(quem.role) && quem.role !== 'DRIVER') {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    return prisma.workshop.findMany({
      where: incluirInativas ? {} : { active: true },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  },

  async createWorkshop(actor: Actor, dados: {
    name: string; kind?: string; address?: string | null;
    phone?: string | null; notes?: string | null;
  }) {
    const quem = await quemE(actor);
    if (!ehGestao(quem.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    const nome = dados.name.trim();
    if (!nome) throw new AppError('Escreva o nome da oficina.', 400, 'EMPTY_NAME');

    return prisma.workshop.create({
      data: {
        name: nome,
        kind: dados.kind ?? 'OFICINA',
        address: dados.address?.trim() || null,
        phone: dados.phone?.trim() || null,
        notes: dados.notes?.trim() || null,
      },
    });
  },

  async updateWorkshop(actor: Actor, id: string, dados: Record<string, unknown>) {
    const quem = await quemE(actor);
    if (!ehGestao(quem.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    return prisma.workshop.update({ where: { id }, data: dados as never });
  },

  // ══ Tipos de serviço ═════════════════════════════════════════════════════

  async listServiceTypes(actor: Actor, incluirInativos = false) {
    const quem = await quemE(actor);
    if (quem.role === 'INVESTOR') throw new AppError('Forbidden', 403, 'FORBIDDEN');
    return prisma.serviceType.findMany({
      where: incluirInativos ? {} : { active: true },
      orderBy: { label: 'asc' },
    });
  },

  async createServiceType(actor: Actor, label: string, isInspection = false) {
    const quem = await quemE(actor);
    if (!ehGestao(quem.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    const limpo = label.trim();
    if (!limpo) throw new AppError('Escreva o nome do serviço.', 400, 'EMPTY_LABEL');

    // Reaproveitar um desligado com o mesmo nome em vez de recusar — quem
    // escreve "Pneus" outra vez quer o "Pneus", não um erro sobre um registo
    // que não vê em lado nenhum.
    const existente = await prisma.serviceType.findFirst({ where: { label: limpo } });
    if (existente) {
      return existente.active
        ? existente
        : prisma.serviceType.update({ where: { id: existente.id }, data: { active: true } });
    }
    return prisma.serviceType.create({ data: { label: limpo, isInspection } });
  },

  async setServiceTypeActive(actor: Actor, id: string, active: boolean) {
    const quem = await quemE(actor);
    if (!ehGestao(quem.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    return prisma.serviceType.update({ where: { id }, data: { active } });
  },

  // ══ Marcações ════════════════════════════════════════════════════════════

  /**
   * A lista, já filtrada por quem pergunta.
   *
   * O filtro é feito no `where` e não depois de ler: trazer tudo e esconder no
   * fim funciona até ao dia em que alguém pagina a lista — e aí a página 2 de
   * um mecânico passa a ter as marcações da oficina do lado.
   */
  async list(actor: Actor, filtro: { status?: string; vehicleId?: string; abertas?: boolean } = {}) {
    const quem = await quemE(actor);
    if (quem.role === 'INVESTOR') throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const base: Record<string, unknown> = {
      ...(filtro.status ? { status: filtro.status } : {}),
      ...(filtro.vehicleId ? { vehicleId: filtro.vehicleId } : {}),
      ...(filtro.abertas
        ? { status: { in: ['PENDENTE', 'NOVA_DATA_PROPOSTA', 'CONFIRMADA'] } }
        : {}),
    };

    let where = base;
    if (quem.role === 'MECHANIC') {
      // Sem oficina, não vê nada. Um `where` que não casa com nada é melhor do
      // que uma excepção: o ecrã dele mostra uma lista vazia em vez de um erro.
      where = { ...base, workshopId: quem.workshopId ?? '__sem_oficina__' };
    } else if (quem.role === 'DRIVER') {
      where = { ...base, OR: [{ driverId: quem.id }, { createdById: quem.id }] };
    } else if (!podeVer(quem.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const linhas = await prisma.booking.findMany({
      where: where as never,
      orderBy: [{ scheduledAt: 'asc' }],
      include: incluir,
      take: 500,
    });
    return linhas.map(paraPublico);
  },

  async getById(actor: Actor, id: string) {
    const quem = await quemE(actor);
    const b = await prisma.booking.findUnique({ where: { id }, include: incluir });
    if (!b) throw new AppError('Marcação não encontrada', 404, 'NOT_FOUND');
    if (!podeVerMarcacao(quem, b as unknown as Marcacao)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    return paraPublico(b);
  },

  /**
   * Criar.
   *
   * O motorista do carro é lido AGORA e gravado: se o carro mudar de mãos
   * entretanto, a marcação continua a dizer quem a tinha de cumprir.
   */
  async create(actor: Actor, entrada: {
    vehicleId: string;
    workshopId: string;
    serviceTypeId: string;
    scheduledAt: string;
    description?: string | null;
    logistics?: Logistica;
    needsEscort?: boolean;
  }) {
    const quem = await quemE(actor);
    if (!podeCriar(quem.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const quando_ = new Date(entrada.scheduledAt);
    if (Number.isNaN(quando_.getTime())) {
      throw new AppError('Data e hora inválidas.', 400, 'INVALID_DATE');
    }
    // Uma margem de uma hora para trás cobre quem está noutro fuso e quem
    // demora a preencher o formulário. Mais do que isso é engano.
    if (quando_.getTime() < Date.now() - 3_600_000) {
      throw new AppError('Essa data e hora já passaram.', 400, 'DATE_IN_PAST');
    }

    const veiculo = await prisma.vehicle.findUnique({
      where: { id: entrada.vehicleId },
      select: { id: true, plate: true, userId: true },
    });
    if (!veiculo) throw new AppError('Veículo não encontrado', 404, 'VEHICLE_NOT_FOUND');

    // Um motorista só marca para o carro dele. Sem isto, qualquer motorista
    // marcava trabalho em qualquer carro da frota.
    if (quem.role === 'DRIVER' && veiculo.userId !== quem.id) {
      throw new AppError('Esse carro não está consigo.', 403, 'NOT_YOUR_VEHICLE');
    }

    const permitidas = logisticasPermitidas(quem.role);
    const logistica = entrada.logistics ?? 'MOTORISTA_LEVA';
    if (!permitidas.includes(logistica)) {
      throw new AppError(
        'Não pode escolher essa forma de levar o carro.',
        403,
        'LOGISTICS_NOT_ALLOWED',
      );
    }

    const oficina = await prisma.workshop.findUnique({
      where: { id: entrada.workshopId }, select: { id: true, name: true, active: true },
    });
    if (!oficina?.active) throw new AppError('Oficina não encontrada ou desligada.', 404, 'WORKSHOP_NOT_FOUND');

    const criada = await prisma.booking.create({
      data: {
        vehicleId: veiculo.id,
        driverId: veiculo.userId,
        workshopId: entrada.workshopId,
        serviceTypeId: entrada.serviceTypeId,
        description: entrada.description?.trim() || null,
        scheduledAt: quando_,
        logistics: logistica,
        needsEscort: entrada.needsEscort === true,
        createdById: quem.id,
      },
      include: incluir,
    });

    // ── Quem precisa de saber ───────────────────────────────────────────────
    //
    // A oficina ainda não tem conta ligada à notificação (as contas de
    // mecânico veem a lista deles), por isso avisa-se quem é da casa: a gestão
    // sempre, e o motorista quando não foi ele a marcar.
    const texto = `${criada.vehicle.plate} · ${criada.serviceType.label} · ${oficina.name} · ${quando(quando_)}`;

    if (quem.role === 'DRIVER') {
      for (const id of await idsDaGestao()) {
        await avisar(id, 'Marcação pedida por um motorista', texto
          + (criada.needsEscort ? '\nPediu acompanhamento da empresa.' : ''));
      }
    } else if (criada.driverId && criada.driverId !== quem.id) {
      await avisar(criada.driverId, 'Marcação no seu carro', texto);
    }

    logger.info(`[marcações] ${quem.id} criou ${criada.id} (${texto})`);
    return paraPublico(criada);
  },

  /** A oficina confirma o dia e a hora que lhe propuseram. */
  async confirm(actor: Actor, id: string) {
    const { quem, b } = await carregar(actor, id);
    if (!podeResponderOficina(quem, b as unknown as Marcacao)) {
      throw new AppError('Não pode confirmar esta marcação.', 403, 'FORBIDDEN');
    }

    const atualizada = await prisma.booking.update({
      where: { id },
      data: { status: 'CONFIRMADA', proposedAt: null, proposalReason: null },
      include: incluir,
    });

    const texto = `${atualizada.vehicle.plate} · ${atualizada.serviceType.label} · `
      + `${atualizada.workshop.name} · ${quando(atualizada.scheduledAt)}`;
    await avisar(atualizada.driverId, 'Marcação confirmada pela oficina', texto);
    for (const g of await idsDaGestao()) await avisar(g, 'Marcação confirmada', texto);

    return paraPublico(atualizada);
  },

  /**
   * A oficina contrapõe outra hora.
   *
   * Não muda a data: propõe. A marcação fica à espera de alguém aceitar, e
   * ninguém assume uma hora que não combinou.
   */
  async propose(actor: Actor, id: string, novaData: string, motivo?: string) {
    const { quem, b } = await carregar(actor, id);
    if (!podeResponderOficina(quem, b as unknown as Marcacao)) {
      throw new AppError('Não pode propor outra hora para esta marcação.', 403, 'FORBIDDEN');
    }

    const d = new Date(novaData);
    if (Number.isNaN(d.getTime())) throw new AppError('Data e hora inválidas.', 400, 'INVALID_DATE');
    if (d.getTime() < Date.now() - 3_600_000) {
      throw new AppError('Essa data e hora já passaram.', 400, 'DATE_IN_PAST');
    }

    const atualizada = await prisma.booking.update({
      where: { id },
      data: {
        status: 'NOVA_DATA_PROPOSTA',
        proposedAt: d,
        proposalReason: motivo?.trim() || null,
      },
      include: incluir,
    });

    const texto = `${atualizada.vehicle.plate} · ${atualizada.serviceType.label}\n`
      + `A oficina propõe ${quando(d)} em vez de ${quando(atualizada.scheduledAt)}.`
      + (motivo?.trim() ? `\nMotivo: ${motivo.trim()}` : '');

    await avisar(atualizada.driverId, 'A oficina propôs outra hora', texto);
    if (atualizada.createdById !== atualizada.driverId) {
      await avisar(atualizada.createdById, 'A oficina propôs outra hora', texto);
    }
    for (const g of await idsDaGestao()) await avisar(g, 'A oficina propôs outra hora', texto);

    return paraPublico(atualizada);
  },

  /** Quem pediu aceita a hora contraposta. A data passa a ser a nova. */
  async acceptProposal(actor: Actor, id: string) {
    const { quem, b } = await carregar(actor, id);
    if (!podeAceitarProposta(quem, b as unknown as Marcacao)) {
      throw new AppError('Não pode aceitar esta proposta.', 403, 'FORBIDDEN');
    }
    if (!b.proposedAt) throw new AppError('Não há proposta para aceitar.', 400, 'NO_PROPOSAL');

    const atualizada = await prisma.booking.update({
      where: { id },
      data: {
        scheduledAt: b.proposedAt,
        status: 'CONFIRMADA',
        proposedAt: null,
        proposalReason: null,
      },
      include: incluir,
    });

    const texto = `${atualizada.vehicle.plate} · ${atualizada.serviceType.label} · `
      + `${atualizada.workshop.name} · ${quando(atualizada.scheduledAt)}`;
    await avisar(atualizada.driverId, 'Marcação confirmada', texto);
    return paraPublico(atualizada);
  },

  /** A oficina recusa. Com motivo — uma recusa sem motivo obriga a telefonar. */
  async refuse(actor: Actor, id: string, motivo: string) {
    const { quem, b } = await carregar(actor, id);
    if (!podeResponderOficina(quem, b as unknown as Marcacao)) {
      throw new AppError('Não pode recusar esta marcação.', 403, 'FORBIDDEN');
    }
    if (!motivo?.trim()) {
      throw new AppError('Explique porque está a recusar.', 400, 'REASON_REQUIRED');
    }

    const atualizada = await prisma.booking.update({
      where: { id },
      data: { status: 'RECUSADA', cancelReason: motivo.trim() },
      include: incluir,
    });

    const texto = `${atualizada.vehicle.plate} · ${atualizada.serviceType.label}\nMotivo: ${motivo.trim()}`;
    await avisar(atualizada.driverId, 'A oficina recusou a marcação', texto);
    for (const g of await idsDaGestao()) await avisar(g, 'A oficina recusou uma marcação', texto);

    return paraPublico(atualizada);
  },

  async cancel(actor: Actor, id: string, motivo?: string) {
    const { quem, b } = await carregar(actor, id);
    if (!podeCancelar(quem, b as unknown as Marcacao)) {
      throw new AppError('Não pode cancelar esta marcação.', 403, 'FORBIDDEN');
    }

    const atualizada = await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELADA', cancelReason: motivo?.trim() || null },
      include: incluir,
    });

    const texto = `${atualizada.vehicle.plate} · ${atualizada.serviceType.label} · `
      + `${quando(atualizada.scheduledAt)}`
      + (motivo?.trim() ? `\nMotivo: ${motivo.trim()}` : '');
    if (atualizada.driverId !== quem.id) await avisar(atualizada.driverId, 'Marcação cancelada', texto);
    for (const g of await idsDaGestao()) {
      if (g !== quem.id) await avisar(g, 'Marcação cancelada', texto);
    }
    return paraPublico(atualizada);
  },

  /**
   * Concluir: o que foi feito, quanto custou, e — se for inspeção — até quando
   * vale a nova.
   *
   * A data da próxima inspeção é PEDIDA e não calculada. O intervalo legal
   * depende da idade do carro e muda com a lei; inventá-lo aqui daria um aviso
   * errado com ar de certeza, que é pior do que não avisar.
   */
  async complete(actor: Actor, id: string, dados: {
    cost?: number | null;
    notes?: string | null;
    nextInspectionOn?: string | null;
  }) {
    const { quem, b } = await carregar(actor, id);
    if (!podeConcluir(quem, b as unknown as Marcacao)) {
      throw new AppError('Não pode concluir esta marcação.', 403, 'FORBIDDEN');
    }
    if (dados.cost !== null && dados.cost !== undefined && dados.cost < 0) {
      throw new AppError('O custo não pode ser negativo.', 400, 'INVALID_COST');
    }

    const atualizada = await prisma.$transaction(async (tx) => {
      const m = await tx.booking.update({
        where: { id },
        data: {
          status: 'CONCLUIDA',
          completedAt: new Date(),
          // `?? null` e não `|| null`: zero é um custo válido — uma reparação
          // em garantia não custa nada, e isso é diferente de não se saber.
          cost: dados.cost ?? null,
          completionNotes: dados.notes?.trim() || null,
        },
        include: incluir,
      });

      if (dados.nextInspectionOn) {
        await tx.vehicle.update({
          where: { id: m.vehicleId },
          data: { nextInspectionOn: new Date(`${dados.nextInspectionOn}T00:00:00.000Z`) },
        });
      }
      return m;
    });

    const texto = `${atualizada.vehicle.plate} · ${atualizada.serviceType.label}`
      + (atualizada.cost !== null ? `\nCusto: ${eur(Number(atualizada.cost))}` : '')
      + (dados.notes?.trim() ? `\n${dados.notes.trim()}` : '');
    await avisar(atualizada.driverId, 'Trabalho concluído na oficina', texto);
    for (const g of await idsDaGestao()) await avisar(g, 'Marcação concluída', texto);

    return paraPublico(atualizada);
  },

  /** A gestão escolhe quem da empresa acompanha o motorista. */
  async assignEscort(actor: Actor, id: string, escortId: string | null) {
    const { quem, b } = await carregar(actor, id);
    if (!podeDesignarAcompanhante(quem)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    void b;

    const atualizada = await prisma.booking.update({
      where: { id },
      data: { escortId, ...(escortId ? { needsEscort: true } : {}) },
      include: incluir,
    });

    if (escortId) {
      const texto = `${atualizada.vehicle.plate} · ${atualizada.serviceType.label} · `
        + `${atualizada.workshop.name} · ${quando(atualizada.scheduledAt)}`
        + (atualizada.driver ? `\nCom ${atualizada.driver.name}.` : '');
      await avisar(escortId, 'Vai acompanhar uma ida à oficina', texto);
      await avisar(atualizada.driverId, 'Acompanhamento confirmado',
        `${atualizada.escort?.name ?? 'Alguém da empresa'} vai consigo.\n${texto}`);
    }
    return paraPublico(atualizada);
  },

  // ══ Factura e comprovativo ═══════════════════════════════════════════════

  /**
   * Anexa um ficheiro já enviado para o Cloudinary.
   *
   * O envio em si passa pela rota de upload que o resto do projeto já usa —
   * aqui só se guarda o endereço. Quem pode anexar é quem pode ver a
   * marcação: a oficina põe a factura, a gestão põe o comprovativo do
   * pagamento.
   */
  async addFile(actor: Actor, id: string, f: {
    kind: 'FATURA' | 'COMPROVATIVO' | 'OUTRO';
    fileUrl: string;
    fileKey: string;
    fileName?: string | null;
  }) {
    const { quem, b } = await carregar(actor, id);
    // O motorista vê, mas não anexa: a factura é da oficina e o comprovativo
    // é de quem pagou.
    if (!(ehGestao(quem.role) || (quem.role === 'MECHANIC' && quem.workshopId === b.workshopId))) {
      throw new AppError('Não pode anexar ficheiros a esta marcação.', 403, 'FORBIDDEN');
    }

    await prisma.bookingFile.create({
      data: {
        bookingId: id,
        kind: f.kind,
        fileUrl: f.fileUrl,
        fileKey: f.fileKey,
        fileName: f.fileName?.trim() || null,
        uploadedById: quem.id,
      },
    });

    const atualizada = await prisma.booking.findUnique({ where: { id }, include: incluir });
    return paraPublico(atualizada);
  },

  // ══ Contas de oficina ════════════════════════════════════════════════════
  //
  // ─── PORQUE É QUE ESTAS CONTAS SE CRIAM AQUI E NÃO NA EQUIPA ──────────────
  //
  // Na Equipa promove-se quem JÁ SE REGISTOU — e é assim de propósito: o
  // registo público fixa DRIVER, e é essa linha que impede alguém de se criar
  // administrador. Um mecânico não é motorista e não tem nada para fazer no
  // registo público: obrigá-lo a passar por lá dava uma conta de motorista na
  // frota, com saldo e documentos, à espera de ser promovida.
  //
  // Então a conta nasce já ligada à oficina, feita por quem gere a frota. É
  // uma conta de serviço: entra, vê as marcações daquela oficina, e mais nada.
  //
  // SÓ O ADMINISTRADOR. Criar um login é dar uma chave da casa, e isso não é
  // um ato de operação do dia a dia.

  async listMechanics(actor: Actor) {
    const quem = await quemE(actor);
    if (quem.role !== 'ADMIN') throw new AppError('Forbidden', 403, 'FORBIDDEN');
    return prisma.user.findMany({
      where: { role: UserRole.MECHANIC },
      select: {
        id: true, name: true, email: true, status: true, workshopId: true,
        workshop: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  },

  async createMechanic(actor: Actor, dados: {
    workshopId: string; name: string; email: string; password: string;
  }) {
    const quem = await quemE(actor);
    if (quem.role !== 'ADMIN') throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const oficina = await prisma.workshop.findUnique({ where: { id: dados.workshopId } });
    if (!oficina) throw new AppError('Oficina não encontrada', 404, 'WORKSHOP_NOT_FOUND');

    const email = dados.email.trim().toLowerCase();
    const jaExiste = await prisma.user.findUnique({ where: { email } });
    if (jaExiste) throw new AppError('Este email já está em uso.', 409, 'EMAIL_IN_USE');

    const criado = await prisma.user.create({
      data: {
        name: dados.name.trim(),
        email,
        password: await bcrypt.hash(dados.password, 10),
        role: UserRole.MECHANIC,
        status: 'ACTIVE',
        workshopId: oficina.id,
      },
      select: {
        id: true, name: true, email: true, status: true, workshopId: true,
        workshop: { select: { id: true, name: true } },
      },
    });

    await avisar(
      criado.id,
      `Bem-vindo, ${oficina.name}`,
      'A sua conta está ligada à oficina. Aqui aparecem as marcações da frota '
      + 'para confirmar, propor outra hora, ou fechar com a factura.',
    );
    return criado;
  },

  /**
   * Mexer numa conta de oficina: trocá-la de oficina, ou desligá-la.
   *
   * Desligar e não apagar: as marcações que ela confirmou continuam a apontar
   * para ela, e um histórico sem quem confirmou não diz nada a ninguém.
   */
  async updateMechanic(actor: Actor, userId: string, dados: {
    workshopId?: string | null; active?: boolean; password?: string;
  }) {
    const quem = await quemE(actor);
    if (quem.role !== 'ADMIN') throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const alvo = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!alvo) throw new AppError('Conta não encontrada', 404, 'NOT_FOUND');
    // Esta porta só serve contas de oficina. Sem esta linha, um id de
    // administrador passado aqui deixava-se desligar por uma rota que nada
    // tem a ver com a gestão de contas.
    if (alvo.role !== UserRole.MECHANIC) {
      throw new AppError('Esta conta não é de uma oficina.', 400, 'NOT_A_MECHANIC');
    }

    if (dados.workshopId) {
      const existe = await prisma.workshop.findUnique({ where: { id: dados.workshopId } });
      if (!existe) throw new AppError('Oficina não encontrada', 404, 'WORKSHOP_NOT_FOUND');
    }

    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(dados.workshopId !== undefined ? { workshopId: dados.workshopId } : {}),
        ...(dados.active !== undefined ? { status: dados.active ? 'ACTIVE' : 'INACTIVE' } : {}),
        ...(dados.password ? { password: await bcrypt.hash(dados.password, 10) } : {}),
      },
      select: {
        id: true, name: true, email: true, status: true, workshopId: true,
        workshop: { select: { id: true, name: true } },
      },
    });
  },

  /**
   * Quem pode ir acompanhar um carro à oficina.
   *
   * Vive aqui e não em `/users` porque `/users` está sob a área dos Motoristas:
   * um gestor que trate da frota e não tenha essa área ficaria sem a lista — e
   * o botão de designar acompanhante, que é dele, deixava de funcionar. Devolve
   * só o id e o nome, que é tudo o que o ecrã precisa.
   */
  async listEscortCandidates(actor: Actor) {
    const quem = await quemE(actor);
    if (!podeDesignarAcompanhante(quem)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    return prisma.user.findMany({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT] },
        status: 'ACTIVE',
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  },

  async removeFile(actor: Actor, bookingId: string, fileId: string) {
    const { quem, b } = await carregar(actor, bookingId);
    if (!(ehGestao(quem.role) || (quem.role === 'MECHANIC' && quem.workshopId === b.workshopId))) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    await prisma.bookingFile.deleteMany({ where: { id: fileId, bookingId } });
    const atualizada = await prisma.booking.findUnique({ where: { id: bookingId }, include: incluir });
    return paraPublico(atualizada);
  },
};

/** Carrega a marcação e quem pede, ou atira. Usado por quase tudo acima. */
async function carregar(actor: Actor, id: string) {
  const quem = await quemE(actor);
  const b = await prisma.booking.findUnique({ where: { id }, include: incluir });
  if (!b) throw new AppError('Marcação não encontrada', 404, 'NOT_FOUND');
  if (!podeVerMarcacao(quem, b as unknown as Marcacao)) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return { quem, b };
}
