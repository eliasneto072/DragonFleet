import { z } from 'zod';
import { UserRole, UserStatus } from '../../shared/types/enums';

export const userIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

// Registo público: POST /users é servido sem autenticação, por isso o corpo
// não pode aceitar `role` nem `status`. Aceitá-los permitia a qualquer pessoa
// registar-se como ADMIN. O papel e o estado são fixados no service.
//
// Um endpoint de criação administrativa, se vier a existir, precisa de schema
// próprio e de requireAdmin na rota.
export const createUserSchema = z.object({
  body: z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
    })
    .strict(),
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
      // Reautenticação. Não é um campo alterável — serve para confirmar a
      // identidade antes de mudar a palavra-passe ou o email.
      currentPassword: z.string().min(1).optional(),
      role: z.nativeEnum(UserRole).optional(),
      status: z.nativeEnum(UserStatus).optional(),
    })
    .refine((b) => Object.keys(b).some((key) => key !== 'currentPassword'), {
      message: 'Informe pelo menos um campo para atualizar',
    }),
});
