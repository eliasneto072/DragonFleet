// src/jobs/ranks.job.ts
//
// Recálculo diário dos níveis. A lógica está no serviço.

import { ranksService } from '../modules/ranks/ranks.service';

export async function runRanksRecalculation(): Promise<void> {
  await ranksService.runDaily();
}
