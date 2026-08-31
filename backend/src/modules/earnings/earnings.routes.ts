// src/modules/earnings/earnings.routes.ts
//
// Lançamentos comunicados pelo motorista. Nenhum destes endpoints movimenta
// saldo — o dinheiro entra apenas pelo fecho semanal, em /settlements.

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { csvUpload } from '../../middlewares/csv-upload.middleware';
import { earningsController } from './earnings.controller';
import { earningsImportController } from './import/import.controller';
import { ingestController } from './import/ingest.controller';

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

  // ── Receção da extensão de browser ──
  //
  // JSON e não multipart: a extensão lê o DOM do portal e tem uma lista em
  // memória, não um ficheiro. Obrigá-la a fabricar um CSV para o voltar a
  // desmontar aqui era trabalho a dobrar para perder informação pelo caminho.
  //
  // Rota própria e não um alargamento de /import porque o dono é outro: o
  // /import é o motorista a carregar o próprio extrato, este é o administrador
  // a enviar a folha da frota inteira, onde cada linha traz um nome que decide
  // a quem pertence o valor. Permissões diferentes, modos de falha diferentes.
  //
  // Autenticação pelo token normal do administrador, que já está autenticado no
  // browser onde a extensão corre. Uma chave de aplicação separada seria mais
  // segura — revoga-se sem lhe tirar a conta — e passa a valer a pena quando
  // houver mais do que um utilizador a usá-la.
  router.post('/ingest/preview', ingestController.preview);
  router.post('/ingest', ingestController.ingest);

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
