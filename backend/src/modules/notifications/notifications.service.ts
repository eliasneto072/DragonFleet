import { Actor, IUser, IUserPublic } from "../users/users.types";
import { UserRole } from "../../shared/types/enums";
import { INotificationPublic } from "./notifications.types";
import { AppError } from "../../shared/errors/AppError";
import { notificationsRepository } from "./notifications.repository";
import { usersRepository } from "../users/users.repository";
import { CreateNotificationInput, UpdateNotificationInput } from "./notifications.service.types";
import { CreateNotificationData, UpdateNotificationData } from "./notifications.repository.types";




function canManageNotifications(role?: UserRole) {
    return role === UserRole.ADMIN || role === UserRole.MANAGER
}

export class NotificationsService {
  private async ensureNotificationExists(id: string): Promise<INotificationPublic> {
        const notification = await notificationsRepository.findById(id)

        if (!notification) {
            throw new AppError('notification not found', 404, 'NOTIFICATION_NOT_FOUND')
        }
        
        return notification
  }

    private async ensureUserExists(userId: string): Promise<void> {
    const user = await usersRepository.findById(userId);

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
  }

  async list(actor: Actor): Promise<INotificationPublic[]> {
    
    if (canManageNotifications(actor.role)){
        return notificationsRepository.findAll()
    }

    return notificationsRepository.findByUserId(actor.id)
  }

  async listByUser(actor: Actor, userId: string): Promise<INotificationPublic[]> {
    if (!canManageNotifications(actor.role) && actor.id !== userId){
        throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }
    
    await this.ensureUserExists(userId)

    return notificationsRepository.findByUserId(userId)
  }

  async getById(actor: Actor, id: string): Promise<INotificationPublic | null> {
    
    if (!canManageNotifications || actor.id !== id){
      throw new AppError('forbidden', 403, 'FORBIDDEN')
    }

    return this.ensureNotificationExists(id)

  }

  async create(actor: Actor, userId: string, input: CreateNotificationInput): Promise<INotificationPublic> {
    
    await this.ensureUserExists(userId)
    
    const data: CreateNotificationData = {
      title: input.title,
      message: input.message,
      userId,
    }

    return await notificationsRepository.create(data)

  }

  async update(actor: Actor, userId: string, id: string, input: UpdateNotificationInput): Promise<INotificationPublic> {
    
    const notification =  await this.ensureNotificationExists(id)
    
    if(!canManageNotifications(actor.role) &&  notification.userId !== actor.id) {
      throw new AppError('forbidden', 403, 'FORBIDDEN')
    }

    await this.ensureNotificationExists(id)

    const data: UpdateNotificationData = {
      ...(input.title !== undefined ? { title: input.title }: {}),
      ...(input.message !== undefined ? {message: input.message}: {}),
      ...(input.read !== undefined ? {read: input.read}: {})
    }

    return await notificationsRepository.update(id, data)

  }

  async remove(actor: Actor, userId: string, id: string): Promise<void> {

    if(!canManageNotifications(actor.role) || actor.id !== userId){
      throw new AppError('forbidden', 403, 'FORBIDDEN')
    }

    await this.ensureNotificationExists(id)

    return await notificationsRepository.delete(id)

  }

}

export const notificationsService = new NotificationsService()