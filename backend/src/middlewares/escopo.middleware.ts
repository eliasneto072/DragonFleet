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
    const u = await comoSistema(() => prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        fleetId: true,
        isOwner: true,
        fleet: { select: { name: true, active: true } },
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
    };

    // Tudo o que vier a seguir — middlewares, rotas, serviços, e o que eles
    // esperarem — corre dentro desta frota. É o `next()` lá dentro que faz a
    // cadeia inteira herdar o âmbito.
    return comFrota(u.fleetId, () => next());
  } catch (erro) {
    return next(erro);
  }
}
