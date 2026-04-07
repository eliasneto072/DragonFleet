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
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
});

// rota dedicada só pra status (bem profissional)
export const updateDocumentStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    status: z.nativeEnum(DocumentStatus),
  }),
});