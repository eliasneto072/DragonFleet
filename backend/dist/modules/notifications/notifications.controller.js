"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsController = exports.NotificationsController = void 0;
const AppError_1 = require("../../shared/errors/AppError");
const response_1 = require("../../shared/http/response");
const notifications_service_1 = require("./notifications.service");
const notifications_schemas_1 = require("./notifications.schemas");
function getActor(req) {
    if (!req.user?.id) {
        throw new AppError_1.AppError('Unauthenticated', 401, 'UNAUTHENTICATED');
    }
    return {
        id: req.user.id,
        role: req.user.role
    };
}
class NotificationsController {
    constructor() {
        this.list = async (req, res) => {
            const notifications = await notifications_service_1.notificationsService.list(getActor(req));
            return (0, response_1.ok)(res, { notifications });
        };
        this.listByUser = async (req, res) => {
            const parsed = notifications_schemas_1.userIdParamSchema.parse({ params: req.params });
            const notifications = await notifications_service_1.notificationsService.listByUser(getActor(req), parsed.params.userId);
            return (0, response_1.ok)(res, { notifications });
        };
        this.getById = async (req, res) => {
            const parsed = notifications_schemas_1.notificationIdParamSchema.parse({ params: req.params });
            const notification = await notifications_service_1.notificationsService.getById(getActor(req), parsed.params.id);
            return (0, response_1.ok)(res, { notification });
        };
        this.create = async (req, res) => {
            const actor = getActor(req);
            const userId = actor.id;
            const parsed = notifications_schemas_1.createNotificationSchema.parse({ body: req.body });
            const notification = await notifications_service_1.notificationsService.create(actor, userId, parsed.body);
            return (0, response_1.ok)(res, { notification }, 201);
        };
        this.update = async (req, res) => {
            const actor = getActor(req);
            const userId = actor.id;
            const parsed = notifications_schemas_1.updateNotificationSchema.parse({
                params: req.params,
                body: req.body,
            });
            const notification = await notifications_service_1.notificationsService.update(actor, userId, parsed.params.id, parsed.body);
            return (0, response_1.ok)(res, { notification });
        };
        this.remove = async (req, res) => {
            const actor = getActor(req);
            const userId = actor.id;
            const parsed = notifications_schemas_1.notificationIdParamSchema.parse({ params: req.params });
            await notifications_service_1.notificationsService.remove(actor, userId, parsed.params.id);
            return res.status(204).send();
        };
    }
}
exports.NotificationsController = NotificationsController;
exports.notificationsController = new NotificationsController();
