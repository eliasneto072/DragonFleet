// src/modules/companies/companies.schemas.ts
//
// Validação das rotas das sociedades.
//
// POR QUE EXISTE, quando os handlers eram três linhas: `req.params` do Express
// é tipado como `string | string[]` — um parâmetro pode repetir-se na query. O
// resto do módulo já resolvia isto passando tudo por zod, que valida e estreita
// o tipo ao mesmo tempo. Eu tinha escrito os handlers a ler `req.params.id`
// diretamente, e o compilador recusou-os, com razão.
//
// Mesma forma dos outros módulos: params e body juntos num objeto, para o
// controller fazer uma chamada só.

import { z } from 'zod';

export const companyIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listCompaniesSchema = z.object({
  // `all=1` inclui as desativadas. Chega como string porque tudo na query
  // string é texto; a comparação é feita no controller.
  query: z.object({ all: z.string().optional() }),
});

export const createCompanySchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(200),
  }),
});

export const updateCompanySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().trim().min(2).max(200).optional(),
    active: z.boolean().optional(),
  }),
});
