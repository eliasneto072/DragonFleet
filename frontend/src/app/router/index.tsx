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

import { AdminDashboardPage } from '@/features/admin/pages/AdminDashboardPage';
import { DriversPage } from '@/features/admin/pages/DriversPage';
import { DriverDetailPage } from '@/features/admin/pages/DriverDetailPage'; // ← novo
import { SettlementsPage } from '@/features/admin/pages/SettlementsPage';
import { FinancialPage } from '@/features/admin/pages/FinancialPage';
import { GreenReceiptsPage } from '@/features/admin/pages/GreenReceiptsPage';
import { FleetPage } from '@/features/admin/pages/FleetPage';
import { VehicleDetailPage } from '@/features/admin/pages/VehicleDetailPage';
import { AnalyticsPage } from '@/features/admin/pages/AnalyticsPage';
import { NotificationsAdminPage } from '@/features/admin/pages/NotificationsAdminPage';
import { SettingsPage } from '@/features/admin/pages/SettingsPage';
import { DocumentsAdminPage } from '@/features/admin/pages/DocumentsAdminPage';
import { SupportAdminPage } from '@/features/admin/pages/SupportAdminPage';
import { TeamPage } from '@/features/admin/pages/TeamPage';
import { AdminOnly, NaoSuporte } from '@/features/admin/components/AdminOnly';

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
          // Fora do alcance do suporte. As telas que ele lê — drivers,
          // documents, financial e support — ficam sem guarda, e o backend
          // decide o resto: ele vê os dados e leva 403 em qualquer ação.
          { path: 'dashboard', element: <NaoSuporte><AdminDashboardPage /></NaoSuporte> },
          { path: 'drivers', element: <DriversPage /> },
          { path: 'drivers/:id', element: <DriverDetailPage /> }, // ← novo
          { path: 'documents', element: <DocumentsAdminPage /> },
          { path: 'settlements', element: <NaoSuporte><SettlementsPage /></NaoSuporte> },
          { path: 'financial', element: <FinancialPage /> },
          { path: 'green-receipts', element: <AdminOnly><GreenReceiptsPage /></AdminOnly> },
          { path: 'fleet', element: <NaoSuporte><FleetPage /></NaoSuporte> },
          { path: 'fleet/:id', element: <NaoSuporte><VehicleDetailPage /></NaoSuporte> },
          { path: 'analytics', element: <NaoSuporte><AnalyticsPage /></NaoSuporte> },
          { path: 'notifications', element: <NaoSuporte><NotificationsAdminPage /></NaoSuporte> },
          { path: 'support', element: <SupportAdminPage /> },
          { path: 'settings', element: <AdminOnly><SettingsPage /></AdminOnly> },
          { path: 'team', element: <AdminOnly><TeamPage /></AdminOnly> },
        ],
      },
    ],
  },
]);