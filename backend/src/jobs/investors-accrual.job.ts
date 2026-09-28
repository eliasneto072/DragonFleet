// src/jobs/investors-accrual.job.ts
//
// Juro diário das contas de investidor. Toda a lógica está no serviço; isto só
// existe para o agendador ter uma função com nome.

import { investorsService } from '../modules/investors/investors.service';

export async function runInvestorsAccrual(): Promise<void> {
  await investorsService.runDaily();
}
