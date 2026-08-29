// src/features/driver/services/documents.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiDocument, DocumentType, DocumentStatus } from '@/shared/types/api';


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

/** Obtém o ficheiro autenticado e devolve-o como Blob. */
async function fetchFileBlob(id: string): Promise<Blob> {
  const { blob } = await apiClient.download(`/documents/${id}/file`);
  return blob;
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
   * GET /documents/:id/file — abre o ficheiro numa nova aba.
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
   * POST /documents — multipart, com o ficheiro no mesmo pedido.
   *
   * Usa o apiClient.upload(), que deteta o FormData e deixa o browser pôr o
   * Content-Type com o boundary. Era esta limitação que obrigava ao fetch cru
   * que estava aqui — e esse fetch trazia três problemas que a migração resolve:
   *
   *   - repetia a leitura do token e o tratamento de erro;
   *   - lançava um Error genérico em vez de ApiError, perdendo o `code` que o
   *     backend devolve e que distingue um documento duplicado de um formato
   *     recusado;
   *   - e não passava pela renovação silenciosa da sessão, portanto um token
   *     que expirasse a meio de um envio dava 401 em vez de renovar. Enviar um
   *     documento é precisamente das operações mais demoradas da aplicação.
   *
   * `issuedAt` (ISO date) é obrigatório para o Registo Criminal.
   * `vehicleId` presente → documento pertence a um veículo (não é pessoal).
   */
  create(type: DocumentType, file: File, issuedAt?: string, vehicleId?: string): Promise<{ document: ApiDocument }> {
    const form = new FormData();
    form.append('type', type);
    form.append('file', file);
    if (issuedAt) form.append('issuedAt', issuedAt);
    if (vehicleId) form.append('vehicleId', vehicleId);

    return apiClient.upload('/documents', form);
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
