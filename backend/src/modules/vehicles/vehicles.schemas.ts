import { z } from 'zod';
import { VehicleStatus } from '../../shared/types/enums';

export const vehicleIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({
    userId: z.string().min(1),
  }),
});

export const createVehicleSchema = z.object({
  body: z.object({
    brand: z.string().min(2),
    model: z.string().min(1),
    plate: z.string().min(5).max(10),
    year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1),
    status: z.nativeEnum(VehicleStatus).optional(),
    userId: z.string().min(1),

  }),
});

export const updateVehicleSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z
    .object({
      brand: z.string().min(2).optional(),
      model: z.string().min(1).optional(),
      plate: z.string().min(5).max(10).optional(),
      year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1).optional(), // fix: era obrigatório antes
      status: z.nativeEnum(VehicleStatus).optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
});