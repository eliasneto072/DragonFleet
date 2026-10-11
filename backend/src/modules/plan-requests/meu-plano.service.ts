// src/modules/plan-requests/meu-plano.service.ts
//
// O lado do CLIENTE: que plano tenho, que planos há, e pedir outro.
//
// ─── PORQUE É QUE ISTO É UM MÓDULO À PARTE DO `system` ──────────────────────
//
// Porque são dois pontos de vista do mesmo assunto e com guardas opostas. O
// `system` é o painel do dono: atravessa frotas e só ele entra. Isto corre
// DENTRO de uma frota, e quem entra é o administrador dela — o cliente.
//
// Juntá-los num ficheiro era pôr, lado a lado, a função que lista todas as
// frotas e a função que um cliente chama. Mais cedo ou mais tarde alguém
// chamava a errada.
//
// ─── O QUE UM CLIENTE PODE VER DOS PLANOS ───────────────────────────────────
//
// Os que estão À VENDA — nome, preço, duração e o que incluem — e o dele,
// mesmo que já esteja arquivado. Nada mais: nem quantas frotas têm cada plano,
// nem as notas internas, que são as tuas anotações comerciais.

import { prisma } from '../../config/prisma';
import { comoSistema } from '../../config/escopo';
import { AppError } from '../../shared/errors/AppError';
import { situacao } from '../system/assinatura';
import { FUNCIONALIDADES, normalizarFuncionalidades } from '../system/funcionalidades';

/** Um plano, como o cliente o vê. Sem as notas internas. */
export interface PlanoParaCliente {
  id: string;
  nome: string;
  duracaoDias: number;
  preco: string;
  funcionalidades: string[];
  /** É o plano que esta frota tem agora. */
  oMeu: boolean;
  /**
   * O que este plano acrescenta ao actual. Vazio quando não acrescenta nada
   * — e aí não vale a pena mostrá-lo como melhoria.
   */
  acrescenta: { codigo: string; nome: string }[];
}

export interface MeuPlano {
  frota: { nome: string };
  atual: {
    nome: string | null;
    preco: string | null;
    duracaoDias: number | null;
    funcionalidades: string[];
    terminaEm: string | null;
    assinatura: { estado: string; dias: number | null };
  };
  disponiveis: PlanoParaCliente[];
  /** O pedido que ainda está à espera de resposta, se houver. */
  pedidoAberto: {
    id: string; planoNome: string | null; mensagem: string | null; criadoEm: Date;
  } | null;
}

const NOME = new Map(FUNCIONALIDADES.map((f) => [f.codigo, f.nome]));

