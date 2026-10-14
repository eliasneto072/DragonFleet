// src/middlewares/pessoal.middleware.ts
//
// Fecha as rotas das finanças pessoais a quem não tem a marca ligada.
//
// ─── PORQUE É QUE A MARCA É LIDA DA BASE E NÃO DO TOKEN ─────────────────────
//
// Porque um token dura dias. Posta no token, a marca ficava a valer até ao
// próximo início de sessão: desligá-la numa conta não a desligava de facto, e
// quem a tivesse continuava a entrar durante todo esse tempo. Uma permissão
// que não se consegue retirar na hora não é uma permissão.
//
// Custa uma consulta por pedido, por um id com índice primário. É barato, e o
// que compra é poder desligar isto a qualquer momento e ter efeito já.
//
// ─── PORQUE É QUE UM ADMINISTRADOR NÃO PASSA AQUI ───────────────────────────
//
// Porque não há papel nenhum nesta aplicação que justifique ler as despesas
// pessoais e as perdas na bolsa de outra pessoa. No resto do sistema um
// administrador vê os dados dos motoristas dele, e é o trabalho dele; aqui
// não. A marca é por conta, e cada conta vê só a sua.

import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.middleware';
import { prisma } from '../config/prisma';

export async function exigeFinancasPessoais(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user?.id) {
    return res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Precisa de iniciar sessão.' },
    });
  }

  const conta = await prisma.user.findFirst({
    where: { id: req.user.id },
    select: { personalFinance: true },
  });

  if (!conta?.personalFinance) {
    // 404 e não 403, de propósito.
    //
    // Um 403 confirma que a funcionalidade existe e que a conta não a tem.
    // Como esta parte é de uma pessoa só, vale mais que, para todos os outros,
    // ela simplesmente não exista — não há nada para procurar nem para pedir.
    return res.status(404).json({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Não encontrado.' },
    });
  }

  return next();
}
