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
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Car, Plus, Loader2, AlertCircle, Search, CheckCircle, Clock, XCircle,
  FileWarning, FileCheck, ChevronRight, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { usersService } from '@/features/admin/services/users.service';
import { documentsService } from '@/features/driver/services/documents.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { ApiVehicle, ApiDocument, VehicleStatus } from '@/shared/types/api';
import {
  VEHICLE_STATUS_LABELS, VEHICLE_STATUS_STYLES, summarizeVehicleDocs,
} from '@/shared/lib/vehicle-labels';

const EMPTY_FORM = { brand: '', model: '', plate: '', year: new Date().getFullYear(), vin: '' };

function StatusBadge({ status }: { status: VehicleStatus }) {
  const label = VEHICLE_STATUS_LABELS[status] ?? status;
  const cls = VEHICLE_STATUS_STYLES[status] ?? VEHICLE_STATUS_STYLES.INACTIVE;
  const Icon = status === 'ACTIVE' ? CheckCircle : status === 'PENDING' ? Clock : XCircle;
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

export function FleetManagement() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const vehiclesQ = useQuery({ queryKey: queryKeys.vehicles.list, queryFn: () => vehiclesService.list() });
  const usersQ    = useQuery({ queryKey: queryKeys.users.list,    queryFn: () => usersService.list() });
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

  const { mutate: createVehicle, isPending: creating } = useMutation({
    mutationFn: () => vehiclesService.create({
      brand: form.brand.trim(),
      model: form.model.trim(),
      plate: form.plate.trim().toUpperCase(),
      year: Number(form.year),
      vin: form.vin.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success('Veículo cadastrado! Nasce pendente até os documentos serem aprovados.');
      setOpen(false); setForm(EMPTY_FORM);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao cadastrar veículo.'),
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

  if (vehiclesQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /><span>Carregando veículos…</span>
      </div>
    );
  }
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
          <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setForm(EMPTY_FORM); } else setOpen(true); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Novo veículo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar veículo</DialogTitle>
                <DialogDescription>O veículo nasce pendente até os 4 documentos serem aprovados.</DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!form.brand || !form.model || !form.plate) { toast.error('Preencha marca, modelo e matrícula.'); return; }
                  createVehicle();
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
                <div className="space-y-2">
                  <Label>VIN (chassi) <span className="text-muted-foreground text-xs">— opcional</span></Label>
                  <Input placeholder="Número de chassi" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })} />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => { setOpen(false); setForm(EMPTY_FORM); }} disabled={creating}>Cancelar</Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</> : 'Cadastrar'}
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
        <Card className="shadow-card"><CardContent className="pt-5"><p className="text-sm text-muted-foreground mb-1">Ativos</p><p className="text-2xl font-bold text-green-600">{counts.active}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="pt-5"><p className="text-sm text-muted-foreground mb-1">Pendentes</p><p className="text-2xl font-bold text-amber-600">{counts.pending}</p></CardContent></Card>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-3 px-4 font-medium">Veículo</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                  <th className="py-3 px-4 font-medium">VIN e matrícula</th>
                  <th className="py-3 px-4 font-medium">Atribuição</th>
                  <th className="py-3 px-4 font-medium">Documentos</th>
                  <th className="py-3 px-4 font-medium w-10"></th>
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
                      <td className="py-4 px-4 text-muted-foreground">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
