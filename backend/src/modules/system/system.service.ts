// src/modules/system/system.service.ts
//
// O painel do dono da plataforma: as frotas que são clientes, e os planos que
// se lhes vende.
//
// ─── ESTE MÓDULO É O ÚNICO QUE ATRAVESSA FROTAS DE PROPÓSITO ────────────────
//
// Todo o resto do sistema corre dentro de UMA frota e as consultas que saiam
// dela rebentam (ver `config/escopo.ts`). Aqui é o contrário: a lista de
// clientes é, por definição, uma lista que atravessa todos. Por isso as rotas
// deste módulo correm dentro de `comoDono()` — declarado, e não por omissão.
//
// E é por isso que a guarda deste módulo é a mais apertada do projeto: ser
// ADMIN não basta, porque cada frota cliente tem o administrador dela. Só
// passa quem tem a marca `isOwner`, lida da base de dados a cada pedido.
//
// ─── AS ESCRITAS CONTINUAM A PRECISAR DE DIZER A FROTA ──────────────────────
//
// Em modo de dono a extensão não carimba nada — se carimbasse, carimbava
// o quê? Então tudo o que se escreve DENTRO de uma frota (a conta do primeiro
// gestor, os níveis, os tipos de serviço) está envolvido num
// `comFrota(id, …)`. Não é cerimónia: é a diferença entre criar a conta de um
// cliente na frota dele e criá-la na do cliente ao lado.

import bcrypt from 'bcrypt';
import { prisma } from '../../config/prisma';
import { comFrota } from '../../config/escopo';
import { AppError } from '../../shared/errors/AppError';
import { UserRole, UserStatus } from '../../shared/types/enums';
import { situacao, renovar, type Situacao } from './assinatura';
import { slugLivre } from './slug';
import {
  FUNCIONALIDADES, GRUPOS_DE_FUNCIONALIDADES, OBRIGATORIAS,
  normalizarFuncionalidades,
} from './funcionalidades';

/** Quantas voltas o bcrypt dá. O mesmo que o resto do projeto usa. */
const VOLTAS = 10;

/**
 * Os níveis com que uma frota nova nasce.
 *
 * Nomes genéricos de propósito: "Dragon Driver" é a marca dele, e uma frota
 * cliente a estrear-se com os níveis chamados Dragon seria estranho de
 * explicar. As cores ficam, porque a escada precisa de ser legível desde o
 * primeiro dia; o cliente muda os nomes no ecrã de Níveis.
 */
const NIVEIS_INICIAIS = [
  { tier: 'TIER_1', label: 'Nível 1', color: '#64748B' },
  { tier: 'TIER_2', label: 'Nível 2', color: '#2563EB' },
  { tier: 'TIER_3', label: 'Nível 3', color: '#0D6B4F' },
  { tier: 'TIER_4', label: 'Nível 4', color: '#B45309' },
  { tier: 'TIER_5', label: 'Nível 5', color: '#7C3AED' },
] as const;

/**
 * Os tipos de serviço de oficina com que uma frota nova nasce.
 *
 * São os mesmos nove de sempre: não há nada de específico de uma empresa em
 * "troca de óleo". Nascer com eles poupa ao cliente a primeira hora a escrever
 * uma lista que é igual em toda a parte — e, mais importante, faz a Oficina
 * funcionar à primeira em vez de dar um formulário sem opções.
 */
/**
 * As categorias de agendamento com que uma frota nova nasce.
 *
 * Pelo mesmo motivo dos serviços de oficina: são as mesmas em qualquer frota, e
 * sem nenhuma o ecrã de Agendamentos abre com uma lista de categorias vazia —
 * que parece avariado e não "por configurar".
 */
const CATEGORIAS_INICIAIS: { label: string }[] = [
  { label: 'Seguro' },
  { label: 'Multa' },
  { label: 'Quota' },
  { label: 'Caução' },
  { label: 'Adiantamento' },
  { label: 'Prémio' },
  { label: 'Outro' },
];

