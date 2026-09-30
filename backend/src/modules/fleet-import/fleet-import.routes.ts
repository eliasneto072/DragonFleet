// src/modules/fleet-import/fleet-import.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireArea } from '../../middlewares/area.middleware';
import { fleetImportController } from './fleet-import.controller';

export function fleetImportRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // O limite de corpo desta rota (25 MB, contra os 100 KB da restante API)
  // está no app.ts e não aqui: o parser tem de ser registado ANTES do global,
  // porque o primeiro a correr é o que consome o corpo.

  // Ambas exigem poder MEXER nos fechos, não apenas vê-los: a segunda cria-os,
  // e a primeira já revela quanto cada motorista gastou.
  router.post('/analisar', requireArea('SETTLEMENTS', 'MANAGE'), fleetImportController.analisar);
  router.post('/', requireArea('SETTLEMENTS', 'MANAGE'), fleetImportController.importar);

  return router;
}
