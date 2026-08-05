// src/shared/lib/invalidate.ts
//
// Invalidação de cache por AÇÃO, não por entidade.
//
// O PROBLEMA QUE ISTO RESOLVE: aprovar um documento invalidava apenas
// `documents`. Mas o servidor faz mais do que mudar o documento — reavalia o
// estado do veículo, pode desbloquear o motorista, e altera a fila do painel.
// Nada disso era invalidado, por isso as outras telas continuavam a mostrar o
// estado antigo até alguém recarregar a página.
//
// A causa de fundo é que quem escreve a mutação pensa na entidade que está a
// alterar, não nas que o servidor altera por arrasto. Reunir aqui as
// consequências de cada ação torna-as visíveis: para saber o que uma aprovação
// afeta, lê-se uma função em vez de se percorrer o backend.
//
// Nota sobre o staleTime: o QueryProvider mantém os dados frescos por um
// minuto, o que é bom para navegação mas significa que nada volta a ser
// pedido sozinho nesse intervalo. Invalidar é o que força a atualização — sem
// isto, o utilizador vê valores antigos e conclui que a aplicação está lenta.

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';

/**
 * Documento aprovado, rejeitado, enviado ou removido.
 *
 * Além do próprio documento: o estado do veículo é reavaliado no servidor, o
 * motorista pode sair de AGUARDANDO_REGULARIZACAO, e a fila do painel muda.
 */
export function invalidateAfterDocument(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.documents.all });
  qc.invalidateQueries({ queryKey: queryKeys.vehicles.all });
  qc.invalidateQueries({ queryKey: queryKeys.users.all });
  qc.invalidateQueries({ queryKey: queryKeys.analytics.all });
}

/**
 * Retirada aprovada, rejeitada ou criada.
 *
 * Move dinheiro: o saldo muda, e o painel do administrador mostra tanto o
 * total por processar como o passivo.
 */
export function invalidateAfterWithdrawal(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.withdrawals.all });
  qc.invalidateQueries({ queryKey: queryKeys.balance.all });
  qc.invalidateQueries({ queryKey: queryKeys.analytics.all });
}

/** Fecho registado ou cancelado — a única origem de dinheiro na conta. */
export function invalidateAfterSettlement(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.settlements.all });
  qc.invalidateQueries({ queryKey: queryKeys.balance.all });
  qc.invalidateQueries({ queryKey: queryKeys.analytics.all });
}

/** Ajuste manual de saldo. */
export function invalidateAfterAdjustment(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.balance.all });
  qc.invalidateQueries({ queryKey: queryKeys.analytics.all });
}

/**
 * Lançamento comunicado, confirmado ou recusado.
 *
 * Não move saldo — o dinheiro entra pelo fecho — mas altera a fila do painel
 * e a conferência cruzada mostrada no formulário do fecho.
 */
export function invalidateAfterEarning(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.earnings.all });
  qc.invalidateQueries({ queryKey: queryKeys.analytics.all });
  qc.invalidateQueries({ queryKey: queryKeys.settlements.all });
}

/** Veículo criado, editado, atribuído ou removido. */
export function invalidateAfterVehicle(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.vehicles.all });
  qc.invalidateQueries({ queryKey: queryKeys.users.all });
  qc.invalidateQueries({ queryKey: queryKeys.analytics.all });
}

/** Estado do motorista alterado: ativo, inativo, bloqueado. */
export function invalidateAfterUser(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.users.all });
  qc.invalidateQueries({ queryKey: queryKeys.analytics.all });
}
