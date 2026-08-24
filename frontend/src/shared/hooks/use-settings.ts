// src/shared/hooks/use-settings.ts
//
// Limites e percentagens vindos do servidor.
//
// POR QUE ISTO EXISTE: o frontend tinha estes valores cravados em
// shared/constants — 20% de comissão, 10.000 de máximo, 3 dias de prazo —
// enquanto SystemSettings dizia 15%, 5.000 e 1 dia. As telas anunciavam ao
// motorista regras que o servidor não cumpria: ele lia "até 10.000 €" e o
// pedido era recusado aos 5.000.
//
// Duas cópias da mesma regra divergem sempre; a que vale é a do servidor,
// porque é a que decide. Aqui só se lê.

import { useQuery } from '@tanstack/react-query';
import { settingsService, type SystemSettings } from '@/features/admin/services/settings.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { FINANCIAL_FALLBACK } from '@/shared/constants';

export interface FinancialLimits {
  /** Fração: 0.15 = 15%. SystemSettings guarda em pontos, aqui já vem dividido. */
  commission: number;
  /**
   * Pontos percentuais (6 = 6%), NÃO dividido — ao contrário da comissão.
   *
   * A diferença é deliberada e vem de como cada um é usado: a comissão entra em
   * multiplicações, o imposto aparece em rótulos ("Imposto (6%)"). Dividir aqui
   * obrigaria cada tela a voltar a multiplicar por 100 para o mostrar.
   */
  taxRate: number;
  minWithdrawal: number;
  maxWithdrawal: number;
  processingDays: number;
  /** Falso enquanto as configurações não chegam — útil para desativar botões. */
  loaded: boolean;
}

/**
 * GET /settings é aberto a qualquer utilizador autenticado, de propósito: o
 * motorista precisa dos limites de retirada para os ver no formulário.
 *
 * As configurações mudam raramente, por isso ficam frescas cinco minutos —
 * pedir isto a cada montagem seria desperdício.
 */
export function useSettings() {
  const query = useQuery({
    queryKey: queryKeys.settings.detail,
    queryFn: () => settingsService.get(),
    staleTime: 5 * 60 * 1000,
  });

  const s: SystemSettings | undefined = query.data?.settings;

  const limits: FinancialLimits = {
    commission: s ? Number(s.companyCommission) / 100 : FINANCIAL_FALLBACK.companyCommission,
    // Sem configurações carregadas, zero: mostrar uma taxa inventada seria pior
    // do que não mostrar nenhuma, porque o número apareceria num rótulo.
    taxRate: s ? Number(s.settlementTaxRate) : 0,
    minWithdrawal: s ? Number(s.minWithdrawalAmount) : FINANCIAL_FALLBACK.minWithdrawal,
    maxWithdrawal: s ? Number(s.maxWithdrawalAmount) : FINANCIAL_FALLBACK.maxWithdrawal,
    processingDays: s ? Number(s.withdrawalProcessingDays) : FINANCIAL_FALLBACK.processingDays,
    loaded: !!s,
  };

  return { ...limits, settings: s, isLoading: query.isLoading };
}
