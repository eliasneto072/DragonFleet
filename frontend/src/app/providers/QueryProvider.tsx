// src/app/providers/QueryProvider.tsx

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '@/shared/lib/api-client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Tenta de novo 1x em caso de falha, mas nunca em erros 4xx
      // (ex: 401, 403, 404 — não adianta tentar de novo)
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 1;
      },

      // Dados ficam "frescos" por 1 minuto — dentro desse tempo,
      // navegar entre páginas não dispara novo fetch
      staleTime: 1000 * 60,

      // Cache mantido por 5 minutos após o componente desmontar
      gcTime: 1000 * 60 * 5,

      // Não refaz fetch ao focar a aba (evita requests desnecessários)
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Não tenta de novo em mutations (POST/PATCH/DELETE) — evita
      // criar duplicatas caso o servidor tenha processado mas a resposta perdeu
      retry: false,
    },
  },
});

export { queryClient };

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}