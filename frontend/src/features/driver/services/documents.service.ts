// src/features/driver/services/documents.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiDocument, DocumentType, DocumentStatus } from '@/shared/types/api';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface UpdateDocumentInput {
  type?: DocumentType;
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
   * GET /documents/:id/file — abre o arquivo numa nova aba.
   * Busca com o token JWT (window.open puro não envia headers) e abre como blob.
   * Abrimos a janela ANTES do fetch para não ser bloqueada pelo popup blocker.
   */
  async openFile(id: string): Promise<void> {
    const token = localStorage.getItem('dragonfleet:token');
    const win = window.open('', '_blank');

    try {
      const res = await fetch(`${BASE_URL}/documents/${id}/file`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message ?? 'Erro ao abrir o documento.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (win) {
        win.location.href = url;
      } else {
        // Fallback se o popup foi bloqueado
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
      }

      // Libera a memória depois que a aba já carregou o blob
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      win?.close();
      throw err;
    }
  },

  /**
   * POST /documents — multipart/form-data
   * O backend recebe o arquivo e faz o upload para o Cloudinary internamente.
   * NÃO usar apiClient.post aqui pois ele força Content-Type: application/json.
   * `issuedAt` (ISO date) é obrigatório para o Registo Criminal.
   */
  async create(type: DocumentType, file: File, issuedAt?: string): Promise<{ document: ApiDocument }> {
    const token = localStorage.getItem('dragonfleet:token');

    const formData = new FormData();
    formData.append('type', type);
    formData.append('file', file);
    if (issuedAt) formData.append('issuedAt', issuedAt);

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