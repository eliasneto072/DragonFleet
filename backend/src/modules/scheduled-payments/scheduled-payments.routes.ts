// src/modules/scheduled-payments/scheduled-payments.routes.ts

import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/http/response';
import { AppError } from '../../shared/errors/AppError';
import { AdjustmentType } from '../../shared/types/enums';
import { scheduledPaymentsService } from './scheduled-payments.service';

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD');

const frequencia = z.enum([
  'UNICO', 'SEMANAL', 'QUINZENAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL',
]);

const criarSchema = z.object({
  userId: z.string().min(1, 'Escolha o motorista'),
  type: z.nativeEnum(AdjustmentType),
  amount: z.coerce.number().positive('O valor deve ser maior que zero.'),
  description: z.string().trim().min(1, 'Escreva a descrição').max(500),
  categoryId: z.string().min(1).optional().nullable(),
  frequency: frequencia,
  startsOn: dia,
  endsOn: dia.optional().nullable(),
  /**
   * Quantas vezes ao todo. Tecto de 600 como guarda contra o zero a mais:
   * 600 semanas são onze anos, que já é muito mais do que qualquer caso real.
   */
  remaining: z.coerce.number().int().min(1).max(600).optional().nullable(),
});

/**
 * A edição.
 *
 * Tudo opcional: quem só quer corrigir o valor manda o valor. E `userId` não
 * está aqui de propósito — mudar o agendamento de motorista é mudar de quem é
 * o dinheiro, e isso não é uma correcção, é outro agendamento.
 */
const editarSchema = criarSchema.omit({ userId: true }).partial();

/**
 * O `:id` do caminho, validado.
 *
 * Passar `req.params.id` directamente não compila: no Express 5 o tipo dele é
 * `string | string[]`, porque um caminho pode repetir o mesmo nome de
 * parâmetro. O resto do projeto resolve isto a passar os parâmetros pelo zod,
 * que devolve a `string` e de caminho recusa o que não seja.
 */
const idParam = z.object({ id: z.string().min(1) });

function actor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export function scheduledPaymentsRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  // ── Tipos de pagamento (a lista editável) ────────────────────────────────
  router.get('/categories', async (req: AuthRequest, res: Response) => {
    const todas = req.query.all === 'true';
    return ok(res, { categories: await scheduledPaymentsService.listCategories(actor(req), todas) });
  });

  router.post('/categories', async (req: AuthRequest, res: Response) => {
    const { label } = z.object({ label: z.string().trim().min(1).max(60) }).parse(req.body);
    return ok(res, { category: await scheduledPaymentsService.createCategory(actor(req), label) }, 201);
  });

  router.patch('/categories/:id', async (req: AuthRequest, res: Response) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    return ok(res, {
      category: await scheduledPaymentsService.setCategoryActive(actor(req), idParam.parse(req.params).id, active),
    });
  });

  // ── Agendamentos ─────────────────────────────────────────────────────────
  router.get('/', async (req: AuthRequest, res: Response) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const active = req.query.active === 'true' ? true
      : req.query.active === 'false' ? false : undefined;
    return ok(res, { payments: await scheduledPaymentsService.list(actor(req), { userId, active }) });
  });

  router.post('/', async (req: AuthRequest, res: Response) => {
    const corpo = criarSchema.parse(req.body);
    return ok(res, { payment: await scheduledPaymentsService.create(actor(req), corpo) }, 201);
  });

  // O resumo ANTES do `/:id`, senão o Express lê "resumo" como um id e
  // devolve 404. É o mesmo cuidado que as outras rotas deste projeto têm.
  router.get('/resumo', async (req: AuthRequest, res: Response) => {
    const de = typeof req.query.de === 'string' ? req.query.de : null;
    const ate = typeof req.query.ate === 'string' ? req.query.ate : null;
    return ok(res, await scheduledPaymentsService.resumoPorCategoria(actor(req), { de, ate }));
  });

  router.patch('/:id', async (req: AuthRequest, res: Response) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    return ok(res, {
      payment: await scheduledPaymentsService.setActive(actor(req), idParam.parse(req.params).id, active),
    });
  });

  /**
   * A edição vai no PUT e não no PATCH porque o PATCH já é o interruptor.
   *
   * Dois corpos diferentes na mesma rota obrigavam a adivinhar qual era pelo
   * que lá vinha dentro — e um corpo com `active` e `amount` ao mesmo tempo
   * não teria resposta certa.
   */
  router.put('/:id', async (req: AuthRequest, res: Response) => {
    const corpo = editarSchema.parse(req.body);
    return ok(res, {
      payment: await scheduledPaymentsService.update(
        actor(req), idParam.parse(req.params).id, corpo,
      ),
    });
  });

  router.delete('/:id', async (req: AuthRequest, res: Response) => {
    await scheduledPaymentsService.remove(actor(req), idParam.parse(req.params).id);
    return ok(res, { deleted: true });
  });

  return router;
}
