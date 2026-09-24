// src/features/admin/components/AdminOnly.tsx
//
// Guardas de rota do painel.
//
// Esconder a entrada no menu não chega: o endereço continua a funcionar se
// alguém o escrever ou o tiver nos favoritos. Sem isto, quem abrisse
// /app/admin/settings via um formulário preenchido com os valores atuais e só
// levava 403 ao Guardar — depois de já ter escrito tudo.
//
// ISTO NÃO É SEGURANÇA. A segurança está no servidor, que recusa na mesma
// (ver `area.middleware.ts`). Isto é para a interface não prometer o que não
// pode cumprir.

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { primeiraTelaPermitida } from './AdminLayout';
import type { Access, Area } from '@/shared/lib/areas';

/**
 * Exige acesso a uma área.
 *
 * Quem não tem vai para a primeira tela que PODE abrir — e não para o
 * Dashboard. Mandá-lo para o Dashboard funcionava enquanto toda a gente o
 * podia abrir; agora que o acesso é por área, seria um salto para outra tela
 * fechada, e daí para outra, até o browser desistir.
 *
 * Sem nenhuma tela disponível, a pessoa tem uma conta de equipa sem acessos
 * nenhuns. É um estado possível — alguém que ainda não foi configurado — e o
 * que ela precisa é de uma frase, não de mais um salto.
 */
export function RequireArea({ area, nivel = 'VIEW', children }: {
  area: Area;
  nivel?: Access;
  children: ReactNode;
}) {
  const { user, can } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (can(area, nivel)) return <>{children}</>;

  const destino = primeiraTelaPermitida((a) => can(a));
  if (destino) return <Navigate to={destino} replace />;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-lg font-medium">Ainda não tem acessos atribuídos</p>
      <p className="max-w-md text-sm text-muted-foreground">
        A sua conta existe mas ainda não tem nenhuma área do painel atribuída.
        Peça à administração para lhe dar acesso ao que precisa.
      </p>
    </div>
  );
}

/**
 * Só a Administração.
 *
 * Mantido para as telas onde o critério é mesmo ser dono do sistema, e não uma
 * área configurável — a Equipa, por exemplo, onde se distribuem as
 * permissões. Dar essa tela a alguém por permissão seria dar-lhe a chave para
 * se dar todas as outras.
 */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { user, can } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'ADMIN') return <>{children}</>;

  const destino = primeiraTelaPermitida((a) => can(a));
  return <Navigate to={destino ?? '/app/driver'} replace />;
}
