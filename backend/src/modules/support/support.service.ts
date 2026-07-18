// src/modules/support/support.service.ts
import { AppError }     from '../../shared/errors/AppError';
import { UserRole, TicketStatus, TicketCategory } from '../../shared/types/enums';
import { supportRepository } from './support.repository';

type Actor = { id: string; role?: UserRole };

function isAdmin(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export class SupportService {
  /** Listar — admin vê todos, driver vê apenas os seus */
  async list(actor: Actor) {
    if (isAdmin(actor.role)) return supportRepository.findAll();
    return supportRepository.findByUser(actor.id);
  }

  /** Buscar por ID — driver só acede ao seu próprio */
  async getById(actor: Actor, id: string) {
    const ticket = await supportRepository.findById(id);
    if (!ticket) throw new AppError('Ticket not found', 404, 'NOT_FOUND');
    if (!isAdmin(actor.role) && ticket.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    return ticket;
  }

  /** Criar ticket — apenas drivers */
  async create(actor: Actor, data: { subject: string; category: TicketCategory; message: string }) {
    return supportRepository.create({ ...data, userId: actor.id });
  }

  /** Atualizar status — apenas admin */
  async updateStatus(actor: Actor, id: string, status: TicketStatus) {
    if (!isAdmin(actor.role)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    const ticket = await supportRepository.findById(id);
    if (!ticket) throw new AppError('Ticket not found', 404, 'NOT_FOUND');
    return supportRepository.updateStatus(id, { status });
  }

  /** Adicionar resposta — admin ou dono do ticket */
  async addReply(actor: Actor, ticketId: string, message: string) {
    const ticket = await supportRepository.findById(ticketId);
    if (!ticket) throw new AppError('Ticket not found', 404, 'NOT_FOUND');
    if (!isAdmin(actor.role) && ticket.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    // Se admin responde → muda status para IN_PROGRESS automaticamente
    if (isAdmin(actor.role) && ticket.status === TicketStatus.OPEN) {
      await supportRepository.updateStatus(ticketId, { status: TicketStatus.IN_PROGRESS });
    }
    return supportRepository.addReply({ message, ticketId, authorId: actor.id });
  }
}

export const supportService = new SupportService();