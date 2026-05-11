"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateWithdrawalStatusSchema = exports.createWithdrawalSchema = exports.userIdParamSchema = exports.withdrawalIdParamSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("../../shared/types/enums");
exports.withdrawalIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
});
exports.userIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().min(1),
    }),
});
exports.createWithdrawalSchema = zod_1.z.object({
    body: zod_1.z.object({
        amount: zod_1.z.coerce.number().positive(),
    }),
});
exports.updateWithdrawalStatusSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
    body: zod_1.z.object({
        status: zod_1.z.nativeEnum(enums_1.WithdrawalStatus),
        notes: zod_1.z.string().min(1).optional(),
    }),
});
