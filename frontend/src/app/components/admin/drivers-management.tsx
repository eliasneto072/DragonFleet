// src/app/components/admin/drivers-management.tsx
//
// Redesigned (light fintech shell). Same data layer, queries and mutations.
// Adds: PageHeader, avatar initials, refined status pills, stat row, cleaner
// table + mobile cards. Currency/date via shared helpers where relevant.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/app/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { PageHeader } from '@/app/components/ui/page-header';
import { Search, Eye, UserCheck, UserX, Ban, Mail, Loader2, AlertCircle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { usersService } from '@/features/admin/services/users.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatDate } from '@/shared/lib/format';
import type { ApiUser, UserStatus } from '@/shared/types/api';

const STATUS_STYLES: Record<UserStatus, { label: string; cls: string }> = {
  ACTIVE:   { label: 'Ativo',      cls: 'bg-brand-50 text-brand-700' },
  INACTIVE: { label: 'Inativo',    cls: 'bg-secondary text-muted-foreground' },
  BLOCKED:  { label: 'Bloqueado',  cls: 'bg-destructive/10 text-destructive' },
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

export function DriversManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null);

  const { data, isLoading, isError } = useQuery({
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
  };

  const { mutate: updateStatus, isPending: updatingStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      usersService.update(id, { status }),
    onSuccess: ({ user }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success(`Motorista ${user.status === 'ACTIVE' ? 'ativado' : 'atualizado'} com sucesso.`);
      setSelectedUser(null);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atualizar motorista.'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /><span>Carregando motoristas…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Erro ao carregar motoristas.</p>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.users.all })}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const actionButtons = (u: ApiUser) => (
    <div className="flex flex-col gap-2">
      {u.status !== 'ACTIVE' && (
        <Button className="flex-1" disabled={updatingStatus} onClick={() => updateStatus({ id: u.id, status: 'ACTIVE' })}>
          {updatingStatus ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserCheck className="h-4 w-4 mr-2" />}Ativar
        </Button>
      )}
      {u.status === 'ACTIVE' && (
        <Button variant="outline" className="flex-1" disabled={updatingStatus} onClick={() => updateStatus({ id: u.id, status: 'INACTIVE' })}>
          {updatingStatus ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserX className="h-4 w-4 mr-2" />}Desativar
        </Button>
      )}
      {u.status !== 'BLOCKED' && (
        <Button variant="destructive" className="flex-1" disabled={updatingStatus} onClick={() => updateStatus({ id: u.id, status: 'BLOCKED' })}>
          <Ban className="h-4 w-4 mr-2" />Bloquear
        </Button>
      )}
    </div>
  );

  const detailDialog = (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Detalhes do motorista</DialogTitle>
        <DialogDescription>Informações e ações de gestão</DialogDescription>
      </DialogHeader>
      {selectedUser && (
        <div className="space-y-6 mt-2">
          <div className="flex items-center gap-3">
            <Avatar name={selectedUser.name} />
            <div>
              <p className="font-semibold">{selectedUser.name}</p>
              <StatusPill status={selectedUser.status} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-muted-foreground">E-mail</p><p className="font-medium break-all">{selectedUser.email}</p></div>
            <div><p className="text-muted-foreground">Membro desde</p><p className="font-medium">{formatDate(selectedUser.createdAt)}</p></div>
          </div>
          {actionButtons(selectedUser)}
        </div>
      )}
    </DialogContent>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de motoristas"
        subtitle="Gerencie todos os motoristas da plataforma"
        icon={<Users className="h-5 w-5" />}
      />

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="shadow-card"><CardContent className="pt-5">
          <p className="text-sm text-muted-foreground mb-1">Total</p>
          <p className="text-2xl font-bold">{counts.total}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="pt-5">
          <p className="text-sm text-muted-foreground mb-1">Ativos</p>
          <p className="text-2xl font-bold text-success">{counts.active}</p>
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
                <TableRow key={user.id}>
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
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedUser(user)}><Eye className="h-4 w-4" /></Button>
                      </DialogTrigger>
                      {detailDialog}
                    </Dialog>
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
          <Card key={user.id} className="shadow-card">
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
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => setSelectedUser(user)}><Eye className="h-3 w-3 mr-1" />Ver</Button>
                    </DialogTrigger>
                    {detailDialog}
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
