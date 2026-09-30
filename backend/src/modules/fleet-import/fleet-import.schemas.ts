// src/modules/fleet-import/fleet-import.schemas.ts

import { z } from 'zod';

/** "YYYY-MM-DD" */
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD');

/**
 * Um PDF em base64.
 *
 * O limite em caracteres é uma primeira barreira ANTES de descodificar: sem
 * ele, o servidor gastava memória a transformar 200 MB de texto num Buffer só
 * para depois o recusar. O limite real, em bytes, está no service.
 */
const pdfBase64 = z
  .string()
  .max(20_000_000, 'Ficheiro demasiado grande')
  .optional()
  .nullable();

export const importSchema = z.object({
  semanaInicio: dia,
  semanaFim: dia,
  viaVerdePdf: pdfBase64,
  prioFrotaPdf: pdfBase64,
  prioElectricPdf: pdfBase64,
  /**
   * Ganhos da Uber e da Bolt, se quem chama já os tiver.
   *
   * Opcional de propósito: quem arrasta os três PDFs na tela não os tem, e
   * preenche-os no rascunho. A extensão, que lê os quatro portais de seguida,
   * manda tudo num pedido e o fecho nasce completo.
   */
  ganhos: z
    .array(z.object({
      userId: z.string().min(1),
      uberAmount: z.coerce.number().min(0).optional(),
      boltAmount: z.coerce.number().min(0).optional(),
    }))
    .max(200)
    .optional(),
});

export type ImportBody = z.infer<typeof importSchema>;
