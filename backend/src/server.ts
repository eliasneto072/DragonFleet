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

// O '0.0.0.0' e explicito de proposito. E o que o Node ja faz por omissao,
// mas num contentor a diferenca entre ouvir em todas as interfaces e ouvir so
// em 127.0.0.1 e a diferenca entre o servico responder e nao responder — e o
// erro nao aparece nos logs, aparece como um health check que nunca passa.
// Escrever o valor poupa a alguem a hora de o descobrir.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // Inicia os jobs agendados (ex.: validade de documentos — regra dos 90 dias).
  startScheduler();
});
