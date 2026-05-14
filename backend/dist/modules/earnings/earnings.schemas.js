"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEarningSchema = exports.createEarningSchema = exports.userIdParamSchema = exports.earningIdParamSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("../../shared/types/enums");
exports.earningIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
});
exports.userIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().min(1),
    }),
});
exports.createEarningSchema = zod_1.z.object({
    body: zod_1.z.object({
        amount: zod_1.z.coerce.number().positive(),
        date: zod_1.z.coerce.date(),
        platform: zod_1.z.nativeEnum(enums_1.EarningPlatform),
        userId: zod_1.z.string().min(1).optional(), // admin pode especificar, driver usa o próprio id
    }),
});
exports.updateEarningSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
    body: zod_1.z
        .object({
        amount: zod_1.z.coerce.number().positive().optional(),
        date: zod_1.z.coerce.date().optional(),
        platform: zod_1.z.nativeEnum(enums_1.EarningPlatform).optional(),
    })
        .refine((body) => Object.keys(body).length > 0, {
        message: 'At least one field is required',
    }),
});
