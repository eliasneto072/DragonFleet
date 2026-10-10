// src/middlewares/dono.middleware.ts
//
// A porta do painel de sistema: só o dono da plataforma entra.
//
// ─── PORQUE É QUE `requireAdmin` NÃO SERVIA AQUI ────────────────────────────
//
// Porque a partir da fase 1 cada frota cliente tem o ADMIN dela. Um
// administrador é a pessoa com todas as chaves de UMA casa; o dono da
// plataforma é quem tem a lista das casas. Se esta porta aceitasse ADMIN,
// qualquer cliente abria a lista dos outros clientes — que é precisamente a
// coisa que a fase 1 existiu para impedir.
//
// Então a marca é outra e vive no utilizador: `isOwner`. Não é um papel por
// cima do papel dele (ver a nota no `schema.prisma`): ele continua a ser o
// administrador da frota dele, e isto só lhe abre esta porta.
//
// ─── E PORQUE É QUE NÃO VEM DO TOKEN ────────────────────────────────────────
//
// Pela mesma razão que as permissões e a frota: já foi lida da base de dados
// neste pedido, pelo `escopoDaFrota`, e está em `req.frota`. Reaproveitá-la
// não custa uma consulta e, mais importante, é a MESMA leitura — não há aqui
// uma segunda fonte de verdade capaz de discordar da primeira.

import type { Response, NextFunction } from 'express';
import type { PedidoComFrota } from './escopo.middleware';
import { comoDono } from '../config/escopo';
import { AppError } from '../shared/errors/AppError';

/**
 * Exige a marca de dono da plataforma E põe o pedido em modo de dono.
 *
 * As duas coisas juntas de propósito. Separadas, haveria uma forma de escrever
 * uma rota deste módulo que atravessa frotas sem passar pela guarda — e
 * bastava esquecer uma linha numa rota nova.
 *
 * ─── O `await` É AQUI DENTRO ────────────────────────────────────────────────
 *
 * Ver a nota em `config/escopo.ts`: uma consulta do Prisma criada dentro do
 * contexto mas esperada fora dele corre sem contexto nenhum. É `comoDono` que
 * trata disso, e o `await` aqui serve para um erro atirado lá em baixo voltar
 * a este `try` em vez de ficar numa promessa que ninguém apanha.
 */
export async function painelDoDono(
  req: PedidoComFrota,
  _res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user?.id) {
      return next(new AppError('Unauthenticated', 401, 'UNAUTHENTICATED'));
    }

    if (!req.frota?.isOwner) {
      // A mesma resposta que qualquer outra área negada, e de propósito: quem
      // não é dono não tem de aprender daqui que este painel existe.
      return next(new AppError('Acesso restrito.', 403, 'FORBIDDEN'));
    }

    return await comoDono(() => { next(); });
  } catch (erro) {
    return next(erro);
  }
}
