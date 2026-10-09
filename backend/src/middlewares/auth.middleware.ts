import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UserRole } from '../shared/types/enums';

interface TokenPayload {
  sub?: string;
  role?: UserRole;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role?: UserRole;
  };
}

/**
 * Lê a sessão SE houver, e nunca recusa.
 *
 * ─── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
 *
 * Porque a frota tem de ser conhecida antes de o pedido correr, e o pedido pode
 * ser público. O `authMiddleware` responde 401 a quem não traz token, e pô-lo
 * à frente de tudo fechava o login e o registo.
 *
 * Então: este lê o token quando existe, ignora-o quando não existe ou está
 * estragado, e deixa passar sempre. Quem exige sessão continua a ser o
 * `authMiddleware` de cada router — isto não autentica ninguém, só identifica
 * para o âmbito da frota ser definido a tempo.
 */
export function lerSessaoSeHouver(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  const cabecalho = req.headers.authorization;
  if (!cabecalho || !cabecalho.startsWith('Bearer ')) return next();

  try {
    const payload = jwt.verify(
      cabecalho.slice('Bearer '.length), env.JWT_SECRET,
    ) as TokenPayload;
    if (payload.sub) {
      req.user = { id: String(payload.sub), role: payload.role };
    }
  } catch {
    // Token inválido ou expirado: segue como anónimo. A rota que exigir sessão
    // responde 401 com a mensagem certa, que é onde essa resposta pertence.
  }
  return next();
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      ok: false,
      message: 'Missing Bearer token',
    });
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, 
      //{issuer: env.JWT_ISSUER,audience: env.JWT_AUDIENCE,}
    ) as TokenPayload;

    const userId = payload.sub;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: 'Invalid token payload',
      });
    }

    req.user = {
      id: String(userId),
      role: payload.role,
    };

    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        ok: false,
        message: 'Token expired',
      });
    }

    return res.status(401).json({
      ok: false,
      message: 'Invalid token',
    });
  }
}