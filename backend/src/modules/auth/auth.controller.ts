// src/modules/auth/auth.controller.ts
import type { Request, Response } from 'express';
import type { AuthRequest }       from '../../middlewares/auth.middleware';
import { ok }        from '../../shared/http/response';
import { AppError }  from '../../shared/errors/AppError';
import { authService } from './auth.service';
import { loginSchema } from './auth.schemas';

function getUserId(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return req.user.id;
}

export class AuthController {
  login = async (req: Request, res: Response) => {
    const parsed = loginSchema.parse({ body: req.body });
    const result = await authService.login({
      email:    parsed.body.email,
      password: parsed.body.password,
    });
    return ok(res, result);
  };

  refresh = async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('refreshToken is required', 400, 'VALIDATION_ERROR');
    const result = await authService.refresh(refreshToken);
    return ok(res, result);
  };

  logout = async (_req: AuthRequest, res: Response) => {
    await authService.logout();
    return ok(res, { message: 'Logged out successfully' });
  };

  me = async (req: AuthRequest, res: Response) => {
    const user = await authService.me(getUserId(req));
    return ok(res, { user });
  };
}

export const authController = new AuthController();