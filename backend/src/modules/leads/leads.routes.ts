// src/modules/leads/leads.routes.ts
//
// O formulário de contacto do site. PÚBLICO: sem sessão, sem convite, sem
// nada — é um formulário de contacto, e quem o preenche ainda não é cliente
// de ninguém.
//
// As travas estão nos outros dois sítios, e é de propósito que não estão
// aqui: o limite por IP em `app.ts` (uma rota aberta sem limite enche-se numa
// noite) e o campo-armadilha em `leads.service.ts`.
//
// A LEITURA desta lista é outra coisa, e vive no painel do dono — ver
// `system.routes.ts`. Aqui só se escreve.

import { Router } from 'express';
import { leadsController } from './leads.controller';
import { publicoController } from './publico.controller';

export function leadsRouter(): Router {
  const router = Router();
  router.post('/', leadsController.registar);
  return router;
}

/**
 * O que o site mostra a quem ainda não entrou. Leitura, e mais nada.
 *
 * Separado do router acima porque o limite por IP em `app.ts` é para a
 * ESCRITA: pôr um orçamento de vinte por hora numa página de preços deixava o
 * site em branco a quem a recarregasse.
 */
export function publicoRouter(): Router {
  const router = Router();
  router.get('/planos', publicoController.planos);
  return router;
}
