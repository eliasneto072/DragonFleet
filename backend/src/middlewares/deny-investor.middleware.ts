// src/middlewares/deny-investor.middleware.ts
//
// O muro entre o portal do investidor e a frota.
//
// ─── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
//
// Um investidor é alguém de FORA da empresa. Não pode ver nomes de motoristas,
// faturação, fechos, matrículas, documentos, tickets — nada. Esconder menus no
// site não chega: quem abrir a consola do browser chama a API na mesma, e uma
// conta de investidor com um token válido passaria em todas as rotas que só
// pedem "estar autenticado" (que são quase todas — foram escritas quando só
// existiam motoristas e administração).
//
// ─── LISTA BRANCA, NÃO LISTA NEGRA ──────────────────────────────────────────
//
// Por isso isto está ao contrário do habitual: em vez de dizer onde o
// investidor NÃO pode entrar, diz os dois únicos sítios onde pode. Tudo o que
// for acrescentado ao projeto a partir de hoje nasce fechado a estas contas,
// sem ninguém se lembrar de o proteger. É a diferença entre uma rota nova
// esquecida ser segura por omissão ou ser uma fuga.
//
// ─── PORQUE É QUE LÊ O TOKEN OUTRA VEZ ──────────────────────────────────────
//
// Corre ANTES dos routers da frota, e é dentro deles que o `authMiddleware`
// preenche o `req.user`. Aqui ainda não há `req.user`, por isso o token é lido
// à parte. Um token ausente ou inválido passa em frente sem decisão nenhuma —
// as rotas a seguir têm a sua própria autenticação e é lá que são recusados.
// Este middleware só sabe responder a uma pergunta: "isto é um investidor?".

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserRole } from '../shared/types/enums';

export function denyInvestor(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  let role: UserRole | undefined;
  try {
    const payload = jwt.verify(header.slice('Bearer '.length), env.JWT_SECRET) as { role?: UserRole };
    role = payload.role;
  } catch {
    // Token estragado ou expirado: não é trabalho deste middleware. Segue, e
    // a rota a seguir devolve 401.
    return next();
  }

  if (role === UserRole.INVESTOR) {
    return res.status(403).json({
      ok: false,
      code: 'INVESTOR_SCOPE',
      message: 'Esta conta só tem acesso ao portal de investimento.',
    });
  }

  return next();
}
