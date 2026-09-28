// src/app/router/invest.tsx
//
// As rotas do portal do investidor.
//
// Router à parte e não um ramo do da frota: assim os endereços aqui são curtos
// e próprios — invest.dragonfleet.pt/extrato, e não /app/investor/extrato — e
// nenhuma página da frota é sequer carregada neste site. Quem abrir
// invest.dragonfleet.pt/app/admin/drivers não encontra a rota, porque ela não
// existe neste router.

import { createBrowserRouter, Navigate } from 'react-router-dom';
import { InvestLayout } from '@/features/invest/components/InvestLayout';
import { InvestLoginPage } from '@/features/invest/pages/InvestLoginPage';
import { InvestDashboardPage } from '@/features/invest/pages/InvestDashboardPage';
import { InvestStatementPage } from '@/features/invest/pages/InvestStatementPage';
import { InvestWithdrawalsPage } from '@/features/invest/pages/InvestWithdrawalsPage';
import { InvestAccountPage } from '@/features/invest/pages/InvestAccountPage';
import { InvestProjectsPage } from '@/features/invest/pages/InvestProjectsPage';
import { InvestProjectDetailPage } from '@/features/invest/pages/InvestProjectDetailPage';

export const investRouter = createBrowserRouter([
  { path: '/entrar', element: <InvestLoginPage /> },
  // O antigo nome do login, para quem chegar com um endereço guardado.
  { path: '/login', element: <Navigate to="/entrar" replace /> },

  {
    path: '/',
    element: <InvestLayout />,
    children: [
      { index: true, element: <Navigate to="/painel" replace /> },
      { path: 'painel', element: <InvestDashboardPage /> },
      { path: 'projetos', element: <InvestProjectsPage /> },
      { path: 'projetos/:id', element: <InvestProjectDetailPage /> },
      { path: 'extrato', element: <InvestStatementPage /> },
      { path: 'resgates', element: <InvestWithdrawalsPage /> },
      { path: 'conta', element: <InvestAccountPage /> },
    ],
  },

  // Qualquer outro endereço vai para o painel. Uma página de erro neste portal
  // seria um ecrã a mais para manter, e não há aqui nada que justifique um
  // endereço partilhado que possa estar errado.
  { path: '*', element: <Navigate to="/painel" replace /> },
]);
