import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { documentsService } from './documents.service';
import { uploadToCloudinary } from '../upload/upload.service';
import {
  updateDocumentSchema,
  updateDocumentStatusSchema,
  documentIdParamSchema,
} from './documents.schemas';
import { DocumentType } from '../../shared/types/enums';

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
  // req.body vem do multipart, não precisa de Zod aqui
  const type = req.body?.type;

  if (!type || !Object.values(DocumentType).includes(type)) {
    throw new AppError('Tipo de documento inválido ou ausente', 400, 'INVALID_DOCUMENT_TYPE');
  }

  if (!req.file) {
    throw new AppError('Arquivo não enviado', 400, 'MISSING_FILE');
  }

  const { fileUrl, fileKey } = await uploadToCloudinary(
    req.file.buffer,
    req.file.mimetype,
    'documents'
  );

  const document = await documentsService.create(getActor(req), {
    type: type as DocumentType,
    fileUrl,
    fileKey,
  });

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