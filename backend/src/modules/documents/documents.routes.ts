import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/role.middleware';
import { documentsController } from './documents.controller';
import { upload } from '../../middlewares/upload.middleware';

export function documentsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', documentsController.list);
  router.get('/:id', documentsController.getById);
  router.post('/', upload.single('file'), documentsController.create); // ← multipart
  router.patch('/:id', documentsController.update);
  router.patch('/:id/status', documentsController.updateStatus);
  router.delete('/:id', documentsController.remove);

  // Dispara manualmente a verificação de validade (útil para testes e operação).
  // Só admin. O cron já corre isto diariamente às 03:00.
  router.post('/jobs/run-expiry-check', requireAdmin, documentsController.runExpiryCheck);

  return router;
}