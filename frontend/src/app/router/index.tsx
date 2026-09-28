// src/app/router/index.tsx

import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from '@/app/providers/RootLayout';
import { LandingPage } from '@/features/landing/pages/LandingPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';

import { DriverLayout } from '@/features/driver/components/DriverLayout';
import { AdminLayout } from '@/features/admin/components/AdminLayout';

import DriverDashboardPage from '@/features/driver/pages/DriverDashboardPage';
import WithdrawalsPage from '@/features/driver/pages/WithdrawalsPage';
import DocumentsPage from '@/features/driver/pages/DocumentsPage';
import VehiclesPage from '@/features/driver/pages/VehiclesPage';
import ProfilePage from '@/features/driver/pages/ProfilePage';
import NotificationsPage from '@/features/driver/pages/NotificationsPage';
import SupportPage from '@/features/driver/pages/SupportPage';
import InvestmentsPage from '@/features/driver/pages/InvestmentsPage';

import { AdminDashboardPage } from '@/features/admin/pages/AdminDashboardPage';
import { DriversPage } from '@/features/admin/pages/DriversPage';
import { DriverDetailPage } from '@/features/admin/pages/DriverDetailPage'; // ← novo
import { SettlementsPage } from '@/features/admin/pages/SettlementsPage';
import { FinancialPage } from '@/features/admin/pages/FinancialPage';
import { GreenReceiptsPage } from '@/features/admin/pages/GreenReceiptsPage';
import { FleetPage } from '@/features/admin/pages/FleetPage';
import { VehicleDetailPage } from '@/features/admin/pages/VehicleDetailPage';
import { AssignmentLookupPage } from '@/features/admin/pages/AssignmentLookupPage';
import { AnalyticsPage } from '@/features/admin/pages/AnalyticsPage';
import { NotificationsAdminPage } from '@/features/admin/pages/NotificationsAdminPage';
import { SettingsPage } from '@/features/admin/pages/SettingsPage';
import { DocumentsAdminPage } from '@/features/admin/pages/DocumentsAdminPage';
import { SupportAdminPage } from '@/features/admin/pages/SupportAdminPage';
import { TeamPage } from '@/features/admin/pages/TeamPage';
import { InvestmentsAdminPage } from '@/features/admin/pages/InvestmentsAdminPage';
import { RanksPage } from '@/features/admin/pages/RanksPage';
import { InvestorsPage } from '@/features/admin/pages/InvestorsPage';
import { ProjectsPage } from '@/features/admin/pages/ProjectsPage';
import { AdminOnly, RequireArea } from '@/features/admin/components/AdminOnly';

export const router = createBrowserRouter([

  // ── Rotas públicas ───────────────────────────────────────────────────────
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },

  // ── Rotas protegidas ─────────────────────────────────────────────────────
  {
    path: '/app',
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/app/driver" replace /> },

      {
        path: 'driver',
        element: <DriverLayout />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <DriverDashboardPage /> },
          { path: 'withdrawals', element: <WithdrawalsPage /> },
          { path: 'investments', element: <InvestmentsPage /> },
          { path: 'documents', element: <DocumentsPage /> },
          { path: 'vehicles', element: <VehiclesPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'support', element: <SupportPage /> },
        ],
      },

      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },

          // Cada tela declara a ÁREA a que pertence. Quem não a tiver é
          // mandado para a primeira que puder abrir — a guarda a sério está
          // no servidor, isto é para a interface não prometer o que não pode
          // cumprir.
          { path: 'dashboard',      element: <RequireArea area="DASHBOARD"><AdminDashboardPage /></RequireArea> },
          { path: 'drivers',        element: <RequireArea area="DRIVERS"><DriversPage /></RequireArea> },
          { path: 'drivers/:id',    element: <RequireArea area="DRIVERS"><DriverDetailPage /></RequireArea> },
          { path: 'documents',      element: <RequireArea area="DOCUMENTS"><DocumentsAdminPage /></RequireArea> },
          { path: 'fleet',          element: <RequireArea area="FLEET"><FleetPage /></RequireArea> },
          // Antes de 'fleet/:id' por legibilidade — o React Router já dá
          // prioridade ao segmento estático, mas quem lê o ficheiro não tem
          // de saber isso para perceber que 'lookup' não é um id.
          { path: 'fleet/lookup',   element: <RequireArea area="FLEET"><AssignmentLookupPage /></RequireArea> },
          { path: 'fleet/:id',      element: <RequireArea area="FLEET"><VehicleDetailPage /></RequireArea> },
          { path: 'ranks',          element: <RequireArea area="RANKS"><RanksPage /></RequireArea> },

          { path: 'settlements',    element: <RequireArea area="SETTLEMENTS"><SettlementsPage /></RequireArea> },
          { path: 'financial',      element: <RequireArea area="FINANCIAL"><FinancialPage /></RequireArea> },
          { path: 'green-receipts', element: <RequireArea area="GREEN_RECEIPTS"><GreenReceiptsPage /></RequireArea> },
          { path: 'analytics',      element: <RequireArea area="ANALYTICS"><AnalyticsPage /></RequireArea> },

          { path: 'investments',    element: <RequireArea area="INVESTMENTS"><InvestmentsAdminPage /></RequireArea> },
          { path: 'investors',      element: <RequireArea area="INVESTORS"><InvestorsPage /></RequireArea> },
          { path: 'projects',       element: <RequireArea area="PROJECTS"><ProjectsPage /></RequireArea> },

          { path: 'notifications',  element: <RequireArea area="NOTIFICATIONS"><NotificationsAdminPage /></RequireArea> },
          { path: 'support',        element: <RequireArea area="SUPPORT"><SupportAdminPage /></RequireArea> },
          { path: 'settings',       element: <RequireArea area="SETTINGS"><SettingsPage /></RequireArea> },

          // A Equipa fica em AdminOnly e não numa área: é onde se distribuem
          // as permissões, e dá-la por permissão seria dar a chave para
          // alguém se dar todas as outras.
          { path: 'team',           element: <AdminOnly><TeamPage /></AdminOnly> },
        ],
      },
    ],
  },
]);