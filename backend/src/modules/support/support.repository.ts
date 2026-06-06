// src/modules/support/support.repository.ts
import { prisma } from '../../config/prisma';
import { TicketStatus, TicketCategory } from '../../shared/types/enums';

interface CreateTicketData {
  subject:  string;
  category: TicketCategory;
  message:  string;
  userId:   string;
}

interface CreateReplyData {
  message:  string;
  ticketId: string;
  authorId: string;
}

interface UpdateStatusData {
  status: TicketStatus;
}

export const supportRepository = {
  async findAll() {
    return prisma.supportTicket.findMany({
      include: {
        user:    { select: { id: true, name: true, email: true } },
        replies: {
          include: { author: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findByUser(userId: string) {
    return prisma.supportTicket.findMany({
      where:   { userId },
      include: {
        replies: {
          include: { author: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findById(id: string) {
    return prisma.supportTicket.findUnique({
      where:   { id },
      include: {
        user:    { select: { id: true, name: true, email: true } },
        replies: {
          include: { author: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  },

  async create(data: CreateTicketData) {
    return prisma.supportTicket.create({
      data,
      include: { replies: true },
    });
  },

  async updateStatus(id: string, data: UpdateStatusData) {
    return prisma.supportTicket.update({
      where: { id },
      data:  { ...data, updatedAt: new Date() },
      include: { replies: true },
    });
  },

  async addReply(data: CreateReplyData) {
    return prisma.ticketReply.create({
      data,
      include: { author: { select: { id: true, name: true, role: true } } },
    });
  },
};