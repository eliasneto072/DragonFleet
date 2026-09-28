// src/main.tsx
//
// O arranque. Decide, pelo endereço, qual dos dois sites vai ser mostrado:
// a frota (dragonfleet.pt) ou o portal do investidor (invest.dragonfleet.pt).
// Ver `shared/config/portal.ts` para o porquê de serem o mesmo programa.

import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { investRouter } from '@/app/router/invest';
import { PORTAL, aplicarPortal } from '@/shared/config/portal';
import { AuthProvider } from '@/features/auth/context/AuthContext';
import { QueryProvider } from '@/app/providers/QueryProvider';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { Toaster } from '@/app/components/ui/sonner';
import '@/styles/index.css';

// Antes do primeiro render: põe a classe do portal no <html> para o ecrã não
// aparecer com as cores da frota durante uma fração de segundo.
aplicarPortal();

const container = document.getElementById('root')!;

// Reutiliza o root se já existir (evita o warning no hot reload do Vite)
const root = (window as any).__root ?? createRoot(container);
(window as any).__root = root;

const ehInvestidor = PORTAL === 'invest';

root.render(
  <ThemeProvider>
    <QueryProvider>
      <AuthProvider>
        <RouterProvider router={ehInvestidor ? investRouter : router} />
        {/* O portal do investidor não tem Toaster próprio no layout — as
            mensagens de sucesso e erro dos pedidos de resgate saem por aqui. */}
        {ehInvestidor && <Toaster />}
      </AuthProvider>
    </QueryProvider>
  </ThemeProvider>
);
