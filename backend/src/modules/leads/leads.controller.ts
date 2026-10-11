// src/modules/leads/leads.controller.ts

import type { Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { leadsService } from './leads.service';

/**
 * Os limites de tamanho são uma trava, e não cosmética.
 *
 * É um formulário aberto à internet inteira: sem um máximo, uma mensagem de
 * dez mil caracteres entra na base e a lista de contactos deixa de se ler.
 */
const registarSchema = z.object({
  body: z.object({
    tipo: z.enum(['MOTORISTA', 'GESTOR']),
    nome: z.string().trim().min(2, 'Escreva o seu nome.').max(80),
    telefone: z.string().trim().min(6).max(25),
    email: z.string().trim().email('Email inválido.').max(120).optional().nullable()
      // Campo opcional num formulário público: vazio é vazio, e não um erro
      // de validação em cima de quem decidiu não o preencher.
      .or(z.literal('')).transform((v) => (v ? v : null)),
    mensagem: z.string().trim().max(1000).optional().nullable(),
    /** O campo-armadilha. Ver a nota em `leads.service.ts`. */
    website: z.string().max(200).optional().nullable(),
  }),
});

const actualizarSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    estado: z.enum(['NOVO', 'FALADO', 'GANHO', 'PERDIDO']),
    notas: z.string().trim().max(2000).optional().nullable(),
  }),
});

export class LeadsController {
  /** PÚBLICA. Ver as travas em `leads.service.ts` e o limite em `app.ts`. */
  registar = async (req: AuthRequest, res: Response) => {
    const { body } = registarSchema.parse({ body: req.body });
    return ok(res, await leadsService.registar(body), 201);
  };

  listar = async (req: AuthRequest, res: Response) => {
    const todos = String((req.query as Record<string, unknown>)?.todos ?? '') === '1';
    return ok(res, { contactos: await leadsService.listar(todos) });
  };

  actualizar = async (req: AuthRequest, res: Response) => {
    const { params, body } = actualizarSchema.parse({
      params: req.params, body: req.body,
    });
    return ok(res, await leadsService.actualizar(params.id, body.estado, body.notas));
  };
}

export const leadsController = new LeadsController();
