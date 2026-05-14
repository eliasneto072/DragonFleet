"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsService = exports.NotificationsService = void 0;
const enums_1 = require("../../shared/types/enums");
const AppError_1 = require("../../shared/errors/AppError");
const notifications_repository_1 = require("./notifications.repository");
const users_repository_1 = require("../users/users.repository");
function canManageNotifications(role) {
    return role === enums_1.UserRole.ADMIN || role === enums_1.UserRole.MANAGER;
}
class NotificationsService {
    async ensureNotificationExists(id) {
        const notification = await notifications_repository_1.notificationsRepository.findById(id);
        if (!notification) {
            throw new AppError_1.AppError('notification not found', 404, 'NOTIFICATION_NOT_FOUND');
        }
        return notification;
    }
    async ensureUserExists(userId) {
        const user = await users_repository_1.usersRepository.findById(userId);
        if (!user) {
            throw new AppError_1.AppError('User not found', 404, 'USER_NOT_FOUND');
        }
    }
    async list(actor) {
        if (canManageNotifications(actor.role)) {
            return notifications_repository_1.notificationsRepository.findAll();
        }
        return notifications_repository_1.notificationsRepository.findByUserId(actor.id);
    }
    async listByUser(actor, userId) {
        if (!canManageNotifications(actor.role) && actor.id !== userId) {
            throw new AppError_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        await this.ensureUserExists(userId);
        return notifications_repository_1.notificationsRepository.findByUserId(userId);
    }
    async getById(actor, id) {
        if (!canManageNotifications || actor.id !== id) {
            throw new AppError_1.AppError('forbidden', 403, 'FORBIDDEN');
        }
        return this.ensureNotificationExists(id);
    }
    async create(actor, userId, input) {
        await this.ensureUserExists(userId);
        const data = {
            title: input.title,
            message: input.message,
            userId,
        };
        return await notifications_repository_1.notificationsRepository.create(data);
    }
    async update(actor, userId, id, input) {
        const notification = await this.ensureNotificationExists(id);
        if (!canManageNotifications(actor.role) && notification.userId !== actor.id) {
            throw new AppError_1.AppError('forbidden', 403, 'FORBIDDEN');
        }
        await this.ensureNotificationExists(id);
        const data = {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.message !== undefined ? { message: input.message } : {}),
            ...(input.read !== undefined ? { read: input.read } : {})
        };
        return await notifications_repository_1.notificationsRepository.update(id, data);
    }
    async remove(actor, userId, id) {
        if (!canManageNotifications(actor.role) || actor.id !== userId) {
            throw new AppError_1.AppError('forbidden', 403, 'FORBIDDEN');
        }
        await this.ensureNotificationExists(id);
        return await notifications_repository_1.notificationsRepository.delete(id);
    }
}
exports.NotificationsService = NotificationsService;
exports.notificationsService = new NotificationsService();
