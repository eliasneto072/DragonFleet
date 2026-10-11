// src/modules/companies/companies.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireStaff, requireAdmin } from '../../middlewares/role.middleware';
import { companiesController } from './companies.controller';

export function companiesRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  // Gestão e não qualquer autenticado: o motorista não classifica recibos, e a
  // lista de sociedades do grupo não lhe diz respeito.
  router.get('/', requireStaff, companiesController.list);

  // ANTES de qualquer rota com `:id`, para "por-motorista" não ser lido como
  // o id de uma sociedade. Aqui ainda não há nenhuma, mas o dia em que houver
  // é o dia em que isto deixava de funcionar sem nada a explicar porquê.
  router.get('/por-motorista', requireStaff, companiesController.porMotorista);

  // Mexer na lista é de administrador: renomear uma sociedade muda o nome que
  // aparece em todos os recibos já emitidos a ela.
  router.post('/', requireAdmin, companiesController.create);
  router.patch('/:id', requireAdmin, companiesController.update);
  router.delete('/:id', requireAdmin, companiesController.remove);

  return router;
}
