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
    vin: z.string().min(5).max(20).optional(),
    status: z.nativeEnum(VehicleStatus).optional(),
    /** Encargo semanal. Sugerido no fecho, e lá continua editável. */
    weeklyFee: z.coerce.number().min(0).optional(),
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
      vin: z.string().min(5).max(20).optional(),
      status: z.nativeEnum(VehicleStatus).optional(),
      weeklyFee: z.coerce.number().min(0).optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
});

// Atribuir veículo a um motorista
export const assignVehicleSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    userId: z.string().min(1),
  }),
});

// Fase 1 — "quem teve este carro neste dia".
//
// Query string e nao body, porque a consulta e uma LEITURA e tem de ser
// partilhavel: quem investiga uma multa quer poder colar o link no processo, ou
// mandar a alguem para confirmar. Um POST com body nao se cola em lado nenhum.
//
// A data e `YYYY-MM-DD` e nao um DateTime completo: quem lê um aviso de multa
// tem uma data, nao um instante. Pedir horas seria pedir o que a pessoa nao tem.
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export const assignmentLookupSchema = z.object({
  query: z
    .object({
      plate: z.string().trim().min(1, 'Indique a matricula'),
      from: z.string().regex(DIA, 'Data invalida — use AAAA-MM-DD'),
      // Ausente = consulta de um dia so. O Diogo escreveu "datas" no plural e a
      // seguir "naquele dia"; suportar as duas coisas custa este opcional.
      to: z.string().regex(DIA, 'Data invalida — use AAAA-MM-DD').optional(),
    })
    .refine((q) => q.to === undefined || q.to >= q.from, {
      message: 'A data de fim nao pode ser anterior a de inicio',
      path: ['to'],
    }),
});
