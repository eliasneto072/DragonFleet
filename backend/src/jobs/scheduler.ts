// src/jobs/scheduler.ts
//
// Agendador central dos jobs do sistema. Usa node-cron.

import cron from 'node-cron';
import { runDocumentsExpiryCheck } from './documents-expiry.job';
import { runInvestmentsAccrual } from './investments-accrual.job';

// Corre todos os dias às 03:00 (hora do servidor). Horário de baixa utilização.
const DOCUMENTS_EXPIRY_SCHEDULE = '0 3 * * *';

// Investimentos: 00:15 em LISBOA, com o fuso explícito. O servidor do Render
// corre em UTC, e sem o fuso o "dia de ontem" fechava à uma da manhã no verão.
// Não faz mal se falhar uma noite: a próxima execução (ou um resgate) paga os
// dias em falta. Também corre ao arrancar, pelo mesmo motivo — um deploy à
// meia-noite não deixa ninguém sem o dia.
const INVESTMENTS_SCHEDULE = '15 0 * * *';

export function startScheduler(): void {
  // Validação de documentos (regra dos 90 dias)
  cron.schedule(DOCUMENTS_EXPIRY_SCHEDULE, () => {
    runDocumentsExpiryCheck().catch((err) =>
      console.error('[scheduler] Erro ao correr a verificação de documentos:', err),
    );
  });

  cron.schedule(
    INVESTMENTS_SCHEDULE,
    () => {
      runInvestmentsAccrual().catch((err) =>
        console.error('[scheduler] Erro no pagamento diário dos investimentos:', err),
      );
    },
    { timezone: 'Europe/Lisbon' },
  );

  runInvestmentsAccrual().catch((err) =>
    console.error('[scheduler] Erro no pagamento dos investimentos ao arrancar:', err),
  );

  console.log('[scheduler] Jobs agendados. Documentos: 03:00. Investimentos: 00:15 (Lisboa).');
}
