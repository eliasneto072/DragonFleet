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