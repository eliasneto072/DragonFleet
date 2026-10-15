// src/modules/settlements/settlements.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { upload } from '../../middlewares/upload.middleware';
import { reporFrota } from '../../middlewares/escopo.middleware';
import { settlementsController } from './settlements.controller';
import { pedidosController } from './pedidos.controller';

export function settlementsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // ─── PEDIDOS DE ESCLARECIMENTO ───────────────────────────────────────────
  //
  // ANTES de '/:id', e não por arrumação: declaradas depois, o Express leria
  // 'pedidos' como o id de um fecho e devolvia 404. É o mesmo cuidado que a
  // rota 'ultimo-km' já tinha.
  router.get('/pedidos', pedidosController.listar);
  router.get('/pedidos/meus', pedidosController.meus);
  // Multipart: o extrato vai no mesmo pedido que o texto da resposta. O campo
  // chama-se 'extrato' — qualquer outro nome e o multer ignora o ficheiro em
  // silêncio, e a resposta fica sem anexo sem ninguém perceber porquê.
  router.post(
    '/pedidos/:pedidoId/responder',
    upload.single('extrato'), reporFrota,
    pedidosController.responder,
  );
  router.delete('/pedidos/:pedidoId', pedidosController.retirar);

  // A restrição de papel é validada no service, não por middleware.
  //
  // Leitura é mista de propósito: o motorista lista os próprios fechos e a
  // gestão lista todos. Um requireAdmin na rota impediria o motorista de ver
  // os dele, que é metade do que o cliente pediu.
  router.get('/', settlementsController.list);
  // Antes de '/:id': declarada depois, o Express leria 'ultimo-km' como o id
  // de um fecho e devolvia 404.
  router.get('/ultimo-km', settlementsController.lastOdometer);
  router.get('/:id', settlementsController.getById);
  // O histórico de correções. Leitura e mais nada — para o staff e para o
  // próprio motorista; quem pode ver o quê decide-se no serviço.
  router.get('/:id/revisions', settlementsController.revisions);
  // Os pedidos daquela semana, e que linhas é que ainda dão para pedir. O
  // motorista vê os dele; a gestão vê os de todos — decidido no serviço.
  router.get('/:id/pedidos', pedidosController.doFecho);
  // Só o próprio motorista cria. Nem o ADMIN pede pelo motorista: um pedido
  // feito por outra pessoa criava uma pergunta que ninguém fez.
  router.post('/:id/pedidos', pedidosController.criar);

  // Escrita — apenas ADMIN ou MANAGER, garantido em settlementsService.
  router.post('/preview', settlementsController.preview);
  router.post('/', settlementsController.create);
  router.patch('/:id', settlementsController.update);
  router.post('/:id/register', settlementsController.register);
  router.post('/:id/cancel', settlementsController.cancel);
  router.delete('/:id', settlementsController.remove);

  return router;
}
