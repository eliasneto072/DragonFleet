// src/modules/reports/reports.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/role.middleware';
import { reportsController } from './reports.controller';

export function reportsRouter(): Router {
  const router = Router();

  // Autenticação para todo o módulo.
  router.use(authMiddleware);

  // ATENÇÃO: o requireAdmin ficava em router.use() e cobria o módulo inteiro.
  // Com a entrada do extrato do motorista ele passou a ser declarado por rota.
  // Qualquer rota nova aqui NÃO herda restrição de papel — declare o guard
  // explicitamente ou valide no service.

  // Relatório financeiro da empresa — apenas administradores.
  router.get('/financial.pdf', requireAdmin, reportsController.financialPdf);

  // Extrato de ganhos — o próprio motorista, ou admin/manager consultando
  // outro utilizador. A posse é validada de novo dentro do service.
  router.get('/earnings.pdf', reportsController.earningsPdf);

  return router;
}