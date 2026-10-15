// src/modules/settlements/pedidos.service.ts
//
// Os pedidos de esclarecimento sobre uma linha do fecho semanal.
//
// ─── QUEM FAZ O QUÊ ─────────────────────────────────────────────────────────
//
// O MOTORISTA pede, e só sobre fechos dele. A verificação é por `userId` do
// fecho e não pelo papel: um motorista com permissão de ver tudo (acontece, há
// quem seja motorista e gestor) continua a só poder perguntar sobre o dinheiro
// dele — perguntar pelo colega não quer dizer nada.
//
// A GESTÃO responde, com um texto, um ficheiro, ou os dois. Responder fecha o
// pedido. Não há "rejeitar": uma dúvida sobre dinheiro responde-se.
//
// ─── PORQUE É QUE A RESPOSTA NÃO APAGA O PEDIDO ─────────────────────────────
//
// Porque o valor disto é o histórico. Da próxima vez que a mesma pergunta
// aparecer — e aparece, todas as semanas tem portagens — a resposta e o
// extrato estão lá, agarrados àquela semana. Apagar deixava só o trabalho.

import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/AppError';
import { UserRole } from '../../shared/types/enums';
import {
  etiquetaDaLinha, linhaConhecida, linhasQuestionaveis, podePedir, respostaCompleta,
  MAXIMO_DE_ABERTOS_POR_FECHO,
} from './pedidos';
import type { PedidoExistente, ValoresDoFecho } from './pedidos';
import { avisar, avisarGestao } from '../../shared/services/avisos';

export type Actor = { id: string; role?: UserRole };

