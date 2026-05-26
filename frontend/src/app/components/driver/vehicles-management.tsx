// src/app/components/driver/vehicles-management.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/app/components/ui/alert-dialog';
import { Car, Plus, Pencil, Trash2, Loader2, AlertCircle, CheckCircle, WrenchIcon, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { ApiVehicle, VehicleStatus } from '@/shared/types/api';

const STATUS_LABELS: Record<VehicleStatus, string> = {
  ACTIVE:      'Ativo',
  INACTIVE:    'Inativo',
  MAINTENANCE: 'Manutenção',
  SOLD:        'Vendido',
};

function getStatusBadge(status: VehicleStatus) {
  switch (status) {
    case 'ACTIVE':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Ativo</Badge>;
    case 'INACTIVE':
      return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100"><XCircle className="h-3 w-3 mr-1" />Inativo</Badge>;
    case 'MAINTENANCE':
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><WrenchIcon className="h-3 w-3 mr-1" />Manutenção</Badge>;
    case 'SOLD':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Vendido</Badge>;
    default:
      return null;
  }
}

const EMPTY_FORM = { brand: '', model: '', plate: '', year: '' };

export function VehiclesManagement() {
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<ApiVehicle | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // ── Leitura ───────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.vehicles.list,
    queryFn:  () => vehiclesService.list(),
  });

  const vehicles = data?.vehicles ?? [];

  // ── Criar ─────────────────────────────────────────────────────────────────
  const { mutate: createVehicle, isPending: isCreating } = useMutation({
    mutationFn: () =>
      vehiclesService.create({
        brand: form.brand.trim(),
        model: form.model.trim(),
        plate: form.plate.trim().toUpperCase(),
        year:  Number(form.year),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success('Veículo cadastrado com sucesso!');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao cadastrar veículo.');
    },
  });

  // ── Editar ────────────────────────────────────────────────────────────────
  const { mutate: updateVehicle, isPending: isUpdating } = useMutation({
    mutationFn: () =>
      vehiclesService.update(editVehicle!.id, {
        brand: form.brand.trim(),
        model: form.model.trim(),
        plate: form.plate.trim().toUpperCase(),
        year:  Number(form.year),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success('Veículo atualizado!');
      setEditVehicle(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao atualizar veículo.');
    },
  });

  // ── Remover ───────────────────────────────────────────────────────────────
  const { mutate: removeVehicle } = useMutation({
    mutationFn: (id: string) => vehiclesService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success('Veículo removido.');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao remover veículo.');
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function openEdit(v: ApiVehicle) {
    setEditVehicle(v);
    setForm({ brand: v.brand, model: v.model, plate: v.plate, year: String(v.year) });
  }

  function closeEdit() {
    setEditVehicle(null);
    setForm(EMPTY_FORM);
  }

  function handleField(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function isFormValid() {
    return (
      form.brand.trim() &&
      form.model.trim() &&
      form.plate.trim().length >= 7 &&
      Number(form.year) >= 1950 &&
      Number(form.year) <= new Date().getFullYear() + 1
    );
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid()) { toast.error('Preencha todos os campos corretamente.'); return; }
    createVehicle();
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid()) { toast.error('Preencha todos os campos corretamente.'); return; }
    updateVehicle();
  }

  // ── Formulário reutilizável ────────────────────────────────────────────────
  function VehicleForm({
    onSubmit,
    isPending,
    onCancel,
    submitLabel,
  }: {
    onSubmit: (e: React.FormEvent) => void;
    isPending: boolean;
    onCancel: () => void;
    submitLabel: string;
  }) {
    return (
      <form onSubmit={onSubmit} className="space-y-4 mt-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="brand">Marca</Label>
            <Input
              id="brand"
              name="brand"
              placeholder="Toyota"
              value={form.brand}
              onChange={handleField}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Modelo</Label>
            <Input
              id="model"
              name="model"
              placeholder="Corolla"
              value={form.model}
              onChange={handleField}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="plate">Placa</Label>
            <Input
              id="plate"
              name="plate"
              placeholder="ABC1D23"
              value={form.plate}
              onChange={handleField}
              maxLength={8}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="year">Ano</Label>
            <Input
              id="year"
              name="year"
              type="number"
              placeholder={String(new Date().getFullYear())}
              value={form.year}
              onChange={handleField}
              min={1950}
              max={new Date().getFullYear() + 1}
              required
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending || !isFormValid()}>
            {isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</>
              : submitLabel
            }
          </Button>
        </div>
      </form>
    );
  }

  // ── Estados ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando veículos…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar veículos.</p>
        <Button
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all })}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Meus Veículos</h2>
          <p className="text-muted-foreground">Gerencie seus veículos cadastrados</p>
        </div>

        {/* Modal — Cadastrar */}
        <Dialog open={createOpen} onOpenChange={(v) => { if (!v) { setCreateOpen(false); setForm(EMPTY_FORM); } else setCreateOpen(true); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Veículo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar Veículo</DialogTitle>
              <DialogDescription>Preencha os dados do veículo</DialogDescription>
            </DialogHeader>
            <VehicleForm
              onSubmit={handleCreateSubmit}
              isPending={isCreating}
              onCancel={() => { setCreateOpen(false); setForm(EMPTY_FORM); }}
              submitLabel="Cadastrar"
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Modal — Editar */}
      <Dialog open={!!editVehicle} onOpenChange={(v) => { if (!v) closeEdit(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Veículo</DialogTitle>
            <DialogDescription>Atualize os dados do veículo</DialogDescription>
          </DialogHeader>
          <VehicleForm
            onSubmit={handleEditSubmit}
            isPending={isUpdating}
            onCancel={closeEdit}
            submitLabel="Salvar"
          />
        </DialogContent>
      </Dialog>

      {/* Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {vehicles.map((v) => (
          <Card key={v.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <Car className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{v.brand} {v.model}</CardTitle>
                    <CardDescription>
                      {v.plate} · {v.year}
                    </CardDescription>
                  </div>
                </div>
                {getStatusBadge(v.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => openEdit(v)}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Editar
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:border-red-300">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover veículo?</AlertDialogTitle>
                      <AlertDialogDescription>
                        O veículo <strong>{v.brand} {v.model} — {v.plate}</strong> será removido permanentemente. Essa ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700"
                        onClick={() => removeVehicle(v.id)}
                      >
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty state */}
      {vehicles.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Car className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Nenhum veículo cadastrado</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Cadastre seu veículo para começar a trabalhar na plataforma.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Veículo
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}