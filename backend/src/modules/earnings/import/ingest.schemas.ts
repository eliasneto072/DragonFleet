// src/modules/earnings/import/ingest.schemas.ts

import { z } from 'zod';
import { EarningPlatform } from '../../../shared/types/enums';

/**
 * Uma linha lida do portal.
 *
 * O valor é `coerce` porque a extensão lê texto do DOM: "1.234,56" já vem
 * convertido do lado dela, mas um número enviado como string não deve fazer o
 * envio inteiro falhar.
 */
const ingestRow = z.object({
  driverName: z.string().trim().min(1).max(200),
  amount: z.coerce.number().finite(),
});

export const ingestSchema = z.object({
  body: z.object({
    platform: z.nativeEnum(EarningPlatform),
    // AAAA-MM-DD. A conversão para Date é feita no service, que também recusa
    // datas impossíveis como 2026-02-31.
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser AAAA-MM-DD'),
    rows: z.array(ingestRow).min(1).max(500),
  }),
});
