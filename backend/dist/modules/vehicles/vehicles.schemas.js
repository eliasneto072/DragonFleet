"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateVehicleSchema = exports.createVehicleSchema = exports.userIdParamSchema = exports.vehicleIdParamSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("../../shared/types/enums");
exports.vehicleIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
});
exports.userIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().min(1),
    }),
});
exports.createVehicleSchema = zod_1.z.object({
    body: zod_1.z.object({
        brand: zod_1.z.string().min(2),
        model: zod_1.z.string().min(1),
        plate: zod_1.z.string().min(5).max(10),
        year: zod_1.z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1),
        status: zod_1.z.nativeEnum(enums_1.VehicleStatus).optional(),
        //userId: z.string().min(1),
    }),
});
exports.updateVehicleSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1),
    }),
    body: zod_1.z
        .object({
        brand: zod_1.z.string().min(2).optional(),
        model: zod_1.z.string().min(1).optional(),
        plate: zod_1.z.string().min(5).max(10).optional(),
        year: zod_1.z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1).optional(), // fix: era obrigatório antes
        status: zod_1.z.nativeEnum(enums_1.VehicleStatus).optional(),
    })
        .refine((body) => Object.keys(body).length > 0, {
        message: 'At least one field is required',
    }),
});
