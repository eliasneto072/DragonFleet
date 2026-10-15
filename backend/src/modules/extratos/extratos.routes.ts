// src/modules/extratos/extratos.routes.ts
//
// As rotas da importação de extratos, pessoais e da empresa.
//
// Uma porta só para os dois âmbitos, e não duas: as regras de quem pode o quê
// vivem no serviço, onde se vêem todas juntas. Duas portas obrigavam a
// repetir a leitura do PDF e acabavam por divergir uma da outra.

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { upload } from '../../middlewares/upload.middleware';
import { reporFrota } from '../../middlewares/escopo.middleware';
import { extratosController } from './extratos.controller';

export function extratosRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/contas', extratosController.contas);

  // Multipart: o campo do ficheiro chama-se 'extrato'. Qualquer outro nome e o
  // multer ignora-o em silêncio, e o pedido chega sem ficheiro nenhum.
  router.post('/prever', upload.single('extrato'), reporFrota, extratosController.prever);

  router.post('/importar', extratosController.importar);
  router.get('/', extratosController.listar);
  router.get('/:id/movimentos', extratosController.movimentos);
  router.delete('/:id', extratosController.apagar);

  return router;
}
