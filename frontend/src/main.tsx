import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/context/AuthContext';
import { router } from '@/app/router';
import '@/styles/index.css';

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <RouterProvider router={router} />
  </AuthProvider>
);

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />
);