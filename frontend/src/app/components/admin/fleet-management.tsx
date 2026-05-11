// src/app/components/admin/fleet-management.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Car, Plus, Settings, AlertCircle, CheckCircle, Loader2, Wrench, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { usersService }    from '@/features/admin/services/users.service';
import { queryKeys }       from '@/shared/lib/query-keys';
import type { VehicleStatus } from '@/shared/types/api';

function getStatusBadge(status: VehicleStatus) {
  const config = {
    ACTIVE:      { label: 'Ativo',       icon: CheckCircle, cls: 'bg-green-100 text-green-800' },
    INACTIVE:    { label: 'Inativo',     icon: Car,         cls: 'bg-gray-100 text-gray-800' },
    MAINTENANCE: { label: 'Manutenção',  icon: Wrench,      cls: 'bg-orange-100 text-orange-800' },
    SOLD:        { label: 'Vendido',     icon: AlertCircle, cls: 'bg-red-100 text-red-800' },
  };
  const { label, icon: Icon, cls } = config[status] ?? config.INACTIVE;
  return (
    <Badge className={`${cls} hover:${cls} flex items-center gap-1 w-fit`}>
      <Icon className="h-3 w-3" />{label}
    </Badge>
  );
}

const EMPTY_FORM = { brand: '', model: '', plate: '', year: new Date().getFullYear() };

export function FleetManagement() {
  const queryClient = useQueryClient();
  const [open, setOpen]   = useState(false);
  const [form, setForm]   = useState(EMPTY_FORM);

  // ── Leitura ───────────────────────────────────────────────────────────────
  const vehiclesQ = useQuery({ queryKey: queryKeys.vehicles.list, queryFn: () => vehiclesService.list() });
  const usersQ    = useQuery({ queryKey: queryKeys.users.list,    queryFn: () => usersService.list() });

  const vehicles = vehiclesQ.data?.vehicles ?? [];
  const users    = usersQ.data?.users       ?? [];

  // ── Criar veículo ─────────────────────────────────────────────────────────
  const { mutate: createVehicle, isPending: creating } = useMutation({
    mutationFn: () => vehiclesService.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success('Veículo adicionado com sucesso!');
      setOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao adicionar veículo.'),
  });

  // ── Alterar status ────────────────────────────────────────────────────────
  const { mutate: updateStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: VehicleStatus }) =>
      vehiclesService.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success('Status atualizado.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atualizar status.'),
  });

  // ── Remover ───────────────────────────────────────────────────────────────
  const { mutate: removeVehicle } = useMutation({
    mutationFn: (id: string) => vehiclesService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success('Veículo removido.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao remover veículo.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand || !form.model || !form.plate) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    createVehicle();
  }

  const isLoading = vehiclesQ.isLoading;
  const isError   = vehiclesQ.isError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando frota…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar veículos.</p>
        <Button variant="outline" onClick={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all })
        }>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total',      value: vehicles.length,                                          color: 'blue',   icon: Car },
          { label: 'Ativos',     value: vehicles.filter(v => v.status === 'ACTIVE').length,       color: 'green',  icon: CheckCircle },
          { label: 'Manutenção', value: vehicles.filter(v => v.status === 'MAINTENANCE').length,  color: 'orange', icon: Settings },
          { label: 'Inativos',   value: vehicles.filter(v => v.status === 'INACTIVE').length,     color: 'gray',   icon: AlertCircle },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <h3 className="text-2xl font-bold mt-1">{value}</h3>
              </div>
              <div className="h-10 w-10 bg-[#108865]/10 rounded-lg flex items-center justify-center">
                <Icon className="h-5 w-5 text-[#108865]" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Header + botão */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Gestão de Frotas</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Adicionar Veículo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Veículo</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Marca *</Label>
                  <Input placeholder="Toyota" value={form.brand}
                    onChange={e => setForm({ ...form, brand: e.target.value })} required />
                </div>
                <div className="space-y-1">
                  <Label>Modelo *</Label>
                  <Input placeholder="Corolla" value={form.model}
                    onChange={e => setForm({ ...form, model: e.target.value })} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Placa *</Label>
                  <Input placeholder="ABC-1234" value={form.plate}
                    onChange={e => setForm({ ...form, plate: e.target.value.toUpperCase() })} required />
                </div>
                <div className="space-y-1">
                  <Label>Ano</Label>
                  <Input type="number" min={2000} max={new Date().getFullYear() + 1}
                    value={form.year}
                    onChange={e => setForm({ ...form, year: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Adicionar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader><CardTitle>Veículos ({vehicles.length})</CardTitle></CardHeader>
        <CardContent>
          {vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Nenhum veículo cadastrado ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b">
                  <tr className="text-left">
                    <th className="pb-3 font-semibold">Veículo</th>
                    <th className="pb-3 font-semibold">Placa</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 font-semibold">Motorista</th>
                    <th className="pb-3 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => {
                    const driver = users.find(u => u.id === v.userId);
                    return (
                      <tr key={v.id} className="border-b last:border-0">
                        <td className="py-4">
                          <p className="font-semibold">{v.brand} {v.model}</p>
                          <p className="text-sm text-muted-foreground">{v.year}</p>
                        </td>
                        <td className="py-4">
                          <span className="font-mono font-semibold">{v.plate}</span>
                        </td>
                        <td className="py-4">{getStatusBadge(v.status)}</td>
                        <td className="py-4">
                          {driver
                            ? <span className="text-sm">{driver.name}</span>
                            : <span className="text-sm text-muted-foreground">—</span>}
                        </td>
                        <td className="py-4">
                          <div className="flex gap-1">
                            {v.status === 'ACTIVE' && (
                              <Button variant="outline" size="sm"
                                onClick={() => updateStatus({ id: v.id, status: 'MAINTENANCE' })}>
                                <Wrench className="h-3 w-3 mr-1" />Manutenção
                              </Button>
                            )}
                            {v.status === 'MAINTENANCE' && (
                              <Button variant="outline" size="sm"
                                onClick={() => updateStatus({ id: v.id, status: 'ACTIVE' })}>
                                <CheckCircle className="h-3 w-3 mr-1" />Ativar
                              </Button>
                            )}
                            <Button variant="ghost" size="sm"
                              onClick={() => {
                                if (confirm('Remover este veículo?')) removeVehicle(v.id);
                              }}>
                              <Trash2 className="h-3 w-3 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}