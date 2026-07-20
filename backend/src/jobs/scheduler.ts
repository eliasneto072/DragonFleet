// src/jobs/scheduler.ts
//
// Agendador central dos jobs do sistema. Usa node-cron.
// Por agora só corre a verificação de validade de documentos, uma vez por dia.
//
// Requer a dependência: npm install node-cron  (e os tipos: npm i -D @types/node-cron)

import cron from 'node-cron';
import { runDocumentsExpiryCheck } from './documents-expiry.job';

// Corre todos os dias às 03:00 (hora do servidor). Horário de baixa utilização.
const DOCUMENTS_EXPIRY_SCHEDULE = '0 3 * * *';

export function startScheduler(): void {
  // Validação de documentos (regra dos 90 dias)
  cron.schedule(DOCUMENTS_EXPIRY_SCHEDULE, () => {
    runDocumentsExpiryCheck().catch((err) =>
      console.error('[scheduler] Erro ao correr a verificação de documentos:', err),
    );
  });

  console.log('[scheduler] Jobs agendados. Validade de documentos: todos os dias às 03:00.');
}
