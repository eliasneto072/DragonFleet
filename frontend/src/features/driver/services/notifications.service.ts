// src/features/driver/services/notifications.service.ts

import { apiClient } from '@/shared/lib/api-client';
import type { ApiNotification } from '@/shared/types/api';

export const notificationsService = {
  /** GET /notifications — lista do usuário logado (ou todas, se admin) */
  list(): Promise<{ notifications: ApiNotification[] }> {
    return apiClient.get('/notifications');
  },

  /** GET /notifications/user/:userId */
  listByUser(userId: string): Promise<{ notifications: ApiNotification[] }> {
    return apiClient.get(`/notifications/user/${userId}`);
  },

  /** GET /notifications/:id */
  getById(id: string): Promise<{ notification: ApiNotification }> {
    return apiClient.get(`/notifications/${id}`);
  },

  /**
   * PATCH /notifications/:id
   * Marca uma notificação como lida passando { read: true }.
   * O backend aceita title/message também, mas o caso de uso principal é o read.
   */
  markAsRead(id: string): Promise<{ notification: ApiNotification }> {
    return apiClient.patch(`/notifications/${id}`, { read: true });
  },

  /** DELETE /notifications/:id */
  remove(id: string): Promise<void> {
    return apiClient.delete(`/notifications/${id}`);
  },
};