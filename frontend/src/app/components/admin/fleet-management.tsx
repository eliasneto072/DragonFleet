// src/app/components/admin/fleet-management.tsx
//
// Lista de veículos (admin). Inspirada na referência da Uber:
// coluna de estado (com PENDING), VIN + matrícula, atribuição (motorista atual)
// e um badge de documentos com contagem/cor. Filtro, pesquisa e navegação para
// o detalhe do veículo.

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Car, Plus, Loader2, AlertCircle, Search,
  FileWarning, FileCheck, ChevronRight, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { usersService } from '@/features/admin/services/users.service';
import { documentsService } from '@/features/driver/services/documents.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import type { ApiVehicle, ApiDocument, VehicleStatus } from '@/shared/types/api';
import {
  VEHICLE_STATUS_LABELS, VEHICLE_STATUS_STYLES, summarizeVehicleDocs,
} from '@/shared/lib/vehicle-labels';

const EMPTY_FORM = {
  brand: '', model: '', plate: '', year: new Date().getFullYear(), vin: '', weeklyFee: '',
};

function StatusBadge({ status }: { status: VehicleStatus }) {
  const label = VEHICLE_STATUS_LABELS[status] ?? status;
  const cls = VEHICLE_STATUS_STYLES[status] ?? VEHICLE_STATUS_STYLES.INACTIVE;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === 'ACTIVE' ? 'bg-green-600' : status === 'PENDING' ? 'bg-amber-600' : 'bg-gray-400'}`} />
      {label}
    </span>
  );
}

function DocsBadge({ docs }: { docs: ApiDocument[] }) {
  const s = summarizeVehicleDocs(docs);
  if (s.allApproved) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <FileCheck className="h-4 w-4" />{s.total}/{s.total}
      </span>
    );
  }
  const color = s.hasProblem ? 'text-destructive' : 'text-amber-600';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <FileWarning className="h-4 w-4" />{s.approved}/{s.total}
    </span>
  );
}

// Espelha a estrutura real: cabeçalho, quatro contadores, filtros e linhas.
// Um placeholder genérico causaria salto de layout quando os dados chegam.
function FleetSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" role="status" aria-busy="true">
      <span className="sr-only">A carregar a frota…</span>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-52" />
          </div>
        </div>
        <Skeleton className="h-9 w-full sm:w-36" />
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
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function FleetManagement() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const vehiclesQ = useQuery({ queryKey: queryKeys.vehicles.list, queryFn: () => vehiclesService.list() });
  const usersQ    = useQuery({ queryKey: queryKeys.users.allUnpaged,    queryFn: () => usersService.listAll() });
  const docsQ     = useQuery({ queryKey: queryKeys.documents.list, queryFn: () => documentsService.list() });

  const vehicles = vehiclesQ.data?.vehicles ?? [];
  const users    = usersQ.data?.users ?? [];
  const docs     = docsQ.data?.documents ?? [];

  // Documentos agrupados por veículo (para o badge)
  const docsByVehicle = useMemo(() => {
    const map = new Map<string, ApiDocument[]>();
    for (const d of docs) {
      if (!d.vehicleId) continue;
      const arr = map.get(d.vehicleId) ?? [];
      arr.push(d);
      map.set(d.vehicleId, arr);
    }
    return map;
  }, [docs]);

  const userName = (userId: string | null) => {
    if (!userId) return null;
    return users.find((u) => u.id === userId)?.name ?? null;
  };

  // Id do veículo em edição; null cria um novo. O mesmo formulário serve os
  // dois casos — sem edição, os veículos já registados nunca receberiam o
  // encargo semanal.
  const [editingId, setEditingId] = useState<string | null>(null);

  function openEdit(v: ApiVehicle) {
    setEditingId(v.id);
    setForm({
      brand: v.brand,
      model: v.model,
      plate: v.plate,
      year: v.year,
      vin: v.vin ?? '',
      weeklyFee: v.weeklyFee ? String(v.weeklyFee) : '',
    });
    setOpen(true);
  }

  function closeForm() {
    setOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  const { mutate: saveVehicle, isPending: creating } = useMutation({
    mutationFn: () => {
      const payload = {
        brand: form.brand.trim(),
        model: form.model.trim(),
        plate: form.plate.trim().toUpperCase(),
        year: Number(form.year),
        vin: form.vin.trim() || undefined,
        weeklyFee: form.weeklyFee.trim() === '' ? 0 : Number(form.weeklyFee),
      };
      return editingId
        ? vehiclesService.update(editingId, payload)
        : vehiclesService.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success(
        editingId
          ? 'Veículo atualizado.'
          : 'Veículo cadastrado! Nasce pendente até os documentos serem aprovados.',
      );
      closeForm();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao guardar o veículo.'),
  });

  const filtered = useMemo(() => {
    return vehicles.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${v.brand} ${v.model} ${v.plate} ${v.vin ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vehicles, statusFilter, search]);

  const counts = {
    total: vehicles.length,
    active: vehicles.filter((v) => v.status === 'ACTIVE').length,
    pending: vehicles.filter((v) => v.status === 'PENDING').length,
    unassigned: vehicles.filter((v) => !v.userId).length,
  };

  if (vehiclesQ.isLoading) return <FleetSkeleton />;
  if (vehiclesQ.isError) {
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
        title="Veículos"
        subtitle="Gerir a frota, documentos e atribuições"
        icon={<Car className="h-5 w-5" />}
        actions={
          <Dialog open={open} onOpenChange={(v) => { if (!v) closeForm(); else setOpen(true); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Novo veículo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Editar veículo' : 'Cadastrar veículo'}</DialogTitle>
                <DialogDescription>O veículo nasce pendente até os 4 documentos serem aprovados.</DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!form.brand || !form.model || !form.plate) { toast.error('Preencha marca, modelo e matrícula.'); return; }
                  saveVehicle();
                }}
                className="space-y-4 mt-2"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Marca</Label>
                    <Input placeholder="Renault" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Modelo</Label>
                    <Input placeholder="Clio" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Matrícula</Label>
                    <Input placeholder="AA-00-BB" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Ano</Label>
                    <Input type="number" value={form.year} min={1950} max={new Date().getFullYear() + 1} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>VIN (chassi) <span className="text-muted-foreground text-xs">— opcional</span></Label>
                    <Input placeholder="Número de chassi" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Encargo semanal</Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">€</span>
                      <Input
                        type="number" step="0.01" min="0" inputMode="decimal"
                        placeholder="0,00" className="pl-7 tabular-nums"
                        value={form.weeklyFee}
                        onChange={(e) => setForm({ ...form, weeklyFee: e.target.value })}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Preenche o campo &quot;Viatura&quot; no fecho semanal, onde continua editável.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={closeForm} disabled={creating}>Cancelar</Button>
                  <Button type="submit" disabled={creating}>
                    {creating
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />A guardar…</>
                      : editingId ? 'Guardar' : 'Cadastrar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="pt-5"><p className="text-sm text-muted-foreground mb-1">Total</p><p className="text-2xl font-bold">{counts.total}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="pt-5"><p className="text-sm text-muted-foreground mb-1">Ativos</p><p className="text-2xl font-bold text-success">{counts.active}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="pt-5"><p className="text-sm text-muted-foreground mb-1">Pendentes</p><p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{counts.pending}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="pt-5"><p className="text-sm text-muted-foreground mb-1">Não atribuídos</p><p className="text-2xl font-bold text-muted-foreground">{counts.unassigned}</p></CardContent></Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Pesquisar por marca, modelo, matrícula ou VIN…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="ACTIVE">Ativos</SelectItem>
            <SelectItem value="PENDING">Pendentes</SelectItem>
            <SelectItem value="INACTIVE">Inativos</SelectItem>
            <SelectItem value="MAINTENANCE">Manutenção</SelectItem>
            <SelectItem value="SOLD">Vendidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          {/* Sete colunas não cabem num telemóvel. A partir de md a tabela
              serve; abaixo, cada veículo vira um cartão. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-3 px-4 font-medium">Veículo</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                  <th className="py-3 px-4 font-medium">VIN e matrícula</th>
                  <th className="py-3 px-4 font-medium">Atribuição</th>
                  <th className="py-3 px-4 font-medium">Documentos</th>
                  <th className="py-3 px-4 font-medium">Encargo</th>
                  <th className="py-3 px-4 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v: ApiVehicle) => {
                  const driver = userName(v.userId);
                  return (
                    <tr
                      key={v.id}
                      className="border-b last:border-0 hover:bg-secondary/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/app/admin/fleet/${v.id}`)}
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                            <Car className="h-4 w-4 text-accent" />
                          </div>
                          <div>
                            <p className="font-medium">{v.brand} {v.model}</p>
                            <p className="text-xs text-muted-foreground">{v.year}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4"><StatusBadge status={v.status} /></td>
                      <td className="py-4 px-4">
                        <p className="font-mono text-xs">{v.vin ?? '—'}</p>
                        <p className="font-mono text-xs text-muted-foreground">{v.plate}</p>
                      </td>
                      <td className="py-4 px-4">
                        {driver ? (
                          <span className="text-sm">{driver}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Não atribuído</span>
                        )}
                      </td>
                      <td className="py-4 px-4"><DocsBadge docs={docsByVehicle.get(v.id) ?? []} /></td>
                      <td className="py-4 px-4">
                        {v.weeklyFee > 0 ? (
                          <span className="text-sm tabular-nums">
                            {formatCurrency(v.weeklyFee)}
                            <span className="text-xs text-muted-foreground"> /semana</span>
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {/* stopPropagation: a linha inteira navega para o
                            detalhe, e sem isto editar abriria as duas coisas. */}
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Button
                            variant="ghost" size="sm" className="h-8 w-8 p-0"
                            aria-label={`Editar ${v.brand} ${v.model}`}
                            onClick={(e) => { e.stopPropagation(); openEdit(v); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cartões — telemóvel */}
          <div className="divide-y md:hidden">
            {filtered.map((v: ApiVehicle) => {
              const driver = userName(v.userId);
              return (
                <div
                  key={v.id}
                  className="flex items-start gap-3 p-4 transition-colors hover:bg-secondary/40"
                  onClick={() => navigate(`/app/admin/fleet/${v.id}`)}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-emerald-950">
                    <Car className="h-4 w-4 text-accent dark:text-emerald-300" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{v.brand} {v.model}</p>
                      <StatusBadge status={v.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      <span className="font-mono tracking-tight">{v.plate}</span> · {v.year}
                      {v.weeklyFee > 0 && <> · {formatCurrency(v.weeklyFee)}/semana</>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {driver ?? 'Não atribuído'}
                    </p>
                    <div className="mt-2">
                      <DocsBadge docs={docsByVehicle.get(v.id) ?? []} />
                    </div>
                  </div>

                  <Button
                    variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0"
                    aria-label={`Editar ${v.brand} ${v.model}`}
                    onClick={(e) => { e.stopPropagation(); openEdit(v); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <Car className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="font-semibold mb-1">Nenhum veículo encontrado</p>
              <p className="text-sm text-muted-foreground">
                {vehicles.length === 0 ? 'Cadastre o primeiro veículo da frota.' : 'Ajuste os filtros de pesquisa.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
