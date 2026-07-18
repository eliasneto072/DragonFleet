import { prisma } from "../../config/prisma";
import { logger } from "../../shared/utils/logger";
import { INotificationRepository } from "./notifications.repository.interfaces";
import { CreateNotificationData, UpdateNotificationData } from "./notifications.repository.types";
import { INotificationPublic } from "./notifications.types";

export class NotificationsRepository implements INotificationRepository {

    private readonly publicSelect = {
        id: true,
        title: true,
        message: true,
        read: true,
        userId: true,
        createdAt: true,
    } as const

    async findAll(): Promise<INotificationPublic[]> {
        try{
            return await prisma.notification.findMany({
                select: this.publicSelect,
                orderBy: { createdAt: 'desc' }
            })
            
        } catch (err) {
            logger.error('Erro ao buscar notifications', err);
            throw err;
        }
    }
    
    async findById(id: string): Promise<INotificationPublic | null> {
        try{
            return await prisma.notification.findUnique({
            where: { id },
            select: this.publicSelect
            })

        }catch(err) {
            logger.error('Erro', err);
            throw err;
        }
    }

    async findByUserId(userId: string): Promise<INotificationPublic[]> {
        try{
            return await prisma.notification.findMany({
                where: {userId},
                select: this.publicSelect,
                orderBy: {createdAt: 'desc'},
            })

        }catch(err) {
            logger.error('Erro', err);
            throw err;
        }
    }

    async create(data: CreateNotificationData): Promise<INotificationPublic> {
        try {
           const newData: CreateNotificationData = {
            title: data.title,
            message: data.message,
            userId: data.userId,
           }
           return await prisma.notification.create({
            data: newData,
            select: this.publicSelect,
           })
        }catch(err) {
            logger.error('Erro', err);
            throw err;
        }
    }

    async update(id: string, data: UpdateNotificationData): Promise<INotificationPublic> {
        try {
            return await prisma.notification.update({
                where: { id },
                data: {
                    ...(data.title !== undefined ? {title: data.title}: {}),
                    ...(data.message !== undefined ? {message: data.message}: {}),
                    ...(data.read !== undefined ? {read: data.read}: {})
                },
                select: this.publicSelect
            })

        } catch(err) {
            logger.error('Erro', err);
            throw err;
        }
    }

    async delete(id: string): Promise<void> {
        try {
            await prisma.notification.delete({
                where: {id},
            })
        }catch(err) {
            logger.error('Erro', err);
            throw err;
        }
    }
}


export const notificationsRepository = new NotificationsRepository()