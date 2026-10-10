// src/modules/invites/invites.schemas.ts

import { z } from 'zod';

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const codeParamSchema = z.object({
  // Não valida o formato aqui de propósito: quem o valida é
  // `normalizarCodigo`, no serviço, que sabe o alfabeto e devolve uma
  // mensagem em português em vez de um erro de schema.
  params: z.object({ code: z.string().min(1).max(40) }),
});

export const criarConviteSchema = z.object({
  body: z.object({
    label: z.string().trim().max(60).optional().nullable(),
    // `null` é uma escolha e não a falta de uma: quer dizer "sem validade".
    // Daí `.nullable()` e não só `.optional()`.
    dias: z.coerce.number().int().min(1).max(3650).optional().nullable(),
    maxUses: z.coerce.number().int().min(1).max(10_000).optional().nullable(),
  }),
});
