// src/features/driver/services/documents.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiDocument, DocumentType, DocumentStatus } from '@/shared/types/api';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface UpdateDocumentInput {
  type?:    DocumentType;
  fileUrl?: string;
}

interface UpdateStatusInput {
  status: DocumentStatus;
  notes?: string;
}

export const documentsService = {
  /** GET /documents */
  list(): Promise<{ documents: ApiDocument[] }> {
    return apiClient.get('/documents');
  },

  /** GET /documents/:id */
  getById(id: string): Promise<{ document: ApiDocument }> {
    return apiClient.get(`/documents/${id}`);
  },

  /**
   * POST /documents — multipart/form-data
   * O backend recebe o arquivo e faz o upload para o Cloudinary internamente.
   * NÃO usar apiClient.post aqui pois ele força Content-Type: application/json.
   */
  async create(type: DocumentType, file: File): Promise<{ document: ApiDocument }> {
    const token = localStorage.getItem('dragonfleet:token');

    const formData = new FormData();
    formData.append('type', type);
    formData.append('file', file);

    const res = await fetch(`${BASE_URL}/documents`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.message ?? 'Erro ao enviar documento.');
    }

    return json.data ?? json;
  },

  /** PATCH /documents/:id */
  update(id: string, input: UpdateDocumentInput): Promise<{ document: ApiDocument }> {
    return apiClient.patch(`/documents/${id}`, input);
  },

  /** PATCH /documents/:id/status — usado pelo admin para aprovar/rejeitar */
  updateStatus(id: string, input: UpdateStatusInput): Promise<{ document: ApiDocument }> {
    return apiClient.patch(`/documents/${id}/status`, input);
  },

  /** DELETE /documents/:id */
  remove(id: string): Promise<void> {
    return apiClient.delete(`/documents/${id}`);
  },
};