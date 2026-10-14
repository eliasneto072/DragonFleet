// src/modules/company/company.routes.ts
//
// As contas da empresa.
//
// ─── NÃO SE VENDE, E POR ISSO NÃO É UMA FUNCIONALIDADE ──────────────────────
//
// Isto são o lucro e a conta bancária de UMA empresa — a da casa. Não está no
// catálogo de funcionalidades e nenhum plano a pode incluir, tal como os
// investidores e os projetos ficaram de fora. A guarda é o `soDaCasa` em
// `routes.ts`, que olha para a FROTA e não para a pessoa.
//
// E `requireAdmin` por cima: dentro da frota da casa, isto é a contabilidade.
// Um gestor de faturação não tem nada que ver o lucro da empresa nem o saldo
// do banco.

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/role.middleware';
import { companyController as c } from './company.controller';

export function companyRouter(): Router {
  const router = Router();

  router.use(authMiddleware);
  router.use(requireAdmin);

  router.get('/lucro', c.lucro);
  router.get('/caixa', c.caixa);
  router.get('/caixa/historico', c.historicoDeCaixa);
  router.post('/caixa', c.declararSaldo);

  router.get('/despesas', c.listarDespesas);
  router.post('/despesas', c.criarDespesa);
  router.put('/despesas/:id', c.actualizarDespesa);
  router.delete('/despesas/:id', c.apagarDespesa);

  router.get('/categorias', c.listarCategorias);
  router.post('/categorias', c.criarCategoria);
  router.delete('/categorias/:id', c.apagarCategoria);

  return router;
}
