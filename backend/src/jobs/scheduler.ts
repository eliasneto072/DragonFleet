// src/jobs/scheduler.ts
//
// Agendador central dos jobs do sistema. Usa node-cron.

import cron from 'node-cron';
import { runDocumentsExpiryCheck } from './documents-expiry.job';
import { runInvestmentsAccrual } from './investments-accrual.job';
import { runInvestorsAccrual } from './investors-accrual.job';
import { runRanksRecalculation } from './ranks.job';

// Corre todos os dias às 03:00 (hora do servidor). Horário de baixa utilização.
const DOCUMENTS_EXPIRY_SCHEDULE = '0 3 * * *';

// Investimentos: 00:15 em LISBOA, com o fuso explícito. O servidor do Render
// corre em UTC, e sem o fuso o "dia de ontem" fechava à uma da manhã no verão.
// Não faz mal se falhar uma noite: a próxima execução (ou um resgate) paga os
// dias em falta. Também corre ao arrancar, pelo mesmo motivo — um deploy à
// meia-noite não deixa ninguém sem o dia.
const INVESTMENTS_SCHEDULE = '15 0 * * *';

// Investidores: 00:20 em Lisboa, logo a seguir aos investimentos. A ordem
// entre os dois não importa — são dinheiros separados, sem nenhum cálculo em
// comum — mas espaçá-los cinco minutos evita duas séries de transações a
// competir pela mesma base de dados no mesmo segundo.
const INVESTORS_SCHEDULE = '20 0 * * *';

// Níveis: 00:45 em Lisboa, depois dos investimentos — o valor aplicado é uma
// das metas, e recalcular antes de os ganhos do dia entrarem daria um nível
// baseado em números de ontem. O mesmo cálculo corre quando o motorista abre a
// tela, por isso uma noite falhada não deixa ninguém com o nível errado.
const RANKS_SCHEDULE = '45 0 * * *';

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

  cron.schedule(
    INVESTORS_SCHEDULE,
    () => {
      runInvestorsAccrual().catch((err) =>
        console.error('[scheduler] Erro no juro diário das contas de investidor:', err),
      );
    },
    { timezone: 'Europe/Lisbon' },
  );

  cron.schedule(
    RANKS_SCHEDULE,
    () => {
      runRanksRecalculation().catch((err) =>
        console.error('[scheduler] Erro no recálculo dos níveis:', err),
      );
    },
    { timezone: 'Europe/Lisbon' },
  );

  // Ao arrancar, os dois pagamentos diários. Um deploy à meia-noite não pode
  // deixar ninguém sem o dia.
  runInvestmentsAccrual().catch((err) =>
    console.error('[scheduler] Erro no pagamento dos investimentos ao arrancar:', err),
  );

  runInvestorsAccrual().catch((err) =>
    console.error('[scheduler] Erro no juro dos investidores ao arrancar:', err),
  );

  console.log(
    '[scheduler] Jobs agendados. Documentos: 03:00. Investimentos: 00:15. '
    + 'Investidores: 00:20. Níveis: 00:45 (Lisboa).',
  );
}
