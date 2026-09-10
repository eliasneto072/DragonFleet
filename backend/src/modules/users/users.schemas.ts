import { z } from 'zod';
import { UserRole, UserStatus } from '../../shared/types/enums';
import { normalizePhone, isValidPhone } from '../../shared/utils/phone';

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
      // Contacto telefónico.
      //
      // Normalizado AQUI e não no service, para que o 400 saia com uma
      // mensagem clara em vez de a base recusar mais à frente. Aceita `null`
      // explícito para permitir apagar o contacto.
      //
      // Não exige `currentPassword`: essa reautenticação existe para o email e
      // para a palavra-passe, que são credenciais de acesso. O telefone não é,
      // tal como o nome não é.
      phone: z
        .union([z.string().max(32), z.null()])
        .optional()
        .transform((v) => (v === undefined ? undefined : normalizePhone(v)))
        .refine((v) => v === undefined || isValidPhone(v), {
          message: 'Telefone inválido — indique entre 6 e 15 dígitos, com indicativo se for estrangeiro',
        }),
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
