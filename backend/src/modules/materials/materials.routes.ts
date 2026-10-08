// src/modules/materials/materials.routes.ts
//
// Fica sob a área da FROTA: o material é material dos carros, e quem trata da
// frota trata dele. Quem pode VER e quem pode ESCREVER decide-se no serviço —
// incluindo a recusa do motorista, que o `requireArea` deixa passar de
// propósito (ver a nota em `materials.service.ts`).

import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { materialsService } from './materials.service';

/**
 * O `:id` do caminho, validado.
 *
 * No Express 5 `req.params.id` é `string | string[]` e não compila passado
 * directamente. O resto do projeto passa os parâmetros pelo zod.
 */
const idParam = z.object({ id: z.string().min(1) });

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD');

function actor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

const texto = (max: number) => z.string().trim().max(max).optional().nullable();

export function materialsRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  // ── Os números, antes de `/:id` ──────────────────────────────────────────
  //
  // O Express lê as rotas pela ordem em que são declaradas: depois de `/:id`,
  // "resumo" passava a ser lido como o id de um material.
  router.get('/summary', async (req: AuthRequest, res: Response) => {
    const { from, to } = z.object({ from: dia.optional(), to: dia.optional() })
      .parse(req.query);
    return ok(res, { summary: await materialsService.summary(actor(req), { from, to }) });
  });

  router.get('/by-vehicle', async (req: AuthRequest, res: Response) => {
    const { from, to } = z.object({ from: dia.optional(), to: dia.optional() })
      .parse(req.query);
    return ok(res, { rows: await materialsService.costByVehicle(actor(req), { from, to }) });
  });

  router.get('/categories', async (req: AuthRequest, res: Response) => {
    return ok(res, { categories: await materialsService.categories(actor(req)) });
  });

  // ── Movimentos ───────────────────────────────────────────────────────────
  router.get('/moves', async (req: AuthRequest, res: Response) => {
    const filtro = z.object({
      materialId: z.string().min(1).optional(),
      vehicleId: z.string().min(1).optional(),
      bookingId: z.string().min(1).optional(),
      kind: z.enum(['ENTRADA', 'SAIDA', 'AJUSTE']).optional(),
      from: dia.optional(),
      to: dia.optional(),
      take: z.coerce.number().int().min(1).max(1000).optional(),
    }).parse(req.query);
    return ok(res, { moves: await materialsService.moves(actor(req), filtro) });
  });

  router.post('/moves', async (req: AuthRequest, res: Response) => {
    const corpo = z.object({
      materialId: z.string().min(1, 'Escolha o material'),
      kind: z.enum(['ENTRADA', 'SAIDA', 'AJUSTE']),
      // `coerce` porque os campos numéricos de um formulário chegam como texto.
      qty: z.coerce.number(),
      unitCost: z.coerce.number().optional().nullable(),
      supplier: texto(160),
      invoiceRef: texto(80),
      vehicleId: z.string().min(1).optional().nullable(),
      bookingId: z.string().min(1).optional().nullable(),
      driverId: z.string().min(1).optional().nullable(),
      notes: texto(1000),
      occurredAt: z.string().min(10).optional().nullable(),
    }).parse(req.body);
    return ok(res, await materialsService.registerMove(actor(req), corpo), 201);
  });

  // ── Materiais ────────────────────────────────────────────────────────────
  router.get('/', async (req: AuthRequest, res: Response) => {
    const filtro = z.object({
      search: z.string().trim().max(120).optional(),
      category: z.string().trim().max(80).optional(),
      all: z.string().optional(),
      low: z.string().optional(),
    }).parse(req.query);
    return ok(res, {
      materials: await materialsService.list(actor(req), {
        search: filtro.search,
        category: filtro.category,
        includeInactive: filtro.all === 'true',
        lowOnly: filtro.low === 'true',
      }),
    });
  });

  router.post('/', async (req: AuthRequest, res: Response) => {
    const corpo = z.object({
      name: z.string().trim().min(1, 'Escreva o nome').max(160),
      sku: texto(80),
      unit: z.string().trim().min(1).max(20).optional(),
      category: texto(80),
      minQty: z.coerce.number().min(0).optional().nullable(),
      notes: texto(1000),
    }).parse(req.body);
    return ok(res, { material: await materialsService.create(actor(req), corpo) }, 201);
  });

  router.patch('/:id', async (req: AuthRequest, res: Response) => {
    const corpo = z.object({
      name: z.string().trim().min(1).max(160).optional(),
      sku: texto(80),
      unit: z.string().trim().min(1).max(20).optional(),
      category: texto(80),
      minQty: z.coerce.number().min(0).optional().nullable(),
      notes: texto(1000),
      active: z.boolean().optional(),
    }).parse(req.body);
    return ok(res, {
      material: await materialsService.update(actor(req), idParam.parse(req.params).id, corpo),
    });
  });

  return router;
}
