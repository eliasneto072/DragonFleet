// src/app/components/admin/permissions-editor.tsx
//
// O que cada pessoa da equipa pode ver e fazer, área a área.
//
// ─── TRÊS NÍVEIS E NÃO UM INTERRUPTOR ───────────────────────────────────────
//
// Nenhum, Ver, Gerir. Um interruptor de ligado/desligado obrigava a escolher
// entre dar acesso a mais do que se quer ou a menos do que é preciso — e o
// caso mais comum de todos é precisamente o do meio: alguém que precisa de
// CONSULTAR os fechos para responder a uma pergunta mas não os deve registar.
//
// ─── OS PERFIS SÃO UM PONTO DE PARTIDA, NÃO UM PAPEL ────────────────────────
//
// Carregar num perfil preenche as dezasseis áreas de uma vez. A partir daí
// muda-se o que for preciso — e é essa a diferença entre isto e o sistema de
// papéis que estava aqui antes, onde escolher "Suporte" fixava o acesso todo e
// a única saída era inventar um papel novo.
//
// ─── O AVISO DE "NUNCA CONFIGURADO" ─────────────────────────────────────────
//
// Enquanto ninguém mexer, a pessoa vê o que o papel dela dava. Está escrito no
// ecrã porque é a diferença entre "não tem acessos" e "ainda não foi
// configurado", e essas duas coisas parecem iguais numa lista de dezasseis
// linhas.

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { AlertCircle, Eye, Loader2, Pencil, RotateCcw, Slash } from 'lucide-react';
import { toast } from 'sonner';
import { permissionsService, type Grants } from '@/shared/services/permissions.service';
import {
  AREAS, DESCRICAO_DA_AREA, NOME_DA_AREA, type Access, type Area,
} from '@/shared/lib/areas';
import { ApiError } from '@/shared/lib/api-client';

const NIVEIS: { valor: Access; nome: string; icon: typeof Eye }[] = [
  { valor: 'NONE', nome: 'Nenhum', icon: Slash },
  { valor: 'VIEW', nome: 'Ver', icon: Eye },
  { valor: 'MANAGE', nome: 'Gerir', icon: Pencil },
];

/** Os grupos do menu, para a lista sair pela mesma ordem que a barra lateral. */
const GRUPOS: { titulo: string; areas: Area[] }[] = [
  { titulo: 'Operação', areas: ['DASHBOARD', 'DRIVERS', 'DOCUMENTS', 'FLEET', 'RANKS'] },
  { titulo: 'Dinheiro', areas: ['SETTLEMENTS', 'FINANCIAL', 'GREEN_RECEIPTS', 'ANALYTICS'] },
  { titulo: 'Investimento', areas: ['INVESTMENTS', 'INVESTORS', 'PROJECTS'] },
  { titulo: 'Sistema', areas: ['NOTIFICATIONS', 'SUPPORT', 'SETTINGS', 'TEAM'] },
];

