// src/modules/notifications/notifications.service.ts
import { Actor }              from '../users/users.types';
import { UserRole }           from '../../shared/types/enums';
import { INotificationPublic } from './notifications.types';
import { AppError }           from '../../shared/errors/AppError';
import { notificationsRepository } from './notifications.repository';
import { usersRepository }    from '../users/users.repository';
import { CreateNotificationInput, UpdateNotificationInput } from './notifications.service.types';
import { CreateNotificationData, UpdateNotificationData }   from './notifications.repository.types';
import { emailService }       from '../../shared/services/email.service';

function canManageNotifications(role?: UserRole) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export class NotificationsService {
  private async ensureNotificationExists(id: string): Promise<INotificationPublic> {
    const notification = await notificationsRepository.findById(id);
    if (!notification) throw new AppError('notification not found', 404, 'NOTIFICATION_NOT_FOUND');
    return notification;
  }

  private async ensureUserExists(userId: string) {
    const user = await usersRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    return user;
  }

  async list(actor: Actor): Promise<INotificationPublic[]> {
    if (canManageNotifications(actor.role)) return notificationsRepository.findAll();
    return notificationsRepository.findByUserId(actor.id);
  }

  async listByUser(actor: Actor, userId: string): Promise<INotificationPublic[]> {
    if (!canManageNotifications(actor.role) && actor.id !== userId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    await this.ensureUserExists(userId);
    return notificationsRepository.findByUserId(userId);
  }

  async getById(actor: Actor, id: string): Promise<INotificationPublic | null> {
    const notification = await this.ensureNotificationExists(id);
    if (!canManageNotifications(actor.role) && notification.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    return notification;
  }

  async create(actor: Actor, userId: string, input: CreateNotificationInput): Promise<INotificationPublic> {
    if (!canManageNotifications(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const user = await this.ensureUserExists(userId);

    const data: CreateNotificationData = {
      title:   input.title,
      message: input.message,
      userId,
    };

    const notification = await notificationsRepository.create(data);

    // ── Enviar email ao driver ────────────────────────────────────────────
    try {
      if (user.email) {
        await emailService.sendNotification(user.email, user.name, input.title, input.message);
      }
    } catch (err) {
      console.error('[email] Failed to send notification email:', err);
    }

    return notification;
  }

  async createBroadcast(actor: Actor, input: CreateNotificationInput): Promise<{ count: number }> {
    if (!canManageNotifications(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const drivers = await usersRepository.findAll();
    const driverList = drivers.filter(u => u.role === UserRole.DRIVER);

    let count = 0;
    for (const driver of driverList) {
      await notificationsRepository.create({
        title:   input.title,
        message: input.message,
        userId:  driver.id,
      });

      try {
        await emailService.sendNotification(driver.email, driver.name, input.title, input.message);
      } catch (err) {
        console.error(`[email] Failed to send to ${driver.email}:`, err);
      }

      count++;
    }

    return { count };
  }

  async update(actor: Actor, userId: string, id: string, input: UpdateNotificationInput): Promise<INotificationPublic> {
    const notification = await this.ensureNotificationExists(id);
    if (!canManageNotifications(actor.role) && notification.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const data: UpdateNotificationData = {
      ...(input.title   !== undefined ? { title:   input.title   } : {}),
      ...(input.message !== undefined ? { message: input.message } : {}),
      ...(input.read    !== undefined ? { read:    input.read    } : {}),
    };

    return notificationsRepository.update(id, data);
  }

  async remove(actor: Actor, userId: string, id: string): Promise<void> {
    const notification = await this.ensureNotificationExists(id);
    if (!canManageNotifications(actor.role) && notification.userId !== actor.id) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    return notificationsRepository.delete(id);
  }
}

export const notificationsService = new NotificationsService();