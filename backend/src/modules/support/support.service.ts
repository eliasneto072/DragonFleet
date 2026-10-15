// src/modules/support/support.service.ts
import { AppError }     from '../../shared/errors/AppError';
import { UserRole, TicketStatus, TicketCategory } from '../../shared/types/enums';
import { supportRepository } from './support.repository';
import { avisarGestao } from '../../shared/services/avisos';
import { avisar } from '../../shared/services/avisos';

type Actor = { id: string; role?: UserRole };

function isAdmin(role?: UserRole) {
  // O SUPPORT tem aqui tudo — é o único sítio onde ele escreve. Em todos os
  // outros módulos vê e não toca.
  return role === UserRole.ADMIN
      || role === UserRole.MANAGER
      || role === UserRole.SUPPORT;
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
    const ticket = await supportRepository.create({ ...data, userId: actor.id });

    // Até aqui, um ticket aberto não avisava ninguém: ficava na base de dados
    // à espera de que alguém abrisse a página do suporte. Quem escreve a pedir
    // ajuda espera resposta, e quem não a recebe liga pelo telefone.
    await avisarGestao({
      titulo: `Novo pedido de suporte: ${data.subject}`,
      mensagem: `Foi aberto um pedido de suporte.\n\n${data.message}`,
    });

    return ticket;
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
    const resposta = await supportRepository.addReply({ message, ticketId, authorId: actor.id });

    // A resposta vai para o outro lado: se respondeu a administração, avisa-se
    // o motorista; se foi ele, avisa-se a administração. Sem isto, qualquer um
    // dos dois tinha de voltar à página para saber que havia novidade.
    if (isAdmin(actor.role)) {
      await avisar(ticket.userId, {
        titulo: `Resposta ao seu pedido: ${ticket.subject}`,
        mensagem: message,
      });
    } else {
      await avisarGestao({
        titulo: `Resposta num pedido de suporte: ${ticket.subject}`,
        mensagem: `Houve uma resposta nova.\n\n${message}`,
      });
    }

    return resposta;
  }
}

export const supportService = new SupportService();