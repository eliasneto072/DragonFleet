// src/app/components/admin/team-management.tsx
//
// Quem trabalha no escritório, e o que cada um pode fazer.
//
// Não há criação de contas aqui, de propósito. Toda a gente se regista pelo
// caminho público, que fixa DRIVER no servidor — é essa linha que impede
// alguém de se criar administrador enviando {"role":"ADMIN"} no registo.
// Promover é o ato deliberado de um administrador sobre uma conta que já
// existe, e fica com dono e com data.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Search, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/app/components/ui/page-header';
import { Card } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';

import { usersService } from '@/features/admin/services/users.service';
import { useAuth } from '@/features/auth/context/AuthContext';
import type { ApiUser, UserRole } from '@/shared/types/api';

const EQUIPA_KEY = ['users', 'equipa'] as const;

/** O que cada papel pode fazer, em português e não em nomes de rotas. */
const PAPEIS: Record<'ADMIN' | 'MANAGER', { nome: string; resumo: string }> = {
  ADMIN: {
    nome: 'Administração',
    resumo: 'Tudo, incluindo Configurações, Sociedades, o relatório financeiro e esta tela.',
  },
  MANAGER: {
    nome: 'Gestão',
    resumo: 'O dia a dia: documentos, fechos, retiradas, IBANs, viaturas, notificações e suporte.',
  },
};

