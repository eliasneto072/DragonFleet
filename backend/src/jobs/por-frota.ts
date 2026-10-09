// src/jobs/por-frota.ts
//
// Corre um trabalho automático uma vez por frota.
//
// ─── PORQUE É QUE OS TRABALHOS PRECISAM DISTO ───────────────────────────────
//
// Um trabalho agendado não nasce de um pedido: não há sessão, não há
// utilizador, e por isso não há frota — e sem frota as consultas rebentam, que
// é exactamente o que `escopo.ts` promete fazer.
//
// Havia duas saídas. Uma era deixar os trabalhos verem tudo, com `comoSistema`,
// e escrever o filtro à mão dentro de cada um. A outra, esta: correr o trabalho
// TANTAS VEZES quantas as frotas, cada uma dentro da sua. É mais lenta e é
// melhor, por três razões:
//
//   1. Os trabalhos não mudam. `runInspectionsCheck()` continua a ser o mesmo
//      código que já estava escrito e testado, sem saber que há frotas.
//   2. Uma frota que rebente não leva as outras atrás — a seguinte corre na
//      mesma.
//   3. Não há nenhum sítio onde um trabalho veja dados de duas frotas ao mesmo
//      tempo, por isso não há nenhum sítio onde os possa misturar.
//
// ─── E AS FROTAS DESLIGADAS ─────────────────────────────────────────────────
//
// Ficam de fora. Uma frota desligada não recebe avisos de inspeção nem lança
// pagamentos agendados: está parada, e os trabalhos param com ela.

import { prisma } from '../config/prisma';
import { comFrota, comoSistema } from '../config/escopo';
import { logger } from '../shared/utils/logger';

/**
 * Corre `tarefa` dentro de cada frota activa.
 *
 * Devolve quantas correram bem e quantas falharam, para o registo poder dizer
 * "sete frotas, uma falhou" em vez de só "falhou".
 */
export async function porCadaFrota(
  nome: string,
  // `unknown` e não `void`: alguns trabalhos devolvem contagens, e exigir que
  // não devolvam nada obrigava a embrulhar metade deles por nada.
  tarefa: () => Promise<unknown>,
): Promise<{ ok: number; falhas: number }> {
  const frotas = await comoSistema(() => prisma.fleet.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  }));

  let ok = 0;
  let falhas = 0;

  for (const f of frotas) {
    try {
      // O `await` tem de estar DENTRO do comFrota: sair dele antes de a
      // promessa resolver deixava o resto da tarefa fora do âmbito.
      await comFrota(f.id, () => tarefa());
      ok += 1;
    } catch (erro) {
      falhas += 1;
      logger.error(`[${nome}] falhou na frota ${f.name} (${f.id})`, erro);
    }
  }

  if (falhas > 0) {
    logger.warn(`[${nome}] ${ok} frota(s) ok, ${falhas} com erro`);
  }
  return { ok, falhas };
}
