import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { notificationsController } from "./notifications.controller";


export function notificationsRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', notificationsController.list);
  router.get('/user/:userId', notificationsController.listByUser);
  router.get('/:id', notificationsController.getById);
  router.post('/', notificationsController.create);
  router.patch('/:id', notificationsController.update);
  router.delete('/:id', notificationsController.remove);

  return router;
}