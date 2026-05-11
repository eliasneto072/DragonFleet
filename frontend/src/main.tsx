// src/main.tsx

import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import { AuthProvider } from '@/features/auth/context/AuthContext';
import { QueryProvider } from '@/app/providers/QueryProvider';
import '@/styles/index.css';

const container = document.getElementById('root')!;

// Reutiliza o root se já existir (evita o warning no hot reload do Vite)
const root = (window as any).__root ?? createRoot(container);
(window as any).__root = root;

root.render(
  <QueryProvider>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </QueryProvider>
);