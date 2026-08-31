// src/app/components/admin/drivers-management.tsx
//
// Lista de motoristas (admin). O clique em "Ver" navega para a ficha
// completa do motorista (drivers/:id) com saldo, ajustes e documentos.

import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/app/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { PageHeader } from '@/app/components/ui/page-header';
import { Skeleton } from '@/app/components/ui/skeleton';
import { DriverAvatar } from '@/app/components/ui/driver-avatar';
import { Search, Eye, Mail, AlertCircle, Users, X } from 'lucide-react';
import { usersService } from '@/features/admin/services/users.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatDate } from '@/shared/lib/format';
import type { ApiUser, UserStatus } from '@/shared/types/api';
import { useListState } from '@/shared/hooks/use-list-state';
import { Pagination } from '@/app/components/ui/list-toolbar';

const STATUS_STYLES: Record<UserStatus, { label: string; cls: string }> = {
  ACTIVE: { label: 'Ativo', cls: 'bg-brand-50 text-brand-700' },
  INACTIVE: { label: 'Inativo', cls: 'bg-secondary text-muted-foreground' },
  BLOCKED: { label: 'Bloqueado', cls: 'bg-destructive/10 text-destructive' },
  AGUARDANDO_REGULARIZACAO: { label: 'Aguardando regularização', cls: 'bg-amber-100 text-amber-700' },
};

