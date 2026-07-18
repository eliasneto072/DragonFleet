// src/modules/support/support.controller.ts
import type { Response } from 'express';
import type { AuthRequest } from '../../middlewares/auth.middleware';
import { ok }            from '../../shared/http/response';
import { AppError }      from '../../shared/errors/AppError';
import { supportService } from './support.service';
import { TicketStatus, TicketCategory } from '../../shared/types/enums';

function getActor(req: AuthRequest) {
  if (!req.user?.id) throw new AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
  return { id: req.user.id, role: req.user.role };
}

export class SupportController {
  list = async (req: AuthRequest, res: Response) => {
    const tickets = await supportService.list(getActor(req));
    return ok(res, { tickets });
  };

  getById = async (req: AuthRequest, res: Response) => {
    const ticket = await supportService.getById(getActor(req), req.params.id as string);
    return ok(res, { ticket });
  };

  create = async (req: AuthRequest, res: Response) => {
    const { subject, category, message } = req.body;
    if (!subject || !category || !message) {
      throw new AppError('subject, category and message are required', 400, 'VALIDATION_ERROR');
    }
    const ticket = await supportService.create(getActor(req), {
      subject,
      category: category as TicketCategory,
      message,
    });
    return ok(res, { ticket }, 201);
  };

  updateStatus = async (req: AuthRequest, res: Response) => {
    const { status } = req.body;
    if (!status) throw new AppError('status is required', 400, 'VALIDATION_ERROR');
    const ticket = await supportService.updateStatus(getActor(req), req.params.id as string, status as TicketStatus);
    return ok(res, { ticket });
  };

  addReply = async (req: AuthRequest, res: Response) => {
    const { message } = req.body;
    if (!message) throw new AppError('message is required', 400, 'VALIDATION_ERROR');
    const reply = await supportService.addReply(getActor(req), req.params.id as string, message);
    return ok(res, { reply }, 201);
  };
}

export const supportController = new SupportController();