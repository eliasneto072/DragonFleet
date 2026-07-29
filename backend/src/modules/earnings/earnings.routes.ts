// src/modules/earnings/earnings.routes.ts
//
// Lançamentos comunicados pelo motorista. Nenhum destes endpoints movimenta
// saldo — o dinheiro entra apenas pelo fecho semanal, em /settlements.

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { upload } from '../../middlewares/upload.middleware';
import { earningsController } from './earnings.controller';
import { earningsImportController } from './import/import.controller';

export function earningsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // ── CSV import (drivers upload their Uber/Bolt statement) ──
  // NOTE: the shared upload.middleware currently allows images + PDF only.
  // Add 'text/csv' and 'application/vnd.ms-excel' to ALLOWED_TYPES there,
  // OR use the dedicated csvUpload middleware shipped alongside this file.
  router.post('/import/preview', upload.single('file'), earningsImportController.preview);
  router.post('/import', upload.single('file'), earningsImportController.commit);

  // Conferência cruzada do fecho: o que o motorista comunicou no intervalo.
  // Antes de '/:id' de propósito — senão "reported" seria lido como um id.
  router.get('/reported', earningsController.reported);

  // ── CRUD ──
  router.get('/', earningsController.list);
  router.get('/user/:userId', earningsController.listByUser);
  router.get('/:id', earningsController.getById);
  router.post('/', earningsController.create);
  router.patch('/:id', earningsController.update);

  // Aprovar ou recusar — restrição de papel validada no service.
  router.patch('/:id/review', earningsController.review);

  router.delete('/:id', earningsController.remove);

  return router;
}
