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
import type { UserRole } from '@/shared/types/api';

function Guarda({ papeis, children }: { papeis: UserRole[]; children: ReactNode }) {
  const { user } = useAuth();

  // Para o painel e não para o login: quem está aqui tem sessão válida, só não
  // tem este papel. Mandá-lo para o login sugeriria que o problema era a
  // sessão, e ele voltaria a entrar para dar no mesmo sítio.
  //
  // O SUPPORT é a exceção: o Dashboard não está entre as telas dele, portanto
  // mandá-lo para lá seria um salto para outra tela que também não pode abrir.
  if (!user || !papeis.includes(user.role)) {
    const destino = user?.role === 'SUPPORT' ? '/app/admin/support' : '/app/admin/dashboard';
    return <Navigate to={destino} replace />;
  }

  return <>{children}</>;
}

/** Só a Administração: Configurações, Sociedades, Equipa. */
export function AdminOnly({ children }: { children: ReactNode }) {
  return <Guarda papeis={['ADMIN']}>{children}</Guarda>;
}

/**
 * Fora do alcance do suporte: tudo o que ele não lê.
 *
 * Envolve as telas que o menu já lhe esconde. Esconder a entrada não chega —
 * o endereço continua a funcionar se alguém o escrever ou o tiver nos
 * favoritos, e ele veria a tela a carregar até o backend devolver 403.
 */
export function NaoSuporte({ children }: { children: ReactNode }) {
  return <Guarda papeis={['ADMIN', 'MANAGER']}>{children}</Guarda>;
}