export function TeamManagement() {
  const { user: atual } = useAuth();
  const queryClient = useQueryClient();

  const [procura, setProcura] = useState('');
  const [porPromover, setPorPromover] = useState<{ alvo: ApiUser; papel: UserRole } | null>(null);

  // Duas consultas em vez de uma filtrada no browser: a lista de motoristas
  // tem milhares de registos e a de escritório tem meia dúzia. Trazer tudo
  // para separar aqui seria descarregar a frota inteira para mostrar cinco
  // linhas.
  const { data: equipa, isLoading } = useQuery({
    queryKey: EQUIPA_KEY,
    queryFn: async () => {
      const [admins, gestores] = await Promise.all([
        usersService.list({ role: 'ADMIN', pageSize: 100 }),
        usersService.list({ role: 'MANAGER', pageSize: 100 }),
      ]);
      return [...admins.users, ...gestores.users];
    },
  });

  const { data: candidatos, isFetching: aProcurar } = useQuery({
    queryKey: ['users', 'equipa', 'candidatos', procura],
    queryFn: () => usersService.list({ role: 'DRIVER', search: procura, pageSize: 10 }),
    enabled: procura.trim().length >= 3,
  });

  const { mutate: mudarPapel, isPending } = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      usersService.update(id, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setPorPromover(null);
      toast.success('Papel atualizado.');
    },
    // A mensagem vem do servidor porque é lá que estão as razões: o último
    // administrador ativo, ou a própria conta. Substituí-la por um genérico
    // esconderia exatamente a informação que a pessoa precisa.
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Não foi possível alterar o papel.';
      toast.error(msg);
    },
  });

  const admins = (equipa ?? []).filter((u) => u.role === 'ADMIN');
  const soUmAdmin = admins.filter((u) => u.status === 'ACTIVE').length <= 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipa"
        subtitle="Quem tem acesso ao painel e o que cada um pode fazer"
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      {soUmAdmin && (
        <Card className="p-4 flex gap-3 items-start border-amber-300 bg-amber-50">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Só existe um administrador ativo.</p>
            <p className="text-muted-foreground">
              Se perder o acesso a esta conta, ninguém consegue mexer nas Configurações
              nem promover outra pessoa — a recuperação passa por editar a base de dados.
              Vale a pena promover uma segunda.
            </p>
          </div>
        </Card>
      )}

      {/* ── Quem já lá está ─────────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="font-semibold mb-1">Com acesso ao painel</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Os motoristas não aparecem aqui — só quem tem funções de escritório.
        </p>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : (equipa ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Ninguém, o que não devia acontecer — está a ver esta tela, portanto
            é administrador. Recarregue a página.
          </p>
        ) : (
          <div className="divide-y">
            {(equipa ?? []).map((u) => {
              const eu = u.id === atual?.id;
              const papel = PAPEIS[u.role as 'ADMIN' | 'MANAGER'];
              return (
                <div key={u.id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{u.name}</span>
                      <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}>
                        {papel?.nome ?? u.role}
                      </Badge>
                      {u.status !== 'ACTIVE' && <Badge variant="outline">Inativo</Badge>}
                      {eu && <span className="text-xs text-muted-foreground">(você)</span>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {/* Nada de botões na própria linha. O servidor recusa na
                        mesma — CANNOT_CHANGE_OWN_ROLE — mas oferecer um botão
                        que só serve para dar erro é pior do que não o mostrar. */}
                    {!eu && u.role === 'MANAGER' && (
                      <Button variant="outline" size="sm" disabled={isPending}
                        onClick={() => mudarPapel({ id: u.id, role: 'ADMIN' })}>
                        Passar a Administração
                      </Button>
                    )}
                    {!eu && u.role === 'ADMIN' && (
                      <Button variant="outline" size="sm" disabled={isPending}
                        onClick={() => mudarPapel({ id: u.id, role: 'MANAGER' })}>
                        Passar a Gestão
                      </Button>
                    )}
                    {!eu && (
                      <Button variant="ghost" size="sm" disabled={isPending}
                        onClick={() => setPorPromover({ alvo: u, papel: 'DRIVER' })}>
                        Retirar acesso
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Dar acesso a alguém ─────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="font-semibold mb-1">Dar acesso ao painel</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Procure a conta pelo nome ou email. Quem ainda não tiver conta cria-a
          primeiro pelo registo normal.
        </p>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Nome ou email — pelo menos 3 letras"
            value={procura}
            onChange={(e) => setProcura(e.target.value)}
          />
        </div>

        {procura.trim().length < 3 ? null : aProcurar ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> A procurar…
          </div>
        ) : (candidatos?.users ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum motorista encontrado com esse nome ou email.
          </p>
        ) : (
          <div className="divide-y">
            {(candidatos?.users ?? []).map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium truncate">{u.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm"
                    onClick={() => setPorPromover({ alvo: u, papel: 'MANAGER' })}>
                    Gestão
                  </Button>
                  <Button variant="outline" size="sm"
                    onClick={() => setPorPromover({ alvo: u, papel: 'ADMIN' })}>
                    Administração
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── O que cada papel faz ────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="font-semibold mb-4">O que cada papel pode fazer</h2>
        <div className="space-y-3 text-sm">
          {(['ADMIN', 'MANAGER'] as const).map((p) => (
            <div key={p}>
              <Badge variant={p === 'ADMIN' ? 'default' : 'secondary'} className="mb-1">
                {PAPEIS[p].nome}
              </Badge>
              <p className="text-muted-foreground">{PAPEIS[p].resumo}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Confirmação ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!porPromover} onOpenChange={(v) => !v && setPorPromover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {porPromover?.papel === 'DRIVER'
                ? 'Retirar o acesso ao painel?'
                : `Dar acesso de ${porPromover ? PAPEIS[porPromover.papel as 'ADMIN' | 'MANAGER']?.nome : ''}?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p><strong>{porPromover?.alvo.name}</strong> — {porPromover?.alvo.email}</p>

                {/* O aviso, e não o bloqueio.
                    Um motorista promovido mantém viatura, saldo, fechos e
                    retiradas na base — nada se perde — mas deixa de ver o
                    portal do motorista, porque o encaminhamento é por papel.
                    Bloquear seria pior: há casos legítimos, como uma conta de
                    motorista antiga de quem passou para o escritório. */}
                {porPromover?.papel !== 'DRIVER' && porPromover?.alvo.role === 'DRIVER' && (
                  <p className="text-muted-foreground">
                    Deixa de ver o portal do motorista. Os dados dele — viatura,
                    saldo, fechos e retiradas — ficam guardados e voltam a
                    aparecer se o papel for revertido.
                  </p>
                )}

                {porPromover?.papel === 'ADMIN' && (
                  <p className="text-muted-foreground">
                    A Administração pode alterar a comissão, gerir as sociedades
                    e dar acesso a outras pessoas.
                  </p>
                )}

                {porPromover?.papel === 'DRIVER' && (
                  <p className="text-muted-foreground">
                    Perde o acesso ao painel e passa a ver o portal do motorista.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={() => porPromover && mudarPapel({
                id: porPromover.alvo.id,
                role: porPromover.papel,
              })}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
