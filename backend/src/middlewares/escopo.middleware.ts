// src/middlewares/escopo.middleware.ts
//
// Põe cada pedido dentro da frota de quem o fez.
//
// ─── ONDE ENTRA ─────────────────────────────────────────────────────────────
//
// Logo a seguir ao `authMiddleware` e antes de tudo o resto. A partir daqui, as
// consultas deste pedido já sabem a frota — e as que não souberem rebentam, que
// é o que se quer (ver `escopo.ts`).
//
// ─── PORQUE É QUE A FROTA NÃO VEM DO TOKEN ──────────────────────────────────
//
// Pelo mesmo motivo das permissões por área e da oficina do mecânico: com ela
// no token, desligar uma frota ou mudar alguém de frota só fazia efeito quando
// a sessão dele expirasse — e é precisamente nessa altura que não se quer
// esperar. Uma consulta indexada por pedido é o preço, e é o mesmo preço que o
// resto do sistema já paga.
//
// ─── O QUE ACONTECE A UMA FROTA DESLIGADA ───────────────────────────────────
//
// Ninguém dela entra. Não é uma tela bonita: é 403 em tudo o que não seja sair.
// A assinatura expirada é outra coisa — essa tranca o gestor e deixa os
// motoristas a ler, e vive na fase 4.

import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.middleware';
import { prisma } from '../config/prisma';
import { comFrota, comoSistema } from '../config/escopo';
import { AppError } from '../shared/errors/AppError';
import { capacidadeDaFrota, type Capacidade } from '../modules/system/capacidade';
import { idDaFrotaDaCasa } from '../config/arranque';

/**
 * A frota e a marca de dono, lidas da base de dados.
 *
 * Vive a seguir ao `user` do pedido para que o resto do código não tenha de
 * voltar a perguntar.
 */
export interface DadosDaFrota {
  fleetId: string;
  fleetName: string;
  fleetActive: boolean;
  isOwner: boolean;
  /**
   * É a frota da própria casa, e não a de um cliente.
   *
   * Diferente de `isOwner`: aquilo é sobre a PESSOA (só ele tem a marca), isto
   * é sobre a FROTA. Uma conta de investidor dele não é dona de nada e está na
   * frota da casa na mesma — e é por isso que as áreas de investimento olham
   * para esta e não para aquela.
   */
  daCasa: boolean;
  /**
   * O que esta frota comprou e se ainda pode escrever — ver `capacidade.ts`.
   *
   * Lida AQUI, na mesma consulta que já ia buscar a frota, e não num sítio
   * qualquer mais à frente. Duas razões: não custa um pedido extra, e deixa de
   * haver forma de uma rota correr sem a pergunta ter sido feita.
   */
  capacidade: Capacidade;
}

/**
 * A frota fica no próprio pedido, ao lado do `user`.
 *
 * Declarada no `AuthRequest` do projeto e não por aumento do tipo do Express:
 * é o padrão que o resto do código já segue, e não depende de os tipos do
 * Express estarem instalados para compilar.
 */
export interface PedidoComFrota extends AuthRequest {
  frota?: DadosDaFrota;
}

export async function escopoDaFrota(
  req: PedidoComFrota,
  _res: Response,
  next: NextFunction,
) {
  try {
    // Sem sessão identificada não há frota a definir. A rota por baixo trata
    // disso: ou exige autenticação e responde 401 sozinha, ou é pública de
    // propósito — e as públicas que leem a base de dados declaram
    // `comoSistema()` elas próprias (o login, por exemplo).
    if (!req.user?.id) return next();

    // Esta leitura é a única que corre ANTES de haver frota, e por isso é a
    // única que tem de a atravessar. Lê um utilizador pelo id — não uma lista.
    const u = await comoSistema(async () => await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        fleetId: true,
        isOwner: true,
        fleet: {
          select: {
            name: true,
            active: true,
            subscriptionEndsOn: true,
            plan: { select: { features: true } },
          },
        },
      },
    }));

    if (!u) throw new AppError('Sessão inválida.', 401, 'UNAUTHENTICATED');

    if (!u.fleet?.active) {
      throw new AppError(
        'Esta frota está desligada. Fale com a administração da plataforma.',
        403,
        'FLEET_INACTIVE',
      );
    }

    req.frota = {
      fleetId: u.fleetId,
      fleetName: u.fleet.name,
      fleetActive: u.fleet.active,
      isOwner: u.isOwner,
      daCasa: u.fleetId === await idDaFrotaDaCasa(),
      capacidade: capacidadeDaFrota({
        features: u.fleet.plan?.features ?? null,
        subscriptionEndsOn: u.fleet.subscriptionEndsOn,
      }),
    };

    // Tudo o que vier a seguir — middlewares, rotas, serviços, e o que eles
    // esperarem — corre dentro desta frota. É o `next()` lá dentro que faz a
    // cadeia inteira herdar o âmbito.
    //
    // O `await` mantém o `try/catch` útil: um erro atirado em baixo volta aqui
    // em vez de ficar numa promessa que ninguém apanha.
    return await comFrota(u.fleetId, () => { next(); });
  } catch (erro) {
    return next(erro);
  }
}

/**
 * Repõe a frota depois de um middleware ter lido o corpo do pedido.
 *
 * ─── PORQUE É QUE ISTO PRECISA DE EXISTIR ───────────────────────────────────
 *
 * O `escopoDaFrota` acima envolve o `next()` numa frota, e tudo o que corre a
 * seguir herda-a — enquanto correr dentro dessa cadeia. O multer não corre.
 *
 * O multer lê o corpo do pedido e só chama o `next()` no fim, de dentro de um
 * evento do stream. Esse stream é o `req`, criado pelo servidor de HTTP ANTES
 * de qualquer middleware, portanto fora da frota. O Node repõe o contexto de
 * quem criou o recurso, não o de quem estava a correr quando o evento foi
 * ligado — e o resto do pedido continua sem frota nenhuma.
 *
 * O resultado via-se assim, no Render:
 *
 *   ErroDeEscopo: SettlementQuery.findFirst correu fora de qualquer frota.
 *
 * Isto é reproduzível em vinte linhas só com o Node, sem express nem multer:
 * ver `escopo-multipart.test.ts`.
 *
 * ─── PORQUE É QUE REPOR É SEGURO ────────────────────────────────────────────
 *
 * Porque a frota não vem do contexto perdido: vem do `req.frota`, que é uma
 * propriedade do objecto do pedido e não depende de contexto nenhum. Já foi
 * decidida e verificada em cima — aqui só se volta a entrar nela.
 *
 * E se não houver `req.frota`, isto não inventa nenhuma: segue em frente e
 * deixa a guarda do Prisma atirar. Um middleware que adivinha frotas é pior
 * do que um erro.
 */
export function reporFrota(
  req: PedidoComFrota,
  _res: Response,
  next: NextFunction,
) {
  const fleetId = req.frota?.fleetId;
  if (!fleetId) return next();
  return comFrota(fleetId, () => { next(); }).catch(next);
}
