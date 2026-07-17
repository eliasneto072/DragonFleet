// src/middlewares/role.middleware.ts
//
// Role-based access guards. Use AFTER authMiddleware (which populates req.user).
//
//   router.use(authMiddleware);
//   router.get('/reports/financial.pdf', requireAdmin, reportsController.financial);
//
// `requireAdmin`   → ADMIN only
// `requireStaff`   → ADMIN or MANAGER (back-office)
// `requireRole(...)` → custom allow-list

import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.middleware';
import { UserRole } from '../shared/types/enums';
import { AppError } from '../shared/errors/AppError';

export function requireRole(...allowed: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    const role = req.user?.role;

    if (!req.user?.id) {
      return next(new AppError('Unauthenticated', 401, 'UNAUTHENTICATED'));
    }
    if (!role || !allowed.includes(role)) {
      return next(new AppError('Acesso restrito a administradores', 403, 'FORBIDDEN'));
    }
    return next();
  };
}

/** ADMIN only — e.g. financial PDF reports. */
export const requireAdmin = requireRole(UserRole.ADMIN);

/** ADMIN or MANAGER — general back-office access. */
export const requireStaff = requireRole(UserRole.ADMIN, UserRole.MANAGER);
