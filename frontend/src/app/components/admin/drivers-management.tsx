// src/app/components/admin/drivers-management.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Search, Eye, UserCheck, UserX, Mail, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { usersService } from '@/features/admin/services/users.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { ApiUser, UserStatus } from '@/shared/types/api';

function getStatusBadge(status: UserStatus) {
  switch (status) {
    case 'ACTIVE':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Ativo</Badge>;
    case 'INACTIVE':
      return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Inativo</Badge>;
    case 'BLOCKED':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Bloqueado</Badge>;
    default:
      return null;
  }
}

export function DriversManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null);

  // ── Leitura ───────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.users.list,
    queryFn:  () => usersService.list(),
  });

  const drivers = (data?.users ?? []).filter(u => u.role === 'DRIVER');

  const filtered = drivers.filter(u => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Alterar status (ativar / desativar / bloquear) ────────────────────────
  const { mutate: updateStatus, isPending: updatingStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      usersService.update(id, { status }),
    onSuccess: ({ user }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success(`Motorista ${user.status === 'ACTIVE' ? 'ativado' : 'desativado'} com sucesso.`);
      setSelectedUser(null);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atualizar motorista.'),
  });

  // ── Estados ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando motoristas…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar motoristas.</p>
        <Button variant="outline" onClick={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
        }>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Gestão de Motoristas</h2>
        <p className="text-muted-foreground">Gerencie todos os motoristas da plataforma</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="ACTIVE">Ativos</SelectItem>
                <SelectItem value="INACTIVE">Inativos</SelectItem>
                <SelectItem value="BLOCKED">Bloqueados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Motoristas ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
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
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                    Nenhum motorista encontrado.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />{user.email}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(user.status)}</TableCell>
                  <TableCell>
                    {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedUser(user)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Detalhes do Motorista</DialogTitle>
                          <DialogDescription>Informações e ações de gestão</DialogDescription>
                        </DialogHeader>
                        {selectedUser && (
                          <div className="space-y-6 mt-2">
                            {/* Info */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">Nome</p>
                                <p className="font-medium">{selectedUser.name}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Status</p>
                                <div className="mt-1">{getStatusBadge(selectedUser.status)}</div>
                              </div>
                              <div>
                                <p className="text-muted-foreground">E-mail</p>
                                <p className="font-medium">{selectedUser.email}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Membro desde</p>
                                <p className="font-medium">
                                  {new Date(selectedUser.createdAt).toLocaleDateString('pt-BR')}
                                </p>
                              </div>
                            </div>

                            {/* Ações */}
                            <div className="flex gap-2">
                              {selectedUser.status !== 'ACTIVE' && (
                                <Button
                                  className="flex-1"
                                  disabled={updatingStatus}
                                  onClick={() => updateStatus({ id: selectedUser.id, status: 'ACTIVE' })}
                                >
                                  {updatingStatus
                                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    : <UserCheck className="h-4 w-4 mr-2" />}
                                  Ativar
                                </Button>
                              )}
                              {selectedUser.status === 'ACTIVE' && (
                                <Button
                                  variant="outline"
                                  className="flex-1"
                                  disabled={updatingStatus}
                                  onClick={() => updateStatus({ id: selectedUser.id, status: 'INACTIVE' })}
                                >
                                  {updatingStatus
                                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    : <UserX className="h-4 w-4 mr-2" />}
                                  Desativar
                                </Button>
                              )}
                              {selectedUser.status !== 'BLOCKED' && (
                                <Button
                                  variant="destructive"
                                  className="flex-1"
                                  disabled={updatingStatus}
                                  onClick={() => updateStatus({ id: selectedUser.id, status: 'BLOCKED' })}
                                >
                                  Bloquear
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}