// src/modules/earnings/earnings.routes.ts
//
// Lançamentos comunicados pelo motorista. Nenhum destes endpoints movimenta
// saldo — o dinheiro entra apenas pelo fecho semanal, em /settlements.

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { csvUpload } from '../../middlewares/csv-upload.middleware';
import { earningsController } from './earnings.controller';
import { earningsImportController } from './import/import.controller';

export function earningsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // ── Importação de CSV dos portais (Uber, Bolt) ──
  //
  // csvUpload e não o `upload` partilhado: aquele aceita imagens e documentos
  // e recusa text/csv, portanto TODOS os ficheiros dos portais eram rejeitados
  // com INVALID_FILE_TYPE antes de chegarem ao parser. A importação nunca
  // chegou a funcionar.
  //
  // São dois middlewares separados de propósito: alargar o `upload` para
  // aceitar CSV abriria a porta a enviar uma folha de cálculo como Cartão de
  // Cidadão. Cada porta aceita o que a sua tela precisa.
  //
  // O CSV é a via secundária. A recolha principal dos valores das plataformas
  // será a extensão de browser, que lê os portais que o administrador já tem
  // abertos; o ficheiro serve de alternativa quando ela falhar, para carregar
  // semanas antigas, e para testar a receção enquanto a extensão não existe.
  router.post('/import/preview', csvUpload.single('file'), earningsImportController.preview);
  router.post('/import', csvUpload.single('file'), earningsImportController.commit);

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
