// src/features/driver/services/documents.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiDocument, DocumentType, DocumentStatus } from '@/shared/types/api';

interface CreateDocumentInput {
  type:    DocumentType;
  fileUrl: string;
}

interface UpdateDocumentInput {
  type?:    DocumentType;
  fileUrl?: string;
}

export const documentsService = {
  /** GET /documents — lista do usuário logado (ou todos, se admin) */
  list(): Promise<{ documents: ApiDocument[] }> {
    return apiClient.get('/documents');
  },

  /** GET /documents/:id */
  getById(id: string): Promise<{ document: ApiDocument }> {
    return apiClient.get(`/documents/${id}`);
  },

  /** POST /documents */
  create(input: CreateDocumentInput): Promise<{ document: ApiDocument }> {
    return apiClient.post('/documents', input);
  },

  /** PATCH /documents/:id — atualiza tipo ou URL do arquivo */
  update(id: string, input: UpdateDocumentInput): Promise<{ document: ApiDocument }> {
    return apiClient.patch(`/documents/${id}`, input);
  },

  /** PATCH /documents/:id/status — apenas admin/manager aprova ou rejeita */
  updateStatus(
    id: string,
    status: DocumentStatus,
  ): Promise<{ document: ApiDocument }> {
    return apiClient.patch(`/documents/${id}/status`, { status });
  },

  /** DELETE /documents/:id */
  remove(id: string): Promise<void> {
    return apiClient.delete(`/documents/${id}`);
  },
};