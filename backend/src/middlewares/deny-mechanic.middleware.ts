// src/middlewares/deny-mechanic.middleware.ts
//
// O muro entre o portal da oficina e o resto do sistema.
//
// ─── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
//
// Um mecânico é alguém de FORA da empresa. Precisa de ver os carros que lhe
// mandam e as datas — e mais nada. Não pode ver fechos, saldos, retiradas,
// documentos, contactos de motoristas, nem a lista da frota.
//
// Esconder menus no site não chega: quem abrir a consola do browser chama a
// API na mesma, e uma conta de mecânico com um token válido passaria em todas
// as rotas que só pedem "estar autenticado" — que são quase todas, porque
// foram escritas quando só existiam motoristas e administração.
//
// ─── LISTA BRANCA, COMO NO INVESTIDOR ───────────────────────────────────────
//
// Este middleware corre antes de tudo o que é da frota. A ÚNICA rota montada
// acima dele, para estas contas, é a das marcações — e lá dentro o serviço
// ainda filtra por oficina, para um mecânico não ver as marcações da oficina
// do lado.
//
// Uma rota nova acrescentada ao projeto nasce portanto fechada a estas contas
// sem ninguém se lembrar de a fechar. É a diferença entre uma rota esquecida
// ser segura por omissão ou ser uma fuga.

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserRole } from '../shared/types/enums';

export function denyMechanic(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  let role: UserRole | undefined;
  try {
    const payload = jwt.verify(header.slice('Bearer '.length), env.JWT_SECRET) as { role?: UserRole };
    role = payload.role;
  } catch {
    // Token estragado ou expirado: não é trabalho deste middleware. Segue, e a
    // rota a seguir devolve 401.
    return next();
  }

  if (role === UserRole.MECHANIC) {
    return res.status(403).json({
      ok: false,
      code: 'MECHANIC_SCOPE',
      message: 'Esta conta só tem acesso às marcações da oficina.',
    });
  }

  return next();
}
