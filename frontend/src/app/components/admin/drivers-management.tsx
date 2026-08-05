// src/app/components/admin/drivers-management.tsx
//
// Lista de motoristas (admin). O clique em "Ver" navega para a ficha
// completa do motorista (drivers/:id) com saldo, ajustes e documentos.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { DriverAvatar, findProfilePhoto } from '@/app/components/ui/driver-avatar';
import { documentsService } from '@/features/driver/services/documents.service';
import { Search, Eye, Mail, Loader2, AlertCircle, Users, X } from 'lucide-react';
import { usersService } from '@/features/admin/services/users.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatDate } from '@/shared/lib/format';
import type { ApiUser, UserStatus } from '@/shared/types/api';

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

export function DriversManagement() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // 'pending' filtra quem espera decisão nossa — a pergunta mais frequente de
  // quem abre esta tela.
  const [pendingFilter, setPendingFilter] = useState<'all' | 'pending' | 'clear'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'pending'>('name');

  // Uma consulta para toda a lista: as fotografias saem daqui, em vez de uma
  // chamada por linha.
  const docsQ = useQuery({
    queryKey: queryKeys.documents.list,
    queryFn: () => documentsService.list(),
  });
  const documents = docsQ.data?.documents ?? [];

  // Pendências por motorista, derivadas dos documentos já carregados para as
  // fotografias — sem pedido adicional.
  //
  // "Por rever" é o que espera decisão da administração; "por regularizar" é o
  // que espera ação do motorista. São filas diferentes e quem olha a lista
  // precisa de distinguir: a primeira é trabalho dela, a segunda é dele.
  const pendingByUser = useMemo(() => {
    const map = new Map<string, { toReview: number; toFix: number }>();
    for (const d of documents) {
      const entry = map.get(d.userId) ?? { toReview: 0, toFix: 0 };
      if (d.status === 'PENDING') entry.toReview += 1;
      else if (d.status === 'REJECTED' || d.status === 'EXPIRED') entry.toFix += 1;
      map.set(d.userId, entry);
    }
    return map;
  }, [documents]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.users.list,
    queryFn: () => usersService.list(),
  });

  const drivers = (data?.users ?? []).filter((u) => u.role === 'DRIVER');

  const filtered = useMemo(() => {
    // Cada palavra tem de constar do nome ou do email, em qualquer ordem:
    // "elias gmail" encontra o mesmo que "gmail elias". A busca antiga exigia
    // que a expressão inteira aparecesse seguida.
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);

    const list = drivers.filter((u) => {
      const haystack = `${u.name} ${u.email}`.toLowerCase();
      const matchSearch = terms.every((t) => haystack.includes(t));
      const matchStatus = statusFilter === 'all' || u.status === statusFilter;

      const p = pendingByUser.get(u.id);
      const total = (p?.toReview ?? 0) + (p?.toFix ?? 0);
      const matchPending =
        pendingFilter === 'all' ||
        (pendingFilter === 'pending' ? total > 0 : total === 0);

      return matchSearch && matchStatus && matchPending;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'recent') return b.createdAt.localeCompare(a.createdAt);
      if (sortBy === 'pending') {
        const pa = pendingByUser.get(a.id);
        const pb = pendingByUser.get(b.id);
        // Por rever pesa mais que por regularizar: é a fila da administração.
        const score = (p?: { toReview: number; toFix: number }) =>
          (p?.toReview ?? 0) * 10 + (p?.toFix ?? 0);
        const diff = score(pb) - score(pa);
        if (diff !== 0) return diff;
      }
      return a.name.localeCompare(b.name, 'pt');
    });
  }, [drivers, search, statusFilter, pendingFilter, sortBy, pendingByUser]);

  const counts = {
    total: drivers.length,
    active: drivers.filter((d) => d.status === 'ACTIVE').length,
    blocked: drivers.filter((d) => d.status === 'BLOCKED').length,
    regularization: drivers.filter((d) => d.status === 'AGUARDANDO_REGULARIZACAO').length,
  };

  const totalPending = [...pendingByUser.values()].reduce(
    (sum, p) => sum + p.toReview + p.toFix, 0,
  );

  const hasFilters =
    !!search || statusFilter !== 'all' || pendingFilter !== 'all' || sortBy !== 'name';

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
    setPendingFilter('all');
    setSortBy('name');
  }

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
            onClick={() => setStatusFilter(key)}
            aria-pressed={statusFilter === key}
            className={`rounded-xl border p-4 text-left shadow-card transition-colors sm:p-5 ${
              statusFilter === key
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
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Procurar por nome ou email…"
              className="pl-9 pr-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Limpar pesquisa"
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
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

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
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
              onClick={() => setPendingFilter(key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                pendingFilter === key
                  ? 'border-transparent bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table — desktop */}
      <Card className="hidden shadow-card md:block">
        <CardContent className="pt-6">
          <p className="mb-3 text-sm text-muted-foreground">
            {filtered.length === drivers.length
              ? `${drivers.length} motorista${drivers.length !== 1 ? 's' : ''}`
              : `${filtered.length} de ${drivers.length}`}
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
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center">
                    <p className="text-muted-foreground">
                      {hasFilters ? 'Nenhum motorista neste filtro.' : 'Ainda não há motoristas registados.'}
                    </p>
                    {hasFilters && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="mt-2 text-sm underline underline-offset-2"
                      >
                        Limpar filtros
                      </button>
                    )}
                  </TableCell></TableRow>
              )}
              {filtered.map((user) => (
                <TableRow
                  key={user.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => openDriver(user)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <DriverAvatar name={user.name} photo={findProfilePhoto(documents, user.id)} />
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><StatusPill status={user.status} /></TableCell>
                  <TableCell><PendingCell pending={pendingByUser.get(user.id)} /></TableCell>
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
        <p className="text-sm text-muted-foreground font-medium">Motoristas ({filtered.length})</p>
        {filtered.length === 0 && (
          <Card className="shadow-card"><CardContent className="py-10 text-center">
              <p className="text-muted-foreground">
                {hasFilters ? 'Nenhum motorista neste filtro.' : 'Ainda não há motoristas registados.'}
              </p>
              {hasFilters && (
                <button type="button" onClick={clearFilters} className="mt-2 text-sm underline underline-offset-2">
                  Limpar filtros
                </button>
              )}
            </CardContent></Card>
        )}
        {filtered.map((user) => (
          <Card key={user.id} className="shadow-card cursor-pointer active:bg-muted/40" onClick={() => openDriver(user)}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <DriverAvatar name={user.name} photo={findProfilePhoto(documents, user.id)} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{user.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">Desde {formatDate(user.createdAt)}</p>
                  <div className="mt-2">
                    <PendingCell pending={pendingByUser.get(user.id)} />
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