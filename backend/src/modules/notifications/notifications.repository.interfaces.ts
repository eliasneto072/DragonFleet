import { CreateNotificationData, UpdateNotificationData } from "./notifications.repository.types";
import { INotificationPublic } from "./notifications.types";

export interface INotificationRepository {
    findAll(): Promise<INotificationPublic[]>
    findById(id: string): Promise<INotificationPublic | null>
    findByUserId(userId: string): Promise<INotificationPublic[]>
    create(data: CreateNotificationData): Promise<INotificationPublic>
    update(id: string, data: UpdateNotificationData): Promise<INotificationPublic>
    delete(id: string): Promise<void>
}