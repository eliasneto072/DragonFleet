import { app } from './app';
import { env } from './config/env';
import { startScheduler } from './jobs/scheduler';

const PORT = env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Inicia os jobs agendados (ex.: validade de documentos — regra dos 90 dias).
  startScheduler();
});
