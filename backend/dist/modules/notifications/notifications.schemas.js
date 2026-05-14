"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setNotificationReadSchema = exports.updateNotificationSchema = exports.createNotificationSchema = exports.userIdParamSchema = exports.notificationIdParamSchema = void 0;
const zod_1 = require("zod");
exports.notificationIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
});
exports.userIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().min(1),
    }),
});
exports.createNotificationSchema = zod_1.z.object({
    body: zod_1.z.object({
        title: zod_1.z.string().min(1),
        message: zod_1.z.string().min(1),
    }),
});
exports.updateNotificationSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
    body: zod_1.z
        .object({
        title: zod_1.z.string().min(1).optional(),
        message: zod_1.z.string().min(1).optional(),
    })
        .refine((body) => Object.keys(body).length > 0, {
        message: 'At least one field is required',
    }),
});
exports.setNotificationReadSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
    body: zod_1.z.object({
        read: zod_1.z.boolean(),
    }),
});
