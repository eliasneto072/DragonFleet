// src/app/components/driver/vehicles-management.tsx
//
// FIXES:
// - Focus-loss bug: VehicleForm was defined INSIDE the component, so every
//   keystroke re-created the component and React remounted the inputs (losing
//   focus). It's now hoisted to module scope and receives form/onField as props.
// - Header used text-white on the (now light) background → illegible. Fixed.
// - Restyled to the light fintech shell (PageHeader, brand status colors).
// - Cada veículo mostra os documentos obrigatórios (enviar/reenviar/ver).

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/app/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/app/components/ui/alert-dialog';
import { PageHeader } from '@/app/components/ui/page-header';
import { Car, Plus, Pencil, Trash2, Loader2, AlertCircle, CheckCircle, WrenchIcon, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { documentsService } from '@/features/driver/services/documents.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { ApiVehicle, VehicleStatus } from '@/shared/types/api';
import { VehicleDocuments } from './vehicle-documents';

type FormState = { brand: string; model: string; plate: string; year: string };
const EMPTY_FORM: FormState = { brand: '', model: '', plate: '', year: '' };

const STATUS_STYLES: Record<VehicleStatus, { label: string; cls: string; icon: typeof CheckCircle }> = {
  ACTIVE: { label: 'Ativo', cls: 'bg-brand-50 text-brand-700', icon: CheckCircle },
  PENDING: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-700', icon: Clock },
  INACTIVE: { label: 'Inativo', cls: 'bg-secondary text-muted-foreground', icon: XCircle },
  MAINTENANCE: { label: 'Manutenção', cls: 'bg-warning/10 text-warning', icon: WrenchIcon },
  SOLD: { label: 'Vendido', cls: 'bg-destructive/10 text-destructive', icon: XCircle },
};

function StatusBadge({ status }: { status: VehicleStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.INACTIVE;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      <Icon className="h-3 w-3 mr-1" />{s.label}
    </span>
  );
}

function isFormValid(form: FormState) {
  return (
    form.brand.trim() &&
    form.model.trim() &&
    form.plate.trim().length >= 7 &&
    Number(form.year) >= 1950 &&
    Number(form.year) <= new Date().getFullYear() + 1
  );
}

// ── Hoisted form (module scope) — this is the fix for the focus bug ──────────
interface VehicleFormProps {
  form: FormState;
  onField: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  onCancel: () => void;
  submitLabel: string;
}

function VehicleForm({ form, onField, onSubmit, isPending, onCancel, submitLabel }: VehicleFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="brand">Marca</Label>
          <Input id="brand" name="brand" placeholder="Toyota" value={form.brand} onChange={onField} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model">Modelo</Label>
          <Input id="model" name="model" placeholder="Corolla" value={form.model} onChange={onField} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="plate">Placa</Label>
          <Input id="plate" name="plate" placeholder="ABC1D23" value={form.plate} onChange={onField} maxLength={8} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="year">Ano</Label>
          <Input id="year" name="year" type="number" placeholder={String(new Date().getFullYear())}
            value={form.year} onChange={onField} min={1950} max={new Date().getFullYear() + 1} required />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>Cancelar</Button>
        <Button type="submit" disabled={isPending || !isFormValid(form)}>
          {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</> : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function VehiclesManagement() {
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<ApiVehicle | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.vehicles.list,
    queryFn: () => vehiclesService.list(),
  });
  const vehicles = data?.vehicles ?? [];

  // Documentos (para os blocos de documentos de cada veículo).
  const docsQuery = useQuery({
    queryKey: queryKeys.documents.list,
    queryFn: () => documentsService.list(),
  });
  const documents = docsQuery.data?.documents ?? [];

  const { mutate: createVehicle, isPending: isCreating } = useMutation({
    mutationFn: () => vehiclesService.create({
      brand: form.brand.trim(), model: form.model.trim(),
      plate: form.plate.trim().toUpperCase(), year: Number(form.year),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success('Veículo cadastrado com sucesso!');
      setCreateOpen(false); setForm(EMPTY_FORM);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao cadastrar veículo.'),
  });

  const { mutate: updateVehicle, isPending: isUpdating } = useMutation({
    mutationFn: () => vehiclesService.update(editVehicle!.id, {
      brand: form.brand.trim(), model: form.model.trim(),
      plate: form.plate.trim().toUpperCase(), year: Number(form.year),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success('Veículo atualizado!');
      setEditVehicle(null); setForm(EMPTY_FORM);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atualizar veículo.'),
  });

  const { mutate: removeVehicle } = useMutation({
    mutationFn: (id: string) => vehiclesService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success('Veículo removido.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao remover veículo.'),
  });

  function openEdit(v: ApiVehicle) {
    setEditVehicle(v);
    setForm({ brand: v.brand, model: v.model, plate: v.plate, year: String(v.year) });
  }
  function closeEdit() { setEditVehicle(null); setForm(EMPTY_FORM); }

  function handleField(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }
  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid(form)) { toast.error('Preencha todos os campos corretamente.'); return; }
    createVehicle();
  }
  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid(form)) { toast.error('Preencha todos os campos corretamente.'); return; }
    updateVehicle();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /><span>Carregando veículos…</span>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Erro ao carregar veículos.</p>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all })}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meus veículos"
        subtitle="Gerencie seus veículos cadastrados"
        icon={<Car className="h-5 w-5" />}
        actions={
          <Dialog open={createOpen} onOpenChange={(v) => { if (!v) { setCreateOpen(false); setForm(EMPTY_FORM); } else setCreateOpen(true); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Novo veículo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar veículo</DialogTitle>
                <DialogDescription>Preencha os dados do veículo</DialogDescription>
              </DialogHeader>
              <VehicleForm form={form} onField={handleField} onSubmit={handleCreateSubmit}
                isPending={isCreating} onCancel={() => { setCreateOpen(false); setForm(EMPTY_FORM); }} submitLabel="Cadastrar" />
            </DialogContent>
          </Dialog>
        }
      />

      {/* Modal — Editar */}
      <Dialog open={!!editVehicle} onOpenChange={(v) => { if (!v) closeEdit(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar veículo</DialogTitle>
            <DialogDescription>Atualize os dados do veículo</DialogDescription>
          </DialogHeader>
          <VehicleForm form={form} onField={handleField} onSubmit={handleEditSubmit}
            isPending={isUpdating} onCancel={closeEdit} submitLabel="Salvar" />
        </DialogContent>
      </Dialog>

      {/* Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {vehicles.map((v) => (
          <Card key={v.id} className="shadow-card">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                    <Car className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{v.brand} {v.model}</CardTitle>
                    <CardDescription>{v.plate} · {v.year}</CardDescription>
                  </div>
                </div>
                <StatusBadge status={v.status} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(v)}>
                  <Pencil className="h-3 w-3 mr-1" />Editar
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:border-destructive/40">
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
                      <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => removeVehicle(v.id)}>
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {/* Documentos do veículo */}
              <VehicleDocuments vehicleId={v.id} documents={documents} />
            </CardContent>
          </Card>
        ))}
      </div>

      {vehicles.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Car className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Nenhum veículo cadastrado</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Cadastre seu veículo para começar a trabalhar na plataforma.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />Cadastrar veículo
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}