export class MeuPlanoService {
  /**
   * O plano desta frota e os que há para escolher.
   *
   * ─── A LISTA DOS PLANOS ATRAVESSA FROTAS, E TEM DE SER ────────────────────
   *
   * Os planos são da plataforma e não de ninguém — estão em `MODELOS_GLOBAIS`,
   * por isso a camada do âmbito deixa-os passar sem filtro. É deliberado: um
   * cliente que não visse os outros planos não tinha nada para escolher.
   *
   * O que ele NÃO vê são as frotas que os usam nem as tuas notas: isto devolve
   * campo a campo em vez da linha inteira, e é essa escolha que o garante.
   */
  async ver(fleetId: string): Promise<MeuPlano> {
    const frota = await comoSistema(async () => await prisma.fleet.findUnique({
      where: { id: fleetId },
      select: {
        name: true, subscriptionEndsOn: true,
        plan: {
          select: { id: true, name: true, price: true, durationDays: true, features: true },
        },
      },
    }));
    if (!frota) throw new AppError('Frota não encontrada.', 404, 'FLEET_NOT_FOUND');

    const meus = frota.plan
      ? normalizarFuncionalidades(frota.plan.features)
      // Sem plano, tem tudo — ver `capacidade.ts`. Aqui isso quer dizer que
      // não há nada a acrescentar, e a página vai dizê-lo.
      : FUNCIONALIDADES.map((f) => f.codigo);
    const jaTenho = new Set(meus);

    const planos = await prisma.plan.findMany({
      where: { active: true },
      orderBy: [{ price: 'asc' }],
      select: { id: true, name: true, price: true, durationDays: true, features: true },
    });

    const pedido = await prisma.planRequest.findFirst({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { name: true } } },
    });

    return {
      frota: { nome: frota.name },
      atual: {
        nome: frota.plan?.name ?? null,
        preco: frota.plan?.price.toString() ?? null,
        duracaoDias: frota.plan?.durationDays ?? null,
        funcionalidades: meus,
        terminaEm: frota.subscriptionEndsOn
          ? frota.subscriptionEndsOn.toISOString().slice(0, 10)
          : null,
        assinatura: (() => {
          const s = situacao(frota.subscriptionEndsOn);
          return { estado: s.estado, dias: s.dias };
        })(),
      },
      disponiveis: planos.map((p) => {
        const dele = normalizarFuncionalidades(p.features);
        return {
          id: p.id,
          nome: p.name,
          duracaoDias: p.durationDays,
          preco: p.price.toString(),
          funcionalidades: dele,
          oMeu: p.id === frota.plan?.id,
          // O que ACRESCENTA, e não a lista toda: é a pergunta que o cliente
          // tem na cabeça quando chega aqui depois de bater num cadeado.
          acrescenta: dele
            .filter((c) => !jaTenho.has(c))
            .map((c) => ({ codigo: c, nome: NOME.get(c) ?? c })),
        };
      }),
      pedidoAberto: pedido
        ? {
          id: pedido.id,
          planoNome: pedido.plan?.name ?? null,
          mensagem: pedido.message,
          criadoEm: pedido.createdAt,
        }
        : null,
    };
  }

  /**
   * Registar um pedido.
   *
   * ─── UM DE CADA VEZ ─────────────────────────────────────────────────────────
   *
   * Com um pedido já aberto, não se abre outro — altera-se esse. Sem isto, um
   * cliente indeciso enchia a tua lista com cinco linhas da mesma conversa, e
   * a lista deixava de dizer quantos clientes estão à espera para passar a
   * dizer quantas vezes alguém carregou no botão.
   */
  async pedir(
    actorId: string,
    entrada: { planoId?: string | null; mensagem?: string | null },
  ) {
    const planoId = entrada.planoId || null;

    if (planoId) {
      const existe = await prisma.plan.findUnique({
        where: { id: planoId }, select: { id: true, active: true },
      });
      // Um plano arquivado não se pede: deixou de estar à venda de propósito.
      if (!existe?.active) {
        throw new AppError('Esse plano não está disponível.', 404, 'PLAN_NOT_FOUND');
      }
    }

    const mensagem = entrada.mensagem?.trim() || null;

    if (!planoId && !mensagem) {
      throw new AppError(
        'Escolha um plano ou escreva o que precisa.',
        400, 'PEDIDO_VAZIO',
      );
    }

    // O nome de quem pede é LIDO, e não recebido no corpo. É o que a tua
    // lista mostra para saberes com quem falar, e não é algo que quem pede
    // deva poder escrever — guardado como texto, fica igual mesmo que a conta
    // dele mude de nome ou desapareça.
    const quem = await prisma.user.findUnique({
      where: { id: actorId }, select: { name: true },
    });

    const aberto = await prisma.planRequest.findFirst({
      where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' },
    });

    if (aberto) {
      await prisma.planRequest.updateMany({
        where: { id: aberto.id },
        data: {
          planId: planoId,
          message: mensagem,
          requestedBy: actorId,
          requestedByName: quem?.name ?? null,
        },
      });
      return { id: aberto.id, actualizado: true };
    }

    const novo = await prisma.planRequest.create({
      data: {
        planId: planoId,
        message: mensagem,
        requestedBy: actorId,
        requestedByName: quem?.name ?? null,
      },
      select: { id: true },
    });

    return { id: novo.id, actualizado: false };
  }

  /** O cliente desistiu. Apaga-se, porque nunca chegou a ser uma conversa. */
  async cancelar(id: string) {
    const { count } = await prisma.planRequest.deleteMany({
      where: { id, status: 'OPEN' },
    });
    if (count === 0) {
      throw new AppError('Pedido não encontrado.', 404, 'PEDIDO_NAO_ENCONTRADO');
    }
    return { ok: true };
  }
}

export const meuPlanoService = new MeuPlanoService();
