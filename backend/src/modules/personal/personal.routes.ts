// src/modules/personal/personal.routes.ts
//
// As rotas das finanças pessoais.
//
// ─── TRÊS PORTAS, UMA A SEGUIR À OUTRA ──────────────────────────────────────
//
// 1. `authMiddleware` — tem de haver sessão.
// 2. `exigeFinancasPessoais` — a conta tem de ter a marca ligada. Sem ela,
//    responde 404: para quem não a tem, isto não existe.
// 3. O serviço só trabalha sobre o próprio. Mesmo que as duas de cima falhem
//    um dia, não há parâmetro nenhum onde caiba o id de outra pessoa.
//
// Três camadas para a mesma coisa é de propósito. Uma protecção que depende de
// uma só camada não é protecção — e isto são as despesas do supermercado e as
// perdas na bolsa de uma pessoa.
//
// ─── NÃO HÁ `exigeFuncionalidade` AQUI ──────────────────────────────────────
//
// Porque isto não se vende. Não está no catálogo de funcionalidades (ver
// `funcionalidades.ts`) e nenhum plano a pode incluir, da mesma forma que os
// investidores e os projetos ficaram de fora. Um plano que por engano a
// incluísse dava a um cliente uma página que não é para ele.

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { exigeFinancasPessoais } from '../../middlewares/pessoal.middleware';
import { personalController as c } from './personal.controller';

export function personalRouter(): Router {
  const router = Router();

  router.use(authMiddleware);
  router.use(exigeFinancasPessoais);

  // Trading
  router.get('/trading', c.listarOperacoes);
  router.get('/trading/resumo', c.resumoDeTrading);
  router.post('/trading', c.criarOperacao);
  router.put('/trading/:id', c.actualizarOperacao);
  router.delete('/trading/:id', c.apagarOperacao);

  // Categorias de despesa
  router.get('/categorias', c.listarCategorias);
  router.post('/categorias', c.criarCategoria);
  router.delete('/categorias/:id', c.apagarCategoria);

  // Créditos
  //
  // O «resumo» ANTES de «:id»: sem isto, "resumo" era apanhado como o id de
  // um crédito e a resposta era «crédito não encontrado».
  router.get('/creditos', c.listarCreditos);
  router.get('/creditos/resumo', c.resumoDeCreditos);
  router.get('/creditos/:id', c.verCredito);
  router.post('/creditos', c.criarCredito);
  router.put('/creditos/:id', c.actualizarCredito);
  router.delete('/creditos/:id', c.apagarCredito);

  // Os pagamentos de um crédito. São eles que dão a barra de percentagem, a
  // reta acumulada e o atraso — ver `plano.ts`.
  router.get('/creditos/:id/pagamentos', c.pagamentosDoCredito);
  router.post('/creditos/:id/pagamentos', c.registarPagamento);
  router.delete('/creditos/:id/pagamentos/:pagamentoId', c.apagarPagamento);

  // Despesas
  router.get('/despesas', c.listarDespesas);
  router.get('/despesas/resumo', c.resumoDeDespesas);
  router.post('/despesas', c.criarDespesa);
  router.put('/despesas/:id', c.actualizarDespesa);
  router.delete('/despesas/:id', c.apagarDespesa);

  return router;
}
