import { Router } from 'express';
import { authController } from './auth.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

export function authRouter() {
  const router = Router();

  router.post('/login', authController.login);
  router.post('/logout', authMiddleware, authController.logout);
  router.get('/me', authMiddleware, authController.me);

  return router;
}