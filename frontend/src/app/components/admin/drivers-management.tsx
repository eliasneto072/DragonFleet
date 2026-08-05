// src/app/components/admin/drivers-management.tsx
//
// Lista de motoristas (admin). O clique em "Ver" navega para a ficha
// completa do motorista (drivers/:id) com saldo, ajustes e documentos.

import { useState } from 'react';
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
import { Search, Eye, Mail, Loader2, AlertCircle, Users } from 'lucide-react';
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

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="h-9 w-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-sm font-semibold shrink-0">
      {initials}
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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.users.list,
    queryFn: () => usersService.list(),
  });

  const drivers = (data?.users ?? []).filter((u) => u.role === 'DRIVER');
  const filtered = drivers.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    total: drivers.length,
    active: drivers.filter((d) => d.status === 'ACTIVE').length,
    blocked: drivers.filter((d) => d.status === 'BLOCKED').length,
    regularization: drivers.filter((d) => d.status === 'AGUARDANDO_REGULARIZACAO').length,
  };

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
        <Card className="shadow-card"><CardContent className="pt-5">
          <p className="text-sm text-muted-foreground mb-1">Total</p>
          <p className="text-2xl font-bold">{counts.total}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="pt-5">
          <p className="text-sm text-muted-foreground mb-1">Ativos</p>
          <p className="text-2xl font-bold text-success">{counts.active}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="pt-5">
          <p className="text-sm text-muted-foreground mb-1">Regularização</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{counts.regularization}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="pt-5">
          <p className="text-sm text-muted-foreground mb-1">Bloqueados</p>
          <p className="text-2xl font-bold text-destructive">{counts.blocked}</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card className="shadow-card">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou email…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ACTIVE">Ativos</SelectItem>
                <SelectItem value="INACTIVE">Inativos</SelectItem>
                <SelectItem value="AGUARDANDO_REGULARIZACAO">Aguardando regularização</SelectItem>
                <SelectItem value="BLOCKED">Bloqueados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table — desktop */}
      <Card className="hidden md:block shadow-card">
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Membro desde</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-10">Nenhum motorista encontrado.</TableCell></TableRow>
              )}
              {filtered.map((user) => (
                <TableRow
                  key={user.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => openDriver(user)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={user.name} />
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><StatusPill status={user.status} /></TableCell>
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
          <Card className="shadow-card"><CardContent className="text-center text-muted-foreground py-10">Nenhum motorista encontrado.</CardContent></Card>
        )}
        {filtered.map((user) => (
          <Card key={user.id} className="shadow-card cursor-pointer active:bg-muted/40" onClick={() => openDriver(user)}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <Avatar name={user.name} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{user.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">Desde {formatDate(user.createdAt)}</p>
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