// src/modules/bookings/bookings.routes.ts
//
// É a ÚNICA rota da frota que uma conta de mecânico pode abrir — ver
// `routes.ts` e `deny-mechanic.middleware.ts`. Tudo o que entra aqui é
// filtrado por oficina dentro do serviço.

import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { upload } from '../../middlewares/upload.middleware';
import { uploadToCloudinary } from '../upload/upload.service';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { bookingsService } from './bookings.service';

/**
 * O `:id` do caminho, validado.
 *
 * Passar `req.params.id` directamente não compila: no Express 5 o tipo dele é
 * `string | string[]`. O resto do projeto passa os parâmetros pelo zod.
 */
const idParam = z.object({ id: z.string().min(1) });
const idFileParam = z.object({ id: z.string().min(1), fileId: z.string().min(1) });

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD');
const logistica = z.enum(['MOTORISTA_LEVA', 'OFICINA_RECOLHE', 'EMPRESA_LEVA']);

function actor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export function bookingsRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  // ── Oficinas ─────────────────────────────────────────────────────────────
  router.get('/workshops', async (req: AuthRequest, res: Response) => {
    const todas = req.query.all === 'true';
    return ok(res, { workshops: await bookingsService.listWorkshops(actor(req), todas) });
  });

  router.post('/workshops', async (req: AuthRequest, res: Response) => {
    const corpo = z.object({
      name: z.string().trim().min(1).max(120),
      kind: z.enum(['OFICINA', 'INSPECAO', 'PNEUS', 'OUTRO']).optional(),
      address: z.string().trim().max(300).optional().nullable(),
      phone: z.string().trim().max(40).optional().nullable(),
      notes: z.string().trim().max(1000).optional().nullable(),
    }).parse(req.body);
    return ok(res, { workshop: await bookingsService.createWorkshop(actor(req), corpo) }, 201);
  });

  router.patch('/workshops/:id', async (req: AuthRequest, res: Response) => {
    const corpo = z.object({
      name: z.string().trim().min(1).max(120).optional(),
      kind: z.enum(['OFICINA', 'INSPECAO', 'PNEUS', 'OUTRO']).optional(),
      address: z.string().trim().max(300).optional().nullable(),
      phone: z.string().trim().max(40).optional().nullable(),
      notes: z.string().trim().max(1000).optional().nullable(),
      active: z.boolean().optional(),
    }).parse(req.body);
    return ok(res, {
      workshop: await bookingsService.updateWorkshop(actor(req), idParam.parse(req.params).id, corpo),
    });
  });

  // ── Tipos de serviço ─────────────────────────────────────────────────────
  router.get('/service-types', async (req: AuthRequest, res: Response) => {
    const todos = req.query.all === 'true';
    return ok(res, { serviceTypes: await bookingsService.listServiceTypes(actor(req), todos) });
  });

  router.post('/service-types', async (req: AuthRequest, res: Response) => {
    const { label, isInspection } = z.object({
      label: z.string().trim().min(1).max(80),
      isInspection: z.boolean().optional(),
    }).parse(req.body);
    return ok(res, {
      serviceType: await bookingsService.createServiceType(actor(req), label, isInspection === true),
    }, 201);
  });

  router.patch('/service-types/:id', async (req: AuthRequest, res: Response) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    return ok(res, {
      serviceType: await bookingsService.setServiceTypeActive(
        actor(req), idParam.parse(req.params).id, active,
      ),
    });
  });

  // ── Contas de oficina ────────────────────────────────────────────────────
  //
  // Antes de `/:id`, pela mesma razão de `/escorts` abaixo.
  router.get('/mechanics', async (req: AuthRequest, res: Response) => {
    return ok(res, { mechanics: await bookingsService.listMechanics(actor(req)) });
  });

  router.post('/mechanics', async (req: AuthRequest, res: Response) => {
    const corpo = z.object({
      workshopId: z.string().min(1, 'Escolha a oficina'),
      name: z.string().trim().min(1, 'Escreva o nome').max(120),
      email: z.string().trim().email('Email inválido'),
      // Seis, como no registo: é o mínimo do resto do sistema, e dois mínimos
      // diferentes para a mesma coisa só confundem quem cria a conta.
      password: z.string().min(6, 'A palavra-passe precisa de 6 caracteres ou mais'),
    }).parse(req.body);
    return ok(res, { mechanic: await bookingsService.createMechanic(actor(req), corpo) }, 201);
  });

  router.patch('/mechanics/:id', async (req: AuthRequest, res: Response) => {
    const corpo = z.object({
      workshopId: z.string().min(1).nullable().optional(),
      active: z.boolean().optional(),
      password: z.string().min(6).optional(),
    }).parse(req.body);
    return ok(res, {
      mechanic: await bookingsService.updateMechanic(
        actor(req), idParam.parse(req.params).id, corpo,
      ),
    });
  });

  // ── Quem pode acompanhar ─────────────────────────────────────────────────
  //
  // Antes de `/:id` de propósito: o Express lê as rotas pela ordem em que são
  // declaradas, e depois de `/:id` isto seria lido como uma marcação chamada
  // "escorts".
  router.get('/escorts', async (req: AuthRequest, res: Response) => {
    return ok(res, { escorts: await bookingsService.listEscortCandidates(actor(req)) });
  });

  // ── Marcações ────────────────────────────────────────────────────────────
  router.get('/', async (req: AuthRequest, res: Response) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const vehicleId = typeof req.query.vehicleId === 'string' ? req.query.vehicleId : undefined;
    const abertas = req.query.abertas === 'true';
    return ok(res, {
      bookings: await bookingsService.list(actor(req), { status, vehicleId, abertas }),
    });
  });

  router.get('/:id', async (req: AuthRequest, res: Response) => {
    return ok(res, { booking: await bookingsService.getById(actor(req), idParam.parse(req.params).id) });
  });

  router.post('/', async (req: AuthRequest, res: Response) => {
    const corpo = z.object({
      vehicleId: z.string().min(1, 'Escolha o carro'),
      workshopId: z.string().min(1, 'Escolha a oficina'),
      serviceTypeId: z.string().min(1, 'Escolha o serviço'),
      // Com hora: uma marcação sem hora é um recado, não uma marcação.
      scheduledAt: z.string().datetime({ offset: true }).or(z.string().min(16)),
      description: z.string().trim().max(2000).optional().nullable(),
      logistics: logistica.optional(),
      needsEscort: z.boolean().optional(),
    }).parse(req.body);
    return ok(res, { booking: await bookingsService.create(actor(req), corpo) }, 201);
  });

  router.post('/:id/confirm', async (req: AuthRequest, res: Response) => {
    return ok(res, { booking: await bookingsService.confirm(actor(req), idParam.parse(req.params).id) });
  });

  router.post('/:id/propose', async (req: AuthRequest, res: Response) => {
    const { scheduledAt, reason } = z.object({
      scheduledAt: z.string().min(16),
      reason: z.string().trim().max(500).optional(),
    }).parse(req.body);
    return ok(res, {
      booking: await bookingsService.propose(actor(req), idParam.parse(req.params).id, scheduledAt, reason),
    });
  });

  router.post('/:id/accept-proposal', async (req: AuthRequest, res: Response) => {
    return ok(res, {
      booking: await bookingsService.acceptProposal(actor(req), idParam.parse(req.params).id),
    });
  });

  router.post('/:id/refuse', async (req: AuthRequest, res: Response) => {
    const { reason } = z.object({ reason: z.string().trim().min(1, 'Explique o motivo').max(500) })
      .parse(req.body);
    return ok(res, {
      booking: await bookingsService.refuse(actor(req), idParam.parse(req.params).id, reason),
    });
  });

  router.post('/:id/cancel', async (req: AuthRequest, res: Response) => {
    const { reason } = z.object({ reason: z.string().trim().max(500).optional() }).parse(req.body);
    return ok(res, {
      booking: await bookingsService.cancel(actor(req), idParam.parse(req.params).id, reason),
    });
  });

  router.post('/:id/complete', async (req: AuthRequest, res: Response) => {
    const corpo = z.object({
      cost: z.coerce.number().min(0).optional().nullable(),
      notes: z.string().trim().max(2000).optional().nullable(),
      /** Só faz sentido numa inspeção — ver a nota no serviço. */
      nextInspectionOn: dia.optional().nullable(),
    }).parse(req.body);
    return ok(res, {
      booking: await bookingsService.complete(actor(req), idParam.parse(req.params).id, corpo),
    });
  });

  router.post('/:id/escort', async (req: AuthRequest, res: Response) => {
    const { escortId } = z.object({ escortId: z.string().min(1).nullable() }).parse(req.body);
    return ok(res, {
      booking: await bookingsService.assignEscort(actor(req), idParam.parse(req.params).id, escortId),
    });
  });

  // ── Factura e comprovativo ───────────────────────────────────────────────
  //
  // O ENVIO DO FICHEIRO É AQUI, E NÃO EM /upload, DE PROPÓSITO.
  //
  // `/upload` fica abaixo do muro do mecânico (ver `routes.ts`), por isso uma
  // conta de oficina receberia 403 ao tentar anexar a factura do serviço que
  // ela própria fez. Em vez de abrir `/upload` a essas contas — que lhes daria
  // uma porta para guardar o que quisessem no armazenamento da frota — o envio
  // entra pela marcação: quem não pode mexer naquela marcação não envia nada.
  router.post('/:id/files/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
    const { id } = idParam.parse(req.params);
    const { kind } = z.object({ kind: z.enum(['FATURA', 'COMPROVATIVO', 'OUTRO']) })
      .parse(req.body);

    if (!req.file) throw new AppError('Escolha o ficheiro.', 400, 'MISSING_FILE');

    const guardado = await uploadToCloudinary(req.file.buffer, req.file.mimetype, 'bookings');
    return ok(res, {
      booking: await bookingsService.addFile(actor(req), id, {
        kind,
        fileUrl: guardado.fileUrl,
        fileKey: guardado.fileKey,
        fileName: req.file.originalname ?? null,
      }),
    }, 201);
  });

  router.post('/:id/files', async (req: AuthRequest, res: Response) => {
    const corpo = z.object({
      kind: z.enum(['FATURA', 'COMPROVATIVO', 'OUTRO']),
      fileUrl: z.string().url(),
      fileKey: z.string().min(1),
      fileName: z.string().trim().max(200).optional().nullable(),
    }).parse(req.body);
    return ok(res, {
      booking: await bookingsService.addFile(actor(req), idParam.parse(req.params).id, corpo),
    }, 201);
  });

  router.delete('/:id/files/:fileId', async (req: AuthRequest, res: Response) => {
    const { id, fileId } = idFileParam.parse(req.params);
    return ok(res, { booking: await bookingsService.removeFile(actor(req), id, fileId) });
  });

  return router;
}
