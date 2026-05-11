import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { documentsService } from './documents.service';
import {
  createDocumentSchema,
  updateDocumentSchema,
  updateDocumentStatusSchema,
  documentIdParamSchema,
} from './documents.schemas';

function getActor(req: AuthRequest) {
  if (!req.user?.id) {
    throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  }

  return {
    id: req.user.id,
    role: req.user.role,
  };
}

export class DocumentsController {
  list = async (req: AuthRequest, res: Response) => {
    const documents = await documentsService.list(getActor(req));
    return ok(res, { documents });
  };

  getById = async (req: AuthRequest, res: Response) => {
    const parsed = documentIdParamSchema.parse({ params: req.params });

    const document = await documentsService.getById(
      getActor(req),
      parsed.params.id
    );

    return ok(res, { document });
  };

  create = async (req: AuthRequest, res: Response) => {
    const parsed = createDocumentSchema.parse({ body: req.body });

    const document = await documentsService.create(
      getActor(req),
      parsed.body
    );

    return ok(res, { document }, 201);
  };

  update = async (req: AuthRequest, res: Response) => {
    const parsed = updateDocumentSchema.parse({
      params: req.params,
      body: req.body,
    });

    const document = await documentsService.update(
      getActor(req),
      parsed.params.id,
      parsed.body
    );

    return ok(res, { document });
  };

  updateStatus = async (req: AuthRequest, res: Response) => {
    const parsed = updateDocumentStatusSchema.parse({
      params: req.params,
      body: req.body,
    });

    const document = await documentsService.updateStatus(
      getActor(req),
      parsed.params.id,
      parsed.body
    );

    return ok(res, { document });
  };

  remove = async (req: AuthRequest, res: Response) => {
    const parsed = documentIdParamSchema.parse({ params: req.params });

    await documentsService.remove(getActor(req), parsed.params.id);

    return res.status(204).send();
  };
}

export const documentsController = new DocumentsController();