const SERVICOS_INICIAIS: { label: string; isInspection: boolean }[] = [
  { label: 'Revisão / manutenção', isInspection: false },
  { label: 'Troca de óleo', isInspection: false },
  { label: 'Pneus', isInspection: false },
  { label: 'Furo', isInspection: false },
  { label: 'Travões', isInspection: false },
  { label: 'Inspeção periódica', isInspection: true },
  { label: 'Avaria', isInspection: false },
  { label: 'Chapa e pintura', isInspection: false },
  { label: 'Outro', isInspection: false },
];

export interface FrotaNaLista {
  id: string;
  nome: string;
  slug: string;
  activa: boolean;
  nif: string | null;
  telefone: string | null;
  email: string | null;
  notas: string | null;
  criadaEm: Date;

  plano: { id: string; nome: string; preco: string; duracaoDias: number } | null;
  /** `null` quando não tem assinatura — ver `assinatura.ts`. */
  terminaEm: string | null;
  assinatura: Situacao;

  /** É a frota do próprio dono. Não se desliga nem se cobra. */
  daCasa: boolean;

  contagens: { motoristas: number; equipa: number; veiculos: number };
}

export interface EntradaDoGestor {
  nome: string;
  email: string;
  password: string;
  telefone?: string | null;
}

export interface EntradaDaFrota {
  nome: string;
  nif?: string | null;
  telefone?: string | null;
  email?: string | null;
  notas?: string | null;
  planoId?: string | null;
  /** Dias a dar já. Omitido, usa a duração do plano. Zero, não dá nada. */
  dias?: number;
  gestor: EntradaDoGestor;
}

export interface EntradaDoPlano {
  nome: string;
  duracaoDias: number;
  preco: number;
  funcionalidades: string[];
  notas?: string | null;
  activo?: boolean;
}