export function PermissionsDialog({ userId, onClose }: {
  userId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [grants, setGrants] = useState<Grants | null>(null);
  const [mexido, setMexido] = useState(false);

  const q = useQuery({
    queryKey: ['permissions', userId],
    queryFn: () => permissionsService.get(userId),
  });
  const catalogo = useQuery({
    queryKey: ['permissions', 'catalog'],
    queryFn: () => permissionsService.catalog(),
    staleTime: 60 * 60 * 1000, // muda com um deploy, não durante a sessão
  });

  // O estado local arranca do que veio do servidor. Editar diretamente a
  // resposta da consulta faria cada clique disparar uma escrita — e com
  // dezasseis áreas isso são dezasseis pedidos para uma decisão só.
  useEffect(() => {
    if (q.data && !grants) setGrants(q.data.grants);
  }, [q.data, grants]);

  const guardar = useMutation({
    mutationFn: () => permissionsService.set(userId, grants ?? {}),
    onSuccess: () => {
      toast.success('Acessos guardados. Fazem efeito na próxima página que ele abrir.');
      void qc.invalidateQueries({ queryKey: ['permissions'] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Não foi possível guardar.'),
  });

  const repor = useMutation({
    mutationFn: () => permissionsService.reset(userId),
    onSuccess: (r) => {
      toast.success('Reposto o comportamento do papel.');
      setGrants(r.grants);
      setMexido(false);
      void qc.invalidateQueries({ queryKey: ['permissions'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Não foi possível repor.'),
  });

  function definir(area: Area, valor: Access) {
    setGrants((g) => (g ? { ...g, [area]: valor } : g));
    setMexido(true);
  }

  function aplicarPerfil(acessos: Partial<Grants>) {
    // Um perfil preenche as dezasseis, não só as que menciona: as que ele não
    // menciona ficam em NONE. Deixá-las como estavam daria uma mistura entre o
    // perfil escolhido e o que lá estava antes, e ninguém saberia explicar o
    // resultado.
    const base = Object.fromEntries(AREAS.map((a) => [a, 'NONE'])) as Grants;
    setGrants({ ...base, ...acessos } as Grants);
    setMexido(true);
  }

  const alvo = q.data?.user;
  const ehAdmin = alvo?.role === 'ADMIN';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Acessos de {alvo?.name ?? '—'}</DialogTitle>
          <DialogDescription>
            O que ele vê no menu e o que pode fazer em cada área.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading || !grants ? (
          <Skeleton className="h-80 w-full" />
        ) : ehAdmin ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="flex items-start gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Um administrador tem acesso a tudo
            </p>
            <p className="mt-1 pl-6 text-sm text-amber-800 dark:text-amber-300">
              É deliberado e não se pode mudar aqui: sem esta regra, uma
              configuração errada trancava o dono fora do próprio sistema, e o
              ecrã que a corrigiria também estaria trancado. Para limitar esta
              pessoa, baixe-a primeiro a gestor ou a suporte.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ── Perfis ─────────────────────────────────────────────────── */}
            <div>
              <p className="text-sm font-medium">Começar por um perfil</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Preenche tudo de uma vez. Depois muda o que for preciso — não fica preso.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(catalogo.data?.profiles ?? []).map((p) => (
                  <Button
                    key={p.id} variant="outline" size="sm"
                    title={p.descricao}
                    onClick={() => aplicarPerfil(p.acessos as Partial<Grants>)}
                  >
                    {p.nome}
                  </Button>
                ))}
              </div>
            </div>

            {!q.data?.configured && !mexido && (
              <p className="rounded-lg border border-border bg-secondary p-3 text-xs text-muted-foreground">
                Esta pessoa <strong>ainda não foi configurada</strong>. O que está abaixo é
                o que o papel dela dava até agora. Assim que guardar, passa a valer esta
                configuração e o papel deixa de decidir.
              </p>
            )}

            {/* ── As áreas ───────────────────────────────────────────────── */}
            {GRUPOS.map((g) => (
              <div key={g.titulo}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {g.titulo}
                </p>
                <div className="space-y-1">
                  {g.areas.map((area) => (
                    <div
                      key={area}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{NOME_DA_AREA[area]}</p>
                        <p className="text-xs text-muted-foreground">
                          {DESCRICAO_DA_AREA[area]}
                        </p>
                      </div>

                      <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
                        {NIVEIS.map(({ valor, nome, icon: Icon }) => {
                          const ativo = grants[area] === valor;
                          return (
                            <button
                              key={valor}
                              type="button"
                              aria-pressed={ativo}
                              onClick={() => definir(area, valor)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                                ativo
                                  ? 'bg-brand-500 text-white'
                                  : 'bg-transparent text-muted-foreground hover:bg-secondary'
                              }`}
                            >
                              <Icon className="h-3 w-3" aria-hidden="true" />
                              {nome}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <p className="text-xs text-muted-foreground">
              <strong>Ver</strong> abre a tela e lê; <strong>Gerir</strong> também altera.
              O servidor recusa o que não estiver aqui autorizado — esconder um menu nunca
              foi uma permissão.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {!ehAdmin && q.data?.configured && (
            <Button
              variant="ghost" size="sm"
              disabled={repor.isPending}
              onClick={() => repor.mutate()}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Voltar ao padrão do papel
            </Button>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={onClose}>
              {ehAdmin ? 'Fechar' : 'Cancelar'}
            </Button>
            {!ehAdmin && (
              <Button disabled={!grants || guardar.isPending} onClick={() => guardar.mutate()}>
                {guardar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar acessos
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
