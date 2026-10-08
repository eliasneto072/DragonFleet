// src/jobs/scheduler.ts
//
// Agendador central dos jobs do sistema. Usa node-cron.

import cron from 'node-cron';
import { runDocumentsExpiryCheck } from './documents-expiry.job';
import { runInvestmentsAccrual } from './investments-accrual.job';
import { runInvestorsAccrual } from './investors-accrual.job';
import { runRanksRecalculation } from './ranks.job';
import { runScheduledPayments } from './scheduled-payments.job';
import { runReminders } from './reminders.job';
import { runInspectionsCheck } from './inspections.job';

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

// Pagamentos agendados: 01:00 em Lisboa, DEPOIS dos juros e dos níveis.
//
// A ordem importa aqui: um desconto agendado mexe no saldo, e os juros do dia
// são calculados sobre o saldo. Lançar o desconto primeiro faria o motorista
// render juros sobre um valor que ainda não tinha sido descontado — uma
// diferença pequena, mas de uma classe de erro que ninguém descobre.
//
// Falhar uma noite não perde nada: a passagem seguinte vê a data vencida e
// lança o que ficou por lançar. É para isso que a próxima data é GRAVADA e não
// calculada — ver `recorrencia.ts`.
const SCHEDULED_PAYMENTS_SCHEDULE = '0 1 * * *';

// Lembretes: 08:00 em Lisboa. De manhã e não de madrugada, de propósito — uma
// notificação às três da manhã está lida e esquecida quando a pessoa acorda.
const REMINDERS_SCHEDULE = '0 8 * * *';

// Inspeções: 08:10 em Lisboa, logo a seguir aos lembretes.
//
// De manhã e junto dos lembretes de propósito: são a mesma espécie de coisa —
// o que falta fazer — e chegam no mesmo momento do dia em que alguém está a
// organizar o trabalho, em vez de pingarem a horas aleatórias.
const INSPECTIONS_SCHEDULE = '10 8 * * *';

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

  cron.schedule(
    SCHEDULED_PAYMENTS_SCHEDULE,
    () => {
      runScheduledPayments().catch((err) =>
        console.error('[scheduler] Erro nos pagamentos agendados:', err),
      );
    },
    { timezone: 'Europe/Lisbon' },
  );

  cron.schedule(
    REMINDERS_SCHEDULE,
    () => {
      runReminders().catch((err) =>
        console.error('[scheduler] Erro nos lembretes:', err),
      );
    },
    { timezone: 'Europe/Lisbon' },
  );

  cron.schedule(
    INSPECTIONS_SCHEDULE,
    () => {
      runInspectionsCheck().catch((err) =>
        console.error('[scheduler] Erro no aviso de inspeções:', err),
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

  // E os agendamentos, pela mesma razão: um deploy à uma da manhã saltava o
  // dia inteiro. Correr agora é seguro — o job só lança o que estiver vencido,
  // e o que já foi lançado tem a data avançada.
  runScheduledPayments().catch((err) =>
    console.error('[scheduler] Erro nos pagamentos agendados ao arrancar:', err),
  );

  console.log(
    '[scheduler] Jobs agendados. Documentos: 03:00. Investimentos: 00:15. '
    + 'Investidores: 00:20. Níveis: 00:45. Pagamentos agendados: 01:00. '
    + 'Lembretes: 08:00. Inspeções: 08:10 (Lisboa).',
  );
}