export class SystemService {
  // ──────────────────────────────────────────────────────────────────────────
  // Frotas
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Todas as frotas, com o plano, a assinatura e os números de cada uma.
   *
   * ─── PORQUE É QUE AS CONTAGENS SÃO TRÊS GROUP BY E NÃO UMA CONSULTA POR FROTA
   *
   * Porque uma consulta por frota é o número de frotas vezes três consultas, e
   * isto é a primeira tela que ele abre todos os dias. Três `groupBy` trazem
   * tudo de uma vez, e o Postgres conta com os índices de `fleet_id` que a
   * migração deixou em todas as tabelas.
   */
  async listarFrotas(): Promise<FrotaNaLista[]> {
    const [frotas, motoristas, equipa, veiculos, primeira] = await Promise.all([
      prisma.fleet.findMany({
        orderBy: [{ createdAt: 'asc' }],
        include: { plan: { select: { id: true, name: true, price: true, durationDays: true } } },
      }),
      prisma.user.groupBy({ by: ['fleetId'], where: { role: UserRole.DRIVER }, _count: { _all: true } }),
      prisma.user.groupBy({
        by: ['fleetId'],
        where: { role: { in: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT] } },
        _count: { _all: true },
      }),
      prisma.vehicle.groupBy({ by: ['fleetId'], _count: { _all: true } }),
      // Qual é a frota da casa: a primeira que existiu. Não o nome dela, nem o
      // id escrito no código — ver a nota em `ehDaCasa`.
      prisma.fleet.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }),
    ]);

    const contar = (
      linhas: { fleetId: string; _count: { _all: number } }[],
      id: string,
    ) => linhas.find((l) => l.fleetId === id)?._count._all ?? 0;

    return frotas.map((f) => ({
      id: f.id,
      nome: f.name,
      slug: f.slug,
      activa: f.active,
      nif: f.nif,
      telefone: f.phone,
      email: f.email,
      notas: f.notes,
      criadaEm: f.createdAt,
      plano: f.plan
        ? {
          id: f.plan.id,
          nome: f.plan.name,
          preco: f.plan.price.toString(),
          duracaoDias: f.plan.durationDays,
        }
        : null,
      terminaEm: f.subscriptionEndsOn
        ? f.subscriptionEndsOn.toISOString().slice(0, 10)
        : null,
      assinatura: situacao(f.subscriptionEndsOn),
      daCasa: f.id === primeira?.id,
      contagens: {
        motoristas: contar(motoristas, f.id),
        equipa: contar(equipa, f.id),
        veiculos: contar(veiculos, f.id),
      },
    }));
  }

  /**
   * É a frota da casa?
   *
   * ─── PORQUE É QUE É "A PRIMEIRA" E NÃO UM ID ESCRITO NO CÓDIGO ──────────────
   *
   * Porque um id escrito aqui era verdade nesta base de dados e mentira na
   * próxima — e a próxima é a de desenvolvimento, onde a frota da casa tem
   * outro id. O mesmo motivo por que o resto do projeto identifica a empresa
   * pela marca `isCompany` e não pelo nome de ninguém.
   *
   * A primeira frota a existir é a dele: foi a migração que a criou, com os
   * dados que já lá estavam. Nenhuma frota criada a seguir pode tomar esse
   * lugar.
   */
  private async ehDaCasa(fleetId: string): Promise<boolean> {
    const primeira = await prisma.fleet.findFirst({
      orderBy: { createdAt: 'asc' }, select: { id: true },
    });
    return primeira?.id === fleetId;
  }

  private async frotaOuErro(id: string) {
    const f = await prisma.fleet.findUnique({ where: { id } });
    if (!f) throw new AppError('Frota não encontrada.', 404, 'FLEET_NOT_FOUND');
    return f;
  }

  /**
   * Cria uma frota e a primeira conta dela, de uma vez.
   *
   * ─── PORQUE É QUE A CONTA VEM NO MESMO PEDIDO ───────────────────────────────
   *
   * Porque uma frota sem conta nenhuma é uma frota onde ninguém entra. Separar
   * os dois passos deixava um estado intermédio — cliente criado, inacessível —
   * que alguém teria de se lembrar de arrumar. Numa transação, ou nascem as
   * duas ou não nasce nada.
   *
   * ─── E PORQUE É QUE A CONTA É ADMIN E NÃO MANAGER ───────────────────────────
   *
   * Porque é o administrador da frota DELE. Depois da fase 1 um ADMIN já só vê
   * a frota onde está, e é ele que tem de poder criar a equipa dele e mexer nas
   * configurações da casa dele. MANAGER não abre a Equipa nem as Configurações —
   * o cliente ficava à espera que ele fizesse por ele o trabalho de dentro de
   * casa, todas as vezes.
   */
  async criarFrota(entrada: EntradaDaFrota) {
    const nome = entrada.nome.trim();
    const emailGestor = entrada.gestor.email.trim().toLowerCase();

    // O email é único no sistema INTEIRO (é por ele que se entra), por isso
    // esta pergunta atravessa frotas — e aqui já estamos em modo de dono.
    const jaExiste = await prisma.user.findUnique({
      where: { email: emailGestor }, select: { id: true },
    });
    if (jaExiste) {
      throw new AppError(
        'Já existe uma conta com este email. Use outro.',
        409, 'EMAIL_IN_USE',
      );
    }

    const plano = entrada.planoId
      ? await prisma.plan.findUnique({ where: { id: entrada.planoId } })
      : null;
    if (entrada.planoId && !plano) {
      throw new AppError('Plano não encontrado.', 404, 'PLAN_NOT_FOUND');
    }

    const slug = await slugLivre(nome, async (s) => {
      const existe = await prisma.fleet.findUnique({ where: { slug: s }, select: { id: true } });
      return existe !== null;
    });

    // Dias a dar já: o que foi pedido, ou a duração do plano. Zero dias é uma
    // escolha válida — a frota fica criada e por activar.
    const dias = entrada.dias ?? plano?.durationDays ?? 0;
    const terminaEm = dias > 0 ? renovar(null, dias) : null;

    const hash = await bcrypt.hash(entrada.gestor.password, VOLTAS);

    // O tipo do `tx` fica inferido, como no resto do projeto: anotá-lo à mão
    // obrigava a acertar num tipo que o cliente estendido deriva, e já partiu
    // um build neste projeto (ver a nota do `Transacao` em `config/prisma.ts`).
    return prisma.$transaction(async (tx) => {
      const frota = await tx.fleet.create({
        data: {
          name: nome,
          slug,
          nif: entrada.nif?.trim() || null,
          phone: entrada.telefone?.trim() || null,
          email: entrada.email?.trim().toLowerCase() || null,
          notes: entrada.notas?.trim() || null,
          planId: plano?.id ?? null,
          subscriptionEndsOn: terminaEm,
        },
      });

      // ─── DAQUI PARA BAIXO, DENTRO DA FROTA NOVA ───────────────────────
      //
      // Em modo de dono a extensão não carimba nada, e sem isto estas
      // escritas iam para parte nenhuma — ou pior, passavam com o `fleet_id`
      // vazio, que a chave estrangeira recusa. Envolvidas, levam a frota
      // certa sem ninguém a escrever campo a campo.
      const gestor = await comFrota(frota.id, async () => {
        const u = await tx.user.create({
          data: {
            name: entrada.gestor.nome.trim(),
            email: emailGestor,
            password: hash,
            phone: entrada.gestor.telefone?.trim() || null,
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
          },
          select: { id: true, name: true, email: true },
        });

        await tx.rankConfig.createMany({ data: NIVEIS_INICIAIS.map((n) => ({ ...n })) });
        await tx.serviceType.createMany({ data: SERVICOS_INICIAIS });
        await tx.paymentCategory.createMany({ data: CATEGORIAS_INICIAIS });

        return u;
      });

      return { frota, gestor };
    });
  }

  /** Dados da frota: nome, contactos, notas, plano, e ligada ou desligada. */
  async actualizarFrota(id: string, entrada: Partial<Omit<EntradaDaFrota, 'gestor' | 'dias'>> & { activa?: boolean }) {
    await this.frotaOuErro(id);

    if (entrada.activa === false && await this.ehDaCasa(id)) {
      // Desligar esta frota era trancar-se a si próprio fora de casa: o
      // middleware do âmbito recusa TUDO a quem pertence a uma frota
      // desligada, incluindo este painel.
      throw new AppError(
        'Não pode desligar a frota da casa — é a sua.',
        400, 'FLEET_IS_HOME',
      );
    }

    if (entrada.planoId) {
      const plano = await prisma.plan.findUnique({ where: { id: entrada.planoId } });
      if (!plano) throw new AppError('Plano não encontrado.', 404, 'PLAN_NOT_FOUND');
    }

    const nome = entrada.nome?.trim();

    return prisma.fleet.update({
      where: { id },
      data: {
        ...(nome ? { name: nome } : {}),
        ...(entrada.nif !== undefined ? { nif: entrada.nif?.trim() || null } : {}),
        ...(entrada.telefone !== undefined ? { phone: entrada.telefone?.trim() || null } : {}),
        ...(entrada.email !== undefined ? { email: entrada.email?.trim().toLowerCase() || null } : {}),
        ...(entrada.notas !== undefined ? { notes: entrada.notas?.trim() || null } : {}),
        ...(entrada.planoId !== undefined ? { planId: entrada.planoId || null } : {}),
        ...(entrada.activa !== undefined ? { active: entrada.activa } : {}),
      },
    });
  }

  /** Quantos dias dura uma renovação desta frota, pelo plano que tem. */
  private async diasDoPlanoDaFrota(planId: string | null): Promise<number> {
    if (!planId) {
      throw new AppError(
        'Esta frota não tem plano. Escolha o plano ou diga quantos dias.',
        400, 'NO_PLAN',
      );
    }
    const plano = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plano) throw new AppError('Plano não encontrado.', 404, 'PLAN_NOT_FOUND');
    return plano.durationDays;
  }

  /**
   * Renova a assinatura. A conta das datas está em `assinatura.ts`.
   *
   * Sem `dias`, usa a duração do plano da frota. Sem plano e sem dias, não há
   * nada por onde adivinhar e diz-se isso.
   */
  async renovarFrota(id: string, dias?: number) {
    const frota = await this.frotaOuErro(id);

    const aUsar: number = dias ?? await this.diasDoPlanoDaFrota(frota.planId);

    const nova = renovar(frota.subscriptionEndsOn, aUsar);

    return prisma.fleet.update({
      where: { id },
      data: { subscriptionEndsOn: nova },
    });
  }

  /**
   * As contas de administração de uma frota, para ele poder ajudar quem liga.
   *
   * Sem palavras-passe, sem motoristas, sem dados de negócio: só quem é que
   * tem a chave da casa. É o que resolve a chamada "ninguém consegue entrar".
   */
  async contasDaFrota(id: string) {
    await this.frotaOuErro(id);

    return comFrota(id, async () => await prisma.user.findMany({
      where: { role: { in: [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT] } },
      select: {
        id: true, name: true, email: true, role: true, status: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Planos
  // ──────────────────────────────────────────────────────────────────────────

  async listarPlanos() {
    const [planos, emUso] = await Promise.all([
      prisma.plan.findMany({ orderBy: [{ active: 'desc' }, { durationDays: 'asc' }] }),
      prisma.fleet.groupBy({ by: ['planId'], _count: { _all: true } }),
    ]);

    return planos.map((p) => ({
      id: p.id,
      nome: p.name,
      duracaoDias: p.durationDays,
      preco: p.price.toString(),
      funcionalidades: p.features,
      notas: p.notes,
      activo: p.active,
      // Quantas frotas estão neste plano. É o número que diz se um plano pode
      // ser arquivado sem telefonar a ninguém.
      frotas: emUso.find((u) => u.planId === p.id)?._count._all ?? 0,
    }));
  }

  async criarPlano(entrada: EntradaDoPlano) {
    return prisma.plan.create({
      data: {
        name: entrada.nome.trim(),
        durationDays: entrada.duracaoDias,
        price: entrada.preco,
        features: normalizarFuncionalidades(entrada.funcionalidades),
        notes: entrada.notas?.trim() || null,
        active: entrada.activo ?? true,
      },
    });
  }

  /**
   * Altera um plano.
   *
   * ─── ISTO MUDA O QUE AS FROTAS NESTE PLANO PASSAM A VER ─────────────────────
   *
   * De propósito, e é a razão de existir um editor: tirar uma caixa a um plano
   * tira esse menu a todos os clientes que o tenham. Não se guarda uma cópia
   * por frota — isso daria clientes no "mesmo" plano com acessos diferentes, e
   * ninguém saberia explicar porquê. Quem precisar de um acesso diferente leva
   * um plano personalizado, que é o que o campo de duração à medida serve.
   */
  async actualizarPlano(id: string, entrada: Partial<EntradaDoPlano>) {
    const existe = await prisma.plan.findUnique({ where: { id } });
    if (!existe) throw new AppError('Plano não encontrado.', 404, 'PLAN_NOT_FOUND');

    const nome = entrada.nome?.trim();

    return prisma.plan.update({
      where: { id },
      data: {
        ...(nome ? { name: nome } : {}),
        ...(entrada.duracaoDias !== undefined ? { durationDays: entrada.duracaoDias } : {}),
        ...(entrada.preco !== undefined ? { price: entrada.preco } : {}),
        ...(entrada.funcionalidades !== undefined
          ? { features: normalizarFuncionalidades(entrada.funcionalidades) }
          : {}),
        ...(entrada.notas !== undefined ? { notes: entrada.notas?.trim() || null } : {}),
        ...(entrada.activo !== undefined ? { active: entrada.activo } : {}),
      },
    });
  }

  /**
   * Arquiva um plano — não o apaga.
   *
   * Apagar punha a `plan_id` das frotas que o tinham a nulo (é o que a chave
   * estrangeira manda fazer) e perdia-se o registo do que elas compraram.
   * Arquivado, deixa de aparecer para vender e continua a valer para quem o
   * tem.
   */
  async arquivarPlano(id: string) {
    const existe = await prisma.plan.findUnique({ where: { id } });
    if (!existe) throw new AppError('Plano não encontrado.', 404, 'PLAN_NOT_FOUND');
    return prisma.plan.update({ where: { id }, data: { active: false } });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Pedidos de plano
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Os clientes que pediram mais do que têm.
   *
   * Os que estão à espera primeiro, e dentro desses os mais antigos à frente:
   * quem pediu há três dias e ainda não teve resposta é quem está mais perto
   * de desistir.
   */
  async listarPedidos(incluirFechados = false) {
    const pedidos = await prisma.planRequest.findMany({
      where: incluirFechados ? {} : { status: 'OPEN' },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: {
        fleet: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true, price: true, durationDays: true } },
      },
      take: 200,
    });

    return pedidos.map((p) => ({
      id: p.id,
      estado: p.status,
      frota: { id: p.fleet.id, nome: p.fleet.name, slug: p.fleet.slug },
      // Nulo quer dizer "personalizado": não quis nenhum dos que estão à venda.
      plano: p.plan
        ? {
          id: p.plan.id,
          nome: p.plan.name,
          preco: p.plan.price.toString(),
          duracaoDias: p.plan.durationDays,
        }
        : null,
      mensagem: p.message,
      pedidoPor: p.requestedByName,
      resolucao: p.resolution,
      criadoEm: p.createdAt,
      fechadoEm: p.resolvedAt,
    }));
  }

  /**
   * Fecha um pedido, com uma nota.
   *
   * Não apaga: é o histórico comercial da conta. Daqui a um ano, a pergunta
   * "porque é que este cliente está neste preço" tem resposta escrita.
   *
   * Mudar o plano da frota NÃO acontece aqui. É um passo à parte, na tela das
   * Frotas, e de propósito: fechar o pedido é dizer que a conversa acabou;
   * mudar o plano é cobrar a alguém. Juntá-los dava um clique a fazer as duas
   * coisas, e uma delas sem querer.
   */
  async fecharPedido(id: string, estado: 'DONE' | 'DISMISSED', nota?: string | null) {
    const { count } = await prisma.planRequest.updateMany({
      where: { id, status: 'OPEN' },
      data: {
        status: estado,
        resolution: nota?.trim() || null,
        resolvedAt: new Date(),
      },
    });

    if (count === 0) {
      throw new AppError(
        'Pedido não encontrado, ou já estava fechado.',
        404, 'PEDIDO_NAO_ENCONTRADO',
      );
    }
    return { ok: true };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // O resto
  // ──────────────────────────────────────────────────────────────────────────

  /** O catálogo das caixas do editor de planos. Ver `funcionalidades.ts`. */
  catalogo() {
    return {
      funcionalidades: FUNCIONALIDADES,
      grupos: GRUPOS_DE_FUNCIONALIDADES,
      obrigatorias: OBRIGATORIAS,
    };
  }

  /**
   * Os quatro números do topo do painel.
   *
   * As assinaturas a acabar primeiro, porque são a única coisa aqui que tem
   * prazo: um cliente expirado é um cliente trancado à espera de telefonar.
   */
  async resumo() {
    const [frotas, pedidos, contactos] = await Promise.all([
      prisma.fleet.findMany({ select: { active: true, subscriptionEndsOn: true } }),
      prisma.planRequest.count({ where: { status: 'OPEN' } }),
      prisma.lead.count({ where: { status: 'NOVO' } }),
    ]);

    let aExpirar = 0;
    let expiradas = 0;
    for (const f of frotas) {
      const s = situacao(f.subscriptionEndsOn);
      if (s.estado === 'termina_em_breve') aExpirar += 1;
      if (s.estado === 'expirada') expiradas += 1;
    }

    return {
      frotas: frotas.length,
      activas: frotas.filter((f) => f.active).length,
      aExpirar,
      expiradas,
      pedidos,
      contactos,
    };
  }
}

export const systemService = new SystemService();
