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

      // Dados ficam "frescos" por 30 segundos — dentro desse tempo,
      // navegar entre páginas não dispara novo fetch.
      //
      // Era um minuto. Baixou porque este produto tem o mesmo número em várias
      // telas — o saldo aparece no painel do motorista, na ficha dele e no
      // cartão de retiradas — e um minuto de divergência entre elas lê-se como
      // avaria. Trinta segundos mantém a navegação instantânea e reduz para
      // metade a janela em que algo pode aparecer desatualizado.
      staleTime: 1000 * 30,

      // Cache mantido por 5 minutos após o componente desmontar
      gcTime: 1000 * 60 * 5,

      // Não refaz fetch ao focar a aba (evita requests desnecessários)
      refetchOnWindowFocus: false,

      // Ao montar, refaz apenas o que está marcado como obsoleto.
      //
      // É o que faz uma invalidação chegar a uma tela que não estava visível:
      // aprovar um documento no painel de administração marca `users` como
      // obsoleto, e a lista de motoristas volta a pedir os dados quando for
      // aberta. Com `false`, a marca ficava por cumprir e só um recarregamento
      // da página resolvia.
      //
      // Não é `'always'`: isso pediria dados a cada montagem, inclusive ao
      // alternar entre separadores com dados frescos, e devolveria o excesso
      // de pedidos que o staleTime existe para evitar.
      refetchOnMount: true,
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
