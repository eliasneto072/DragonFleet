import { z } from 'zod';

export const notificationIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({
    userId: z.string().min(1),
  }),
});

export const createNotificationSchema = z.object({
  body: z.object({
    title: z.string().min(1),
    message: z.string().min(1),
  }),
});

export const updateNotificationSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z
    .object({
      title: z.string().min(1).optional(),
      message: z.string().min(1).optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
});

export const setNotificationReadSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    read: z.boolean(),
  }),
});