function StatusPill({ status }: { status: UserStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.INACTIVE;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

/**
 * Pendências de um motorista, em duas categorias.
 *
 * Antes, a lista mostrava nome, email, estado e data — nada que dissesse se
 * havia algo à espera. Descobrir que um documento estava por rever exigia abrir
 * cada ficha, uma a uma.
 */
function PendingCell({ pending }: { pending?: { toReview: number; toFix: number } }) {
  const toReview = pending?.toReview ?? 0;
  const toFix = pending?.toFix ?? 0;

  if (!toReview && !toFix) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {toReview > 0 && (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {toReview} por rever
        </span>
      )}
      {toFix > 0 && (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
          {toFix} por regularizar
        </span>
      )}
    </div>
  );
}

// Espelha a estrutura real: cabeçalho, quatro contadores, filtros e linhas.
function DriversSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" role="status" aria-busy="true">
      <span className="sr-only">A carregar motoristas…</span>

      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="shadow-card">
            <CardContent className="space-y-2 pt-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-full sm:w-48" />
      </div>

      <Card className="shadow-card">
        <CardContent className="space-y-4 p-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-52" />
              </div>
              <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Motoristas por página.
 *
 * 25 é o que cabe num ecrã sem obrigar a rolar muito, e é o que se pede ao
 * servidor — não um teto de renderização sobre uma lista já descarregada.
 */
const PAGE_SIZE = 25;

export function DriversManagement() {
  const navigate = useNavigate();
  // O painel encaminha para cá com o filtro já escolhido: sem isto, a linha
  // "2 motoristas bloqueados" levava à lista completa e obrigava a descobrir
  // sozinho quais eram.
  const location = useLocation();
  const incoming = (location.state ?? {}) as { status?: string };

  // Pesquisa, filtros e página vivem no ENDEREÇO, não em estado local.
  //
  // Recarregar deixa de perder o que se estava a fazer, o botão "voltar" desfaz
  // o último filtro em vez de sair da tela, e passa a ser possível mandar um
  // link a alguém — "vê estes motoristas bloqueados". Nenhuma das três era
  // possível antes.
  const lista = useListState({
    defaults: { status: incoming.status ?? 'all', pending: 'all', sort: 'name' },
  });
  const { filters, page } = lista;

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    // Os parâmetros entram na chave: cada combinação é um resultado próprio,
    // e voltar a um filtro anterior serve-se da cache em vez de repetir o
    // pedido.
    queryKey: [...queryKeys.users.list, lista.search, filters.status, filters.pending, filters.sort, page] as const,
    queryFn: () => usersService.list({
      role: 'DRIVER',
      search: lista.search || undefined,
      status: filters.status !== 'all' ? filters.status : undefined,
      pending: filters.pending !== 'all' ? filters.pending : undefined,
      sort: filters.sort !== 'name' ? filters.sort : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    // Mantém a página anterior à vista enquanto a nova chega, em vez de piscar
    // o esqueleto a cada tecla.
    placeholderData: (anterior) => anterior,
  });

  const drivers = data?.users ?? [];
  const pageInfo = data?.page;

  // As contagens vêm do SERVIDOR e cobrem a frota inteira.
  //
  // Eram calculadas a partir do array descarregado. Com paginação passariam a
  // contar os 25 da página, e os cartões do topo mudariam de valor conforme se
  // navegasse — "1842 ativos" viraria "18 ativos" na página seguinte.
  const c = data?.counts ?? {};
  const counts = {
    total: Object.values(c).reduce((a, b) => a + b, 0),
    active: c.ACTIVE ?? 0,
    blocked: c.BLOCKED ?? 0,
    regularization: c.AGUARDANDO_REGULARIZACAO ?? 0,
  };

  // Pendências visíveis NESTA página. Não é o total da frota — para isso
  // existe a fila do painel, que conta do lado do servidor.
  const totalPending = drivers.reduce((sum, u) => sum + (u.pendingDocs ?? 0), 0);

  function openDriver(user: ApiUser) {
    navigate(`/app/admin/drivers/${user.id}`);
  }

  if (isLoading) return <DriversSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Erro ao carregar motoristas.</p>
        <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de motoristas"
        subtitle="Gerencie todos os motoristas da plataforma"
        icon={<Users className="h-5 w-5" />}
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Os contadores passam a filtrar. Eram números decorativos: via-se
            "2 bloqueados" e ainda era preciso ir ao selector para os ver. */}
        {([
          { key: 'all', label: 'Total', value: counts.total, cls: '' },
          { key: 'ACTIVE', label: 'Ativos', value: counts.active, cls: 'text-success' },
          { key: 'AGUARDANDO_REGULARIZACAO', label: 'Regularização', value: counts.regularization, cls: 'text-amber-600 dark:text-amber-400' },
          { key: 'BLOCKED', label: 'Bloqueados', value: counts.blocked, cls: 'text-destructive' },
        ] as const).map(({ key, label, value, cls }) => (
          <button
            key={key}
            type="button"
            onClick={() => lista.setFilter('status', key)}
            aria-pressed={filters.status === key}
            className={`rounded-xl border p-4 text-left shadow-card transition-colors sm:p-5 ${
              filters.status === key
                ? 'border-foreground/30 bg-secondary'
                : 'border-border bg-card hover:bg-secondary/50'
            }`}
          >
            <p className="mb-1 text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</p>
          </button>
        ))}
      </div>

      {/* Filtros.
          Sem cartão à volta: a barra tinha um Card só para conter uma linha de
          controlos, o que a fazia competir visualmente com a lista. */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Procurar por nome ou email…"
              className="pl-9 pr-9"
              value={lista.searchInput}
              onChange={(e) => lista.setSearchInput(e.target.value)}
              aria-label="Procurar motoristas"
            />
            {lista.searchInput && (
              <button
                type="button"
                onClick={() => lista.setSearchInput('')}
                aria-label="Limpar pesquisa"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Select value={filters.status} onValueChange={(v) => lista.setFilter('status', v)}>
            <SelectTrigger className="w-full sm:w-[190px]" aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              <SelectItem value="ACTIVE">Ativos</SelectItem>
              <SelectItem value="INACTIVE">Inativos</SelectItem>
              <SelectItem value="AGUARDANDO_REGULARIZACAO">Aguardam regularização</SelectItem>
              <SelectItem value="BLOCKED">Bloqueados</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.sort} onValueChange={(v) => lista.setFilter('sort', v)}>
            <SelectTrigger className="w-full sm:w-[170px]" aria-label="Ordenar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Nome (A-Z)</SelectItem>
              <SelectItem value="pending">Mais pendências</SelectItem>
              <SelectItem value="recent">Mais recentes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Atalho para a pergunta mais frequente: quem espera por mim? */}
        <div className="flex flex-wrap items-center gap-2">
          {([
            { key: 'all', label: 'Todos' },
            { key: 'pending', label: `Com pendências${totalPending > 0 ? ` (${totalPending})` : ''}` },
            { key: 'clear', label: 'Em dia' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => lista.setFilter('pending', key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filters.pending === key
                  ? 'border-transparent bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}

          {lista.hasFilters && (
            <button
              type="button"
              onClick={lista.clearAll}
              className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table — desktop */}
      {pageInfo && (
        <Pagination info={pageInfo} onChange={lista.setPage} busy={isFetching} />
      )}

      <Card className="hidden shadow-card md:block">
        <CardContent className="pt-6">
          <p className="mb-3 text-sm text-muted-foreground">
            {pageInfo ? `${pageInfo.total} motorista${pageInfo.total !== 1 ? 's' : ''}` : ''}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pendências</TableHead>
                <TableHead>Membro desde</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center">
                    <p className="text-muted-foreground">
                      {lista.hasFilters ? 'Nenhum motorista neste filtro.' : 'Ainda não há motoristas registados.'}
                    </p>
                    {lista.hasFilters && (
                      <button
                        type="button"
                        onClick={lista.clearAll}
                        className="mt-2 text-sm underline underline-offset-2"
                      >
                        Limpar filtros
                      </button>
                    )}
                  </TableCell></TableRow>
              )}
              {drivers.map((user) => (
                <TableRow
                  key={user.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => openDriver(user)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <DriverAvatar name={user.name} photo={undefined} />
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><StatusPill status={user.status} /></TableCell>
                  <TableCell><PendingCell pending={({ toReview: user.pendingDocs ?? 0, toFix: 0 })} /></TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); openDriver(user); }}
                    >
                      <Eye className="h-4 w-4 mr-1" />Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-3">
        <p className="text-sm text-muted-foreground font-medium">Motoristas ({pageInfo?.total ?? 0})</p>
        {drivers.length === 0 && (
          <Card className="shadow-card"><CardContent className="py-10 text-center">
              <p className="text-muted-foreground">
                {lista.hasFilters ? 'Nenhum motorista neste filtro.' : 'Ainda não há motoristas registados.'}
              </p>
              {lista.hasFilters && (
                <button type="button" onClick={lista.clearAll} className="mt-2 text-sm underline underline-offset-2">
                  Limpar filtros
                </button>
              )}
            </CardContent></Card>
        )}
        {drivers.map((user) => (
          <Card key={user.id} className="shadow-card cursor-pointer active:bg-muted/40" onClick={() => openDriver(user)}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <DriverAvatar name={user.name} photo={undefined} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{user.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">Desde {formatDate(user.createdAt)}</p>
                  <div className="mt-2">
                    <PendingCell pending={({ toReview: user.pendingDocs ?? 0, toFix: 0 })} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusPill status={user.status} />
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openDriver(user); }}>
                    <Eye className="h-3 w-3 mr-1" />Ver
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}