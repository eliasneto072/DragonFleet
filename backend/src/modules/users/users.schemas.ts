import { z } from 'zod';
import { UserRole, UserStatus } from '../../shared/types/enums';

export const userIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.nativeEnum(UserRole).optional(),
    status: z.nativeEnum(UserStatus).optional(),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z
    .object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      password: z.string().min(6).optional(),
      role: z.nativeEnum(UserRole).optional(),
      status: z.nativeEnum(UserStatus).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: 'At least one field is required',
    }),
});