// src/features/driver/services/notifications.service.ts
import { apiClient } from '@/shared/lib/api-client';
import type { ApiNotification } from '@/shared/types/api';

export const notificationsService = {
  list(): Promise<{ notifications: ApiNotification[] }> {
    return apiClient.get('/notifications');
  },

  listByUser(userId: string): Promise<{ notifications: ApiNotification[] }> {
    return apiClient.get(`/notifications/user/${userId}`);
  },

  getById(id: string): Promise<{ notification: ApiNotification }> {
    return apiClient.get(`/notifications/${id}`);
  },

  /** Admin — envia para um driver específico */
  create(userId: string, title: string, message: string): Promise<{ notification: ApiNotification }> {
    return apiClient.post('/notifications', { userId, title, message });
  },

  /** Admin — envia para todos os drivers */
  broadcast(title: string, message: string): Promise<{ count: number }> {
    return apiClient.post('/notifications/broadcast', { title, message });
  },

  markAsRead(id: string): Promise<{ notification: ApiNotification }> {
    return apiClient.patch(`/notifications/${id}`, { read: true });
  },

  remove(id: string): Promise<void> {
    return apiClient.delete(`/notifications/${id}`);
  },
};