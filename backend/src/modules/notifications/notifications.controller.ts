// src/modules/notifications/notifications.controller.ts
import { Response }      from 'express';
import { AuthRequest }   from '../../middlewares/auth.middleware';
import { AppError }      from '../../shared/errors/AppError';
import { ok }            from '../../shared/http/response';
import { notificationsService } from './notifications.service';
import {
  createNotificationSchema,
  notificationIdParamSchema,
  updateNotificationSchema,
  userIdParamSchema,
} from './notifications.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class NotificationsController {
  list = async (req: AuthRequest, res: Response) => {
    const notifications = await notificationsService.list(getActor(req));
    return ok(res, { notifications });
  };

  listByUser = async (req: AuthRequest, res: Response) => {
    const parsed = userIdParamSchema.parse({ params: req.params });
    const notifications = await notificationsService.listByUser(getActor(req), parsed.params.userId);
    return ok(res, { notifications });
  };

  getById = async (req: AuthRequest, res: Response) => {
    const parsed = notificationIdParamSchema.parse({ params: req.params });
    const notification = await notificationsService.getById(getActor(req), parsed.params.id);
    return ok(res, { notification });
  };

  /** POST /notifications — envia para um driver específico (body: { userId, title, message }) */
  create = async (req: AuthRequest, res: Response) => {
    const actor  = getActor(req);
    const userId = req.body.userId as string;
    if (!userId) throw new AppError('userId is required', 400, 'VALIDATION_ERROR');
    const parsed = createNotificationSchema.parse({ body: req.body });
    const notification = await notificationsService.create(actor, userId, parsed.body);
    return ok(res, { notification }, 201);
  };

  /** POST /notifications/broadcast — envia para TODOS os drivers */
  broadcast = async (req: AuthRequest, res: Response) => {
    const actor  = getActor(req);
    const parsed = createNotificationSchema.parse({ body: req.body });
    const result = await notificationsService.createBroadcast(actor, parsed.body);
    return ok(res, result, 201);
  };

  update = async (req: AuthRequest, res: Response) => {
    const actor  = getActor(req);
    const parsed = updateNotificationSchema.parse({ params: req.params, body: req.body });
    const notification = await notificationsService.update(actor, actor.id, parsed.params.id, parsed.body);
    return ok(res, { notification });
  };

  remove = async (req: AuthRequest, res: Response) => {
    const actor  = getActor(req);
    const parsed = notificationIdParamSchema.parse({ params: req.params });
    await notificationsService.remove(actor, actor.id, parsed.params.id);
    return res.status(204).send();
  };
}

export const notificationsController = new NotificationsController();