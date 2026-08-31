import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { documentsService } from './documents.service';
import { uploadToCloudinary } from '../upload/upload.service';
import { runDocumentsExpiryCheck } from '../../jobs/documents-expiry.job';
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

  // Serve o ficheiro do documento com validação de permissão (dono ou admin/manager).
  // O frontend nunca mais toca na URL do Cloudinary diretamente — quem decide o
  // acesso é o backend (JWT + ownership), não a obscuridade do link. [RGPD]
  getFile = async (req: AuthRequest, res: Response) => {
    const parsed = documentIdParamSchema.parse({ params: req.params });

    // getById já valida: dono do documento OU admin/manager. Reaproveitamos.
    const document = await documentsService.getById(
      getActor(req),
      parsed.params.id
    );

    const upstream = await fetch(document.fileUrl);

    if (!upstream.ok) {
      throw new AppError(
        'Não foi possível obter o ficheiro. O documento pode precisar de ser reenviado.',
        502,
        'FILE_FETCH_FAILED'
      );
    }

    const contentType =
      upstream.headers.get('content-type') ?? 'application/octet-stream';

    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    // "inline" = abre no visualizador do navegador em vez de forçar download
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${document.type.toLowerCase()}-${document.id}"`
    );
    res.setHeader('Cache-Control', 'private, no-store');

    return res.send(buffer);
  };

  create = async (req: AuthRequest, res: Response) => {
    // req.body vem do multipart, não precisa de Zod aqui
    const type = req.body?.type;
    const vehicleId = req.body?.vehicleId || undefined; // presente = documento de veículo

    if (!type || !Object.values(DocumentType).includes(type)) {
      throw new AppError('Tipo de documento inválido ou ausente', 400, 'INVALID_DOCUMENT_TYPE');
    }

    if (!req.file) {
      throw new AppError('Ficheiro não enviado', 400, 'MISSING_FILE');
    }

    const { fileUrl, fileKey } = await uploadToCloudinary(
      req.file.buffer,
      req.file.mimetype,
      'documents'
    );

    // Sem datas no envio: a validade é lida do documento pela administração,
    // ao rever. Ver documentsService.resolveDates.
    const document = await documentsService.create(getActor(req), {
      type: type as DocumentType,
      fileUrl,
      fileKey,
      vehicleId,
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
      {
        ...parsed.body,
        // O schema aceita null para limpar a nota; o service trabalha com
        // undefined para "não mexer". São coisas diferentes e a conversão
        // tem de ser explícita.
        notes: parsed.body.notes ?? undefined,
      }
    );

    return ok(res, { document });
  };

  remove = async (req: AuthRequest, res: Response) => {
    const parsed = documentIdParamSchema.parse({ params: req.params });

    await documentsService.remove(getActor(req), parsed.params.id);

    return res.status(204).send();
  };

  // Dispara a verificação de validade manualmente (admin). Retorna o resumo.
  runExpiryCheck = async (_req: AuthRequest, res: Response) => {
    const result = await runDocumentsExpiryCheck();
    return ok(res, { result });
  };
}

export const documentsController = new DocumentsController();