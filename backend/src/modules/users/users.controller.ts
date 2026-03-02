import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { usersService } from './users.service';
import {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
} from './users.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) {
    throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  }

  return {
    id: req.user.id,
    role: req.user.role,
  };
}

export class UsersController {
  list = async (req: AuthRequest, res: Response) => {
    const users = await usersService.list(getActor(req));
    return ok(res, { users });
  };

  getById = async (req: AuthRequest, res: Response) => {
    const parsed = userIdParamSchema.parse({ params: req.params });

    const user = await usersService.getById(
      getActor(req),
      parsed.params.id
    );

    return ok(res, { user });
  };

  create = async (req: AuthRequest, res: Response) => {
    const parsed = createUserSchema.parse({ body: req.body });

    const user = await usersService.create(parsed.body);

    return ok(res, { user }, 201);
  };

  update = async (req: AuthRequest, res: Response) => {
    const parsed = updateUserSchema.parse({
      params: req.params,
      body: req.body,
    });

    const user = await usersService.update(
      getActor(req),
      parsed.params.id,
      parsed.body
    );

    return ok(res, { user });
  };

  remove = async (req: AuthRequest, res: Response) => {
    const parsed = userIdParamSchema.parse({ params: req.params });

    await usersService.remove(getActor(req), parsed.params.id);

    return res.status(204).send();
  };
}

export const usersController = new UsersController();