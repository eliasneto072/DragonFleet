import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireStaff } from '../../middlewares/role.middleware';
import { vehiclesController } from './vehicles.controller';

export function vehiclesRouter(): Router {
  const router = Router();

  router.use(authMiddleware); // todas as rotas de vehicles exigem autenticação

  router.get('/', vehiclesController.list);
  router.get('/user/:userId', vehiclesController.listByUser); // antes de /:id
  // Também antes de '/:id': 'driver' seria lido como um identificador.
  router.get(
    '/driver/:userId/assignments',
    requireStaff,
    vehiclesController.driverVehicleHistory,
  );
  router.get('/:id', vehiclesController.getById);
  router.get('/:id/assignments', requireStaff, vehiclesController.assignmentHistory);
  router.post('/', vehiclesController.create);
  router.patch('/:id', vehiclesController.update);
  router.delete('/:id', vehiclesController.remove);

  // Atribuição (só admin/manager — reforçado no service também)
  router.post('/:id/assign', requireStaff, vehiclesController.assign);
  router.post('/:id/unassign', requireStaff, vehiclesController.unassign);

  // Ativação híbrida — admin força/remove exceção
  router.post('/:id/force-activation', requireStaff, vehiclesController.forceActivation);

  return router;
}