// src/app/router/index.tsx

import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from '@/app/providers/RootLayout';
import { LandingPage } from '@/features/landing/pages/LandingPage';
import { LoginPage }    from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';

import { DriverLayout } from '@/features/driver/components/DriverLayout';
import { AdminLayout }  from '@/features/admin/components/AdminLayout';

import DriverDashboardPage from '@/features/driver/pages/DriverDashboardPage';
import WithdrawalsPage     from '@/features/driver/pages/WithdrawalsPage';
import DocumentsPage       from '@/features/driver/pages/DocumentsPage';
import VehiclesPage        from '@/features/driver/pages/VehiclesPage';
import ProfilePage         from '@/features/driver/pages/ProfilePage';
import NotificationsPage   from '@/features/driver/pages/NotificationsPage';
import SupportPage         from '@/features/driver/pages/SupportPage';

import { AdminDashboardPage } from '@/features/admin/pages/AdminDashboardPage';
import { DriversPage }        from '@/features/admin/pages/DriversPage';
import { FinancialPage }      from '@/features/admin/pages/FinancialPage';
import { FleetPage }          from '@/features/admin/pages/FleetPage';
import { AnalyticsPage }      from '@/features/admin/pages/AnalyticsPage';
import { SettingsPage }       from '@/features/admin/pages/SettingsPage';
import { DocumentsAdminPage } from '@/features/admin/pages/DocumentsAdminPage';
import { SupportAdminPage }   from '@/features/admin/pages/SupportAdminPage';

export const router = createBrowserRouter([

  // ── Rotas públicas ───────────────────────────────────────────────────────
  { path: '/',         element: <LandingPage /> },
  { path: '/login',    element: <LoginPage /> },
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
          { index: true,           element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard',     element: <DriverDashboardPage /> },
          { path: 'withdrawals',   element: <WithdrawalsPage /> },
          { path: 'documents',     element: <DocumentsPage /> },
          { path: 'vehicles',      element: <VehiclesPage /> },
          { path: 'profile',       element: <ProfilePage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'support',       element: <SupportPage /> },
        ],
      },

      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { index: true,         element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard',   element: <AdminDashboardPage /> },
          { path: 'drivers',     element: <DriversPage /> },
          { path: 'documents',   element: <DocumentsAdminPage /> },
          { path: 'financial',   element: <FinancialPage /> },
          { path: 'fleet',       element: <FleetPage /> },
          { path: 'analytics',   element: <AnalyticsPage /> },
          { path: 'support',     element: <SupportAdminPage /> },
          { path: 'settings',    element: <SettingsPage /> },
        ],
      },
    ],
  },
]);