/** Quem responde. O SUPPORT vê fechos, mas responder é dar uma garantia. */
function podeResponder(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

/** Quem vê a fila toda. O SUPPORT entra: é a ele que a pergunta chega. */
function podeVerTudo(role?: UserRole) {
  return role === UserRole.ADMIN
      || role === UserRole.MANAGER
      || role === UserRole.SUPPORT;
}

function texto(v: string | null | undefined, max: number): string | null {
  const t = (v ?? '').trim();
  return t ? t.slice(0, max) : null;
}

/** Os campos do fecho de que a decisão «que linhas é que dão para pedir» vive. */
const CAMPOS_DO_FECHO = {
  id: true, userId: true, weekStart: true, weekEnd: true, status: true,
  tollsAmount: true, fuelAmount: true, chargeAmount: true, vehicleFee: true,
  otherDeductions: true, taxAmount: true, commissionAmount: true,
  uberAmount: true, boltAmount: true,
} as const;

type FechoLido = {
  id: string; userId: string; weekStart: Date; weekEnd: Date; status: string;
} & Record<string, unknown>;

/** Decimal do Prisma → número. Nulo fica nulo, para a linha contar como zero. */
function valores(fecho: Record<string, unknown>): ValoresDoFecho {
  const out: ValoresDoFecho = {};
  for (const campo of Object.keys(CAMPOS_DO_FECHO)) {
    if (campo === 'id' || campo === 'userId' || campo === 'status') continue;
    const v = fecho[campo];
    if (v === null || v === undefined) { out[campo] = null; continue; }
    const n = Number(v);
    out[campo] = Number.isFinite(n) ? n : null;
  }
  return out;
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

function publico(p: {
  id: string; line: string; reason: string | null; status: string;
  answer: string | null; fileUrl: string | null;
  answeredAt: Date | null; createdAt: Date;
  user?: { id: string; name: string } | null;
  answeredBy?: { name: string } | null;
  settlement?: { id: string; weekStart: Date; weekEnd: Date } | null;
}) {
  return {
    id: p.id,
    linha: p.line,
    etiqueta: etiquetaDaLinha(p.line),
    motivo: p.reason,
    estado: p.status,
    resposta: p.answer,
    ficheiro: p.fileUrl,
    respondidoEm: p.answeredAt?.toISOString() ?? null,
    respondidoPor: p.answeredBy?.name ?? null,
    criadoEm: p.createdAt.toISOString(),
    ...(p.user ? { motorista: { id: p.user.id, nome: p.user.name } } : {}),
    ...(p.settlement
      ? {
          fecho: {
            id: p.settlement.id,
            semanaInicio: dia(p.settlement.weekStart),
            semanaFim: dia(p.settlement.weekEnd),
          },
        }
      : {}),
  };
}

const INCLUI = {
  user: { select: { id: true, name: true } },
  answeredBy: { select: { name: true } },
  settlement: { select: { id: true, weekStart: true, weekEnd: true } },
} as const;

export class PedidosService {
  /** O fecho, com a verificação de quem o pode ver. */
  private async fechoDoActor(actor: Actor, settlementId: string): Promise<FechoLido> {
    const fecho = await prisma.weeklySettlement.findFirst({
      where: { id: settlementId },
      select: CAMPOS_DO_FECHO,
    });
    if (!fecho) throw new AppError('Fecho não encontrado.', 404, 'SETTLEMENT_NOT_FOUND');

    if (!podeVerTudo(actor.role) && fecho.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    return fecho as unknown as FechoLido;
  }

  /**
   * Os pedidos de um fecho, e que linhas é que ainda dão para pedir.
   *
   * As duas coisas no mesmo pedido de propósito: a tela precisa das duas ao
   * mesmo tempo, e separá-las dava um instante em que os botões estavam todos
   * disponíveis porque a lista de pedidos ainda não tinha chegado.
   */
  async doFecho(actor: Actor, settlementId: string) {
    const fecho = await this.fechoDoActor(actor, settlementId);

    const pedidos = await prisma.settlementQuery.findMany({
      where: { settlementId },
      orderBy: [{ createdAt: 'desc' }],
      include: INCLUI,
    });

    const existentes: PedidoExistente[] = pedidos.map((p) => ({
      line: p.line, status: p.status,
    }));

    return {
      pedidos: pedidos.map(publico),
      linhas: linhasQuestionaveis(valores(fecho), existentes),
      // O próprio motorista é que pede. A gestão vê a lista e responde.
      podePedir: fecho.userId === actor.id,
      maximoDeAbertos: MAXIMO_DE_ABERTOS_POR_FECHO,
    };
  }

  /**
   * O motorista pede esclarecimento sobre uma linha.
   *
   * Não há prazo. Foi uma decisão dele: «sim, sempre» — a dúvida sobre um valor
   * aparece tarde, ao olhar para o saldo ao fim do mês ou a comparar duas
   * semanas, e fechar a porta depois de a semana estar paga empurrava a
   * conversa de volta para o WhatsApp.
   */
  async criar(actor: Actor, settlementId: string, entrada: { line: string; reason?: string | null }) {
    const fecho = await this.fechoDoActor(actor, settlementId);

    // Só sobre o dinheiro dele. Nem o ADMIN pede pelo motorista: um pedido
    // feito por outra pessoa criava uma pergunta que ninguém fez.
    if (fecho.userId !== actor.id) {
      throw new AppError(
        'Só podes pedir esclarecimento sobre os teus fechos.',
        403, 'NOT_OWN_SETTLEMENT',
      );
    }

    const linha = entrada.line;
    if (!linhaConhecida(linha)) {
      throw new AppError('Essa linha do fecho não existe.', 400, 'UNKNOWN_LINE');
    }

    const abertos = await prisma.settlementQuery.findMany({
      where: { settlementId },
      select: { line: true, status: true },
    });

    const veredicto = podePedir(valores(fecho), linha, abertos);
    if (!veredicto.pode) {
      throw new AppError(veredicto.motivo ?? 'Não é possível pedir sobre esta linha.',
        409, 'QUERY_NOT_ALLOWED');
    }

    try {
      const criado = await prisma.settlementQuery.create({
        data: {
          settlementId,
          userId: actor.id,
          line: linha,
          reason: texto(entrada.reason, 1000),
        },
        include: INCLUI,
      });

      // A gestão tem de saber que há uma pergunta à espera. Sem isto, o
      // motorista pergunta e fica à espera de alguém que não sabe que ele
      // perguntou — e ao fim de dois dias liga a perguntar pela pergunta.
      await avisarGestao({
        titulo: `Novo pedido de esclarecimento: ${etiquetaDaLinha(linha)}`,
        mensagem: texto(entrada.reason, 1000)
          ?? 'Sem motivo escrito — ver o fecho da semana.',
      });

      return publico(criado);
    } catch (erro: unknown) {
      // O índice único PARCIAL da base. Duas pessoas — ou dois toques no botão
      // — chegam aqui ao mesmo tempo e passam as duas pela verificação acima.
      // É a base que decide, e o que o motorista lê é uma frase e não um 500.
      if ((erro as { code?: string })?.code === 'P2002') {
        throw new AppError(
          'Já pediste esclarecimento sobre esta linha. Está à espera de resposta.',
          409, 'QUERY_ALREADY_OPEN',
        );
      }
      throw erro;
    }
  }

  /** A fila: o que está por responder, em toda a frota. */
  async listar(actor: Actor, filtro: { status?: string } = {}) {
    if (!podeVerTudo(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const estado: 'ABERTO' | 'RESPONDIDO' | undefined =
      filtro.status === 'RESPONDIDO' || filtro.status === 'ABERTO'
        ? filtro.status
        : undefined;

    const pedidos = await prisma.settlementQuery.findMany({
      where: { ...(estado ? { status: estado } : {}) },
      // Os abertos primeiro, e dentro deles o mais antigo no topo: é a ordem em
      // que se despacha uma fila. Pela data de criação decrescente, o pedido
      // que espera há duas semanas ficava no fim.
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 300,
      include: INCLUI,
    });

    return { pedidos: pedidos.map(publico) };
  }

  /** Os meus, de todas as semanas. Para o motorista ver o que já perguntou. */
  async meus(actor: Actor) {
    const pedidos = await prisma.settlementQuery.findMany({
      where: { userId: actor.id },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
      include: INCLUI,
    });
    return { pedidos: pedidos.map(publico) };
  }

  /**
   * A gestão responde, e com isso fecha o pedido.
   *
   * O ficheiro é opcional — há dúvidas que se esclarecem com uma frase, e
   * exigir um anexo só obrigava a inventar um. O que NÃO é opcional é dizer
   * alguma coisa: sem texto nem ficheiro, marcar como respondido era fechar o
   * pedido sem responder.
   */
  async responder(
    actor: Actor,
    id: string,
    entrada: { answer?: string | null; fileUrl?: string | null; fileKey?: string | null },
  ) {
    if (!podeResponder(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    const pedido = await prisma.settlementQuery.findFirst({
      where: { id },
      select: {
        id: true, line: true, status: true, userId: true,
        settlement: { select: { weekStart: true, weekEnd: true } },
      },
    });
    if (!pedido) throw new AppError('Pedido não encontrado.', 404, 'QUERY_NOT_FOUND');

    const answer = texto(entrada.answer, 4000);
    const fileUrl = texto(entrada.fileUrl, 1000);

    if (!respostaCompleta({ answer, fileUrl })) {
      throw new AppError(
        'Escreve uma resposta ou anexa o extrato.',
        400, 'ANSWER_REQUIRED',
      );
    }

    const actualizado = await prisma.settlementQuery.update({
      where: { id },
      data: {
        answer,
        fileUrl,
        fileKey: texto(entrada.fileKey, 500),
        status: 'RESPONDIDO',
        answeredById: actor.id,
        answeredAt: new Date(),
      },
      include: INCLUI,
    });

    // A notificação é o ponto todo: sem ela, ele só sabe que foi respondido se
    // for lá ver — e quem não sabe que há resposta volta a perguntar.
    try {
      await avisar(pedido.userId, {
        titulo: `Resposta sobre ${etiquetaDaLinha(pedido.line)}`,
        mensagem:
          `Semana de ${dia(pedido.settlement.weekStart)} a ${dia(pedido.settlement.weekEnd)}: `
          + (answer ?? 'o extrato está anexado no detalhe da semana.'),
      });
    } catch (erro) {
      console.error('[pedidos] falhou a notificação da resposta', erro);
    }

    return publico(actualizado);
  }

  /**
   * O motorista retira um pedido.
   *
   * Só os ABERTOS e só os dele. Um pedido já respondido não se apaga: a
   * resposta e o extrato ficam, e é esse o valor disto.
   */
  async retirar(actor: Actor, id: string) {
    const pedido = await prisma.settlementQuery.findFirst({
      where: { id }, select: { id: true, userId: true, status: true },
    });
    if (!pedido) throw new AppError('Pedido não encontrado.', 404, 'QUERY_NOT_FOUND');

    if (pedido.userId !== actor.id) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    if (pedido.status !== 'ABERTO') {
      throw new AppError(
        'Este pedido já foi respondido. A resposta fica no detalhe da semana.',
        409, 'ALREADY_ANSWERED',
      );
    }

    await prisma.settlementQuery.delete({ where: { id } });
  }
}

export const pedidosService = new PedidosService();
