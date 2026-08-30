import { app } from './app';
import { assertEnv, env } from './config/env';
import { startScheduler } from './jobs/scheduler';

// Verifica a configuração ANTES de abrir a porta.
//
// Um servidor que arranca mal configurado responde a pedidos e parece estar
// bem — e é assim que um sistema inseguro fica meses no ar sem ninguém dar por
// isso. Rebentar aqui é ruidoso e imediato.
assertEnv();

const PORT = env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Inicia os jobs agendados (ex.: validade de documentos — regra dos 90 dias).
  startScheduler();
});
