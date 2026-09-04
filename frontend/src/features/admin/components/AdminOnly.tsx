// src/features/admin/components/AdminOnly.tsx
//
// Guarda de rota para as telas que só a Administração pode abrir.
//
// Esconder a entrada no menu não chega: o endereço continua a funcionar se
// alguém o escrever ou tiver guardado nos favoritos. Um MANAGER que abrisse
// /app/admin/settings via um formulário preenchido com os valores atuais e
// levava 403 só ao Guardar — depois de já ter escrito.
//
// Isto não é segurança. A segurança está no servidor, que recusa na mesma. É
// para a interface não prometer o que não pode cumprir.

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';

export function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Para o painel e não para o login: quem está aqui tem sessão válida, só não
  // tem este papel. Mandá-lo para o login sugeriria que o problema era a
  // sessão, e ele voltaria a entrar para dar no mesmo sítio.
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/app/admin/dashboard" replace />;
  }

  return <>{children}</>;
}
