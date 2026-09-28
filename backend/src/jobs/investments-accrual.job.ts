// src/jobs/investments-accrual.job.ts
//
// Pagamento diário dos investimentos. Toda a lógica está no serviço; isto só
// existe para o agendador ter uma função com nome.

import { investmentsService } from '../modules/investments/investments.service';

export async function runInvestmentsAccrual(): Promise<void> {
  await investmentsService.runDailyAccrual();
}
