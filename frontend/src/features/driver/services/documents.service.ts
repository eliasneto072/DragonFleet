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
  /**
   * Datas lidas do documento pela administração ao rever.
   *
   * `null` limpa a data — em expiresAt, marca o documento como sem validade.
   * Omitir deixa como está, para que rejeitar não obrigue a preencher nada.
   */
  issuedAt?: string | null;
  expiresAt?: string | null;
}

/** Busca o ficheiro autenticado e devolve-o como Blob. */
async function fetchFileBlob(id: string): Promise<Blob> {
  const token = localStorage.getItem('dragonfleet:token');

  const res = await fetch(`${BASE_URL}/documents/${id}/file`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message ?? 'Erro ao abrir o documento.');
  }

  return res.blob();
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
    const win = window.open('', '_blank');

    try {
      const blob = await fetchFileBlob(id);
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
   * GET /documents/:id/file — devolve um object URL para usar em <img src>.
   *
   * IMPORTANTE: quem chama fica dono do URL e tem de o libertar com
   * URL.revokeObjectURL() ao desmontar. Sem isso cada visita à tela deixa um
   * blob retido em memória, e a fotografia de perfil é carregada a cada visita.
   */
  async getFileObjectUrl(id: string): Promise<string> {
    const blob = await fetchFileBlob(id);
    return URL.createObjectURL(blob);
  },

  /**
   * POST /documents — multipart/form-data
   * O backend recebe o arquivo e faz o upload para o Cloudinary internamente.
   * NÃO usar apiClient.post aqui pois ele força Content-Type: application/json.
   * `issuedAt` (ISO date) é obrigatório para o Registo Criminal.
   * `vehicleId` presente → documento pertence a um veículo (não é pessoal).
   */
  async create(type: DocumentType, file: File, issuedAt?: string, vehicleId?: string): Promise<{ document: ApiDocument }> {
    const token = localStorage.getItem('dragonfleet:token');

    const formData = new FormData();
    formData.append('type', type);
    formData.append('file', file);
    if (issuedAt) formData.append('issuedAt', issuedAt);
    if (vehicleId) formData.append('vehicleId', vehicleId);

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
