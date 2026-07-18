// src/features/driver/services/support.service.ts
import { apiClient } from '@/shared/lib/api-client';

export type TicketStatus   = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TicketCategory = 'TECHNICAL' | 'FINANCIAL' | 'DOCUMENTS' | 'ACCOUNT' | 'OTHER';

export interface TicketAuthor {
  id:   string;
  name: string;
  role: string;
}

export interface TicketReply {
  id:        string;
  message:   string;
  createdAt: string;
  author:    TicketAuthor;
}

export interface ApiTicket {
  id:        string;
  subject:   string;
  category:  TicketCategory;
  message:   string;
  status:    TicketStatus;
  createdAt: string;
  updatedAt: string;
  user?:     { id: string; name: string; email: string };
  replies:   TicketReply[];
}

export const supportService = {
  list(): Promise<{ tickets: ApiTicket[] }> {
    return apiClient.get('/support');
  },

  getById(id: string): Promise<{ ticket: ApiTicket }> {
    return apiClient.get(`/support/${id}`);
  },

  create(data: { subject: string; category: TicketCategory; message: string }): Promise<{ ticket: ApiTicket }> {
    return apiClient.post('/support', data);
  },

  updateStatus(id: string, status: TicketStatus): Promise<{ ticket: ApiTicket }> {
    return apiClient.patch(`/support/${id}/status`, { status });
  },

  addReply(id: string, message: string): Promise<{ reply: TicketReply }> {
    return apiClient.post(`/support/${id}/replies`, { message });
  },
};