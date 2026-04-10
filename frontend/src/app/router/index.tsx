import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from '@/app/providers/RootLayout';

import { DriverLayout } from '@/features/driver/components/DriverLayout';
import { AdminLayout } from '@/features/admin/components/AdminLayout';

import DriverDashboardPage from '@/features/driver/pages/DriverDashboardPage';
import WithdrawalsPage from '@/features/driver/pages/WithdrawalsPage';
import DocumentsPage from '@/features/driver/pages/DocumentsPage';
import ProfilePage from '@/features/driver/pages/ProfilePage';
import NotificationsPage from '@/features/driver/pages/NotificationsPage';
import SupportPage from '@/features/driver/pages/SupportPage';

import { AdminDashboardPage } from '@/features/admin/pages/AdminDashboardPage';
import { DriversPage } from '@/features/admin/pages/DriversPage';
import { FinancialPage } from '@/features/admin/pages/FinancialPage';
import { FleetPage } from '@/features/admin/pages/FleetPage';
import { AnalyticsPage } from '@/features/admin/pages/AnalyticsPage';
import { SettingsPage } from '@/features/admin/pages/SettingsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/driver" replace /> },

      {
        path: 'driver',
        element: <DriverLayout />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard',     element: <DriverDashboardPage /> },
          { path: 'withdrawals',   element: <WithdrawalsPage /> },
          { path: 'documents',     element: <DocumentsPage /> },
          { path: 'profile',       element: <ProfilePage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'support',       element: <SupportPage /> },
        ],
      },

      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <AdminDashboardPage /> },
          { path: 'drivers',   element: <DriversPage /> },
          { path: 'financial', element: <FinancialPage /> },
          { path: 'fleet',     element: <FleetPage /> },
          { path: 'analytics', element: <AnalyticsPage /> },
          { path: 'settings',  element: <SettingsPage /> },
        ],
      },
    ],
  },
]);