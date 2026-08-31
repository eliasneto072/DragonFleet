import { z } from 'zod';
import { DocumentStatus, DocumentType } from '../../shared/types/enums';

export const documentIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const createDocumentSchema = z.object({
  body: z.object({
    type: z.nativeEnum(DocumentType),
    fileUrl: z.string().min(1),
    fileKey: z.string().min(1),
  }),
});

export const updateDocumentSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z
    .object({
      type: z.nativeEnum(DocumentType).optional(),
      fileUrl: z.string().min(1).optional(),
      fileKey: z.string().min(1).optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
});

// Rota dedicada ao estado. É também aqui que a administração preenche as datas
// lidas do documento: nullable para permitir limpar ou marcar como sem validade,
// e opcional para que rejeitar não obrigue a preencher nada.
export const updateDocumentStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    status: z.nativeEnum(DocumentStatus),
    notes: z.string().max(2000).optional().nullable(),
    issuedAt: z.coerce.date().optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
  }),
});