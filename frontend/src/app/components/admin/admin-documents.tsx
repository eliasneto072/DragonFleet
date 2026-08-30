// src/app/components/admin/admin-documents.tsx
//
// Dashboard de documentos do admin:
// - Abas por categoria (Todos / Motorista / Veículo)
// - Cards de resumo clicáveis como TOGGLE de filtro (clicar de novo limpa)
// - Ordenação por urgência (ação necessária primeiro), não por data
// - Progresso de cadastro por motorista, sensível à aba ativa
// - Coluna de validade com destaque de urgência
// - "Ver" + "Analisar"; ações no dialog de análise; rejeição com motivo opcional
// - "Ver" via endpoint autenticado do backend

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/app/components/ui/alert-dialog';
import {
  FileText, CheckCircle, Clock, XCircle, Loader2, AlertCircle, Eye, Trash2,
  Search, CalendarClock, Car, ClipboardCheck, User,
} from 'lucide-react';
import { toast } from 'sonner';
import { documentsService } from '@/features/driver/services/documents.service';
import { usersService } from '@/features/admin/services/users.service';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { invalidateAfterDocument } from '@/shared/lib/invalidate';
import {
  DocumentValidityFields, EMPTY_VALIDITY, isValidityDecided, validityFromDocument,
  type ValidityValue,
} from './document-validity-fields';
import type { DocumentStatus, ApiDocument, DocumentType } from '@/shared/types/api';
import {
  DOCUMENT_TYPE_LABELS as DOC_TYPE_LABELS, daysUntil, VEHICLE_DOCUMENT_TYPES, DRIVER_DOCUMENT_TYPES,
} from '@/shared/lib/document-labels';

// ── Skeleton ──────────────────────────────────────────────────────────────────
//
// Espelha a estrutura real: quatro cartões de contagem, a barra de filtros e
// as linhas da tabela. Um placeholder genérico causaria um salto visível
// quando os dados chegam, que é o oposto do efeito pretendido.

function DocumentsSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" role="status" aria-busy="true">
      <span className="sr-only">A carregar documentos…</span>

      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4 sm:p-5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-7 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-9 min-w-[200px] flex-1" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6"><Skeleton className="h-5 w-44" /></CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-8 w-28 shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Categorias (derivadas do tipo — sem tocar no banco) ─────────────────────────

type Category = 'all' | 'driver' | 'vehicle';

function categoryOf(type: DocumentType): 'driver' | 'vehicle' {
  return VEHICLE_DOCUMENT_TYPES.includes(type) ? 'vehicle' : 'driver';
}

// Prioridade de exibição: o que precisa de ação vem primeiro.
// Rejeitado → A expirar (≤30d) → Pendente → Expirado → Aprovado.
function urgencyRank(doc: ApiDocument): number {
  if (doc.status === 'REJECTED') return 0;
  if (doc.status !== 'EXPIRED' && doc.expiresAt) {
    const dias = daysUntil(doc.expiresAt);
    if (dias !== null && dias >= 0 && dias <= 30) return 1; // a expirar
  }
  if (doc.status === 'PENDING') return 2;
  if (doc.status === 'EXPIRED') return 3;
  return 4; // aprovado (ou sem urgência)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStatusBadge(status: DocumentStatus) {
  switch (status) {
    // As variantes dark: são obrigatórias: bg-*-100 com text-*-800 não invertem
    // sozinhas e no modo escuro dariam texto escuro sobre fundo claro.
    case 'APPROVED': return <Badge className="bg-brand-50 text-brand-700 hover:bg-brand-50 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-950"><CheckCircle className="h-3 w-3 mr-1" />Aprovado</Badge>;
    case 'PENDING': return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-950"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    case 'REJECTED': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-950"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>;
    case 'EXPIRED': return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 dark:bg-orange-950 dark:text-orange-300 dark:hover:bg-orange-950"><CalendarClock className="h-3 w-3 mr-1" />Expirado</Badge>;
    default: return null;
  }
}

// Abre o ficheiro via endpoint autenticado do backend (não expõe a URL do Cloudinary)
function viewDocument(id: string) {
  documentsService.openFile(id).catch((err: any) =>
    toast.error(err?.message ?? 'Erro ao abrir o documento.'),
  );
}

function ValidityText({ doc }: { doc: ApiDocument }) {
  if (!doc.expiresAt) return <span className="text-muted-foreground">—</span>;

  const dias = daysUntil(doc.expiresAt);
  const dateStr = new Date(doc.expiresAt).toLocaleDateString('pt-PT');

  if (doc.status === 'EXPIRED' || (dias !== null && dias < 0)) {
    return (
      <span className="text-orange-600 dark:text-orange-400 font-medium inline-flex items-center gap-1 whitespace-nowrap">
        <CalendarClock className="h-3 w-3 shrink-0" />Expirou em {dateStr}
      </span>
    );
  }

  const urgente = dias !== null && dias <= 7;
  const atencao = dias !== null && dias <= 30;

  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${urgente ? 'text-orange-600 dark:text-orange-400 font-medium' : atencao ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
      <CalendarClock className="h-3 w-3 shrink-0" />
      {dateStr} ({dias} dia{dias === 1 ? '' : 's'})
    </span>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

export function AdminDocuments() {
  const queryClient = useQueryClient();

  // Filtros
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | DocumentStatus>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expiryFilter, setExpiryFilter] = useState<'all' | '30' | '15' | '7'>('all');

  // Dialogs
  const [reviewDoc, setReviewDoc] = useState<ApiDocument | null>(null);
  const [rejectDoc, setRejectDoc] = useState<ApiDocument | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const docsQ = useQuery({ queryKey: queryKeys.documents.list, queryFn: () => documentsService.list() });
  const usersQ = useQuery({ queryKey: queryKeys.users.allUnpaged, queryFn: () => usersService.listAll() });
  const vehiclesQ = useQuery({ queryKey: queryKeys.vehicles.list, queryFn: () => vehiclesService.list() });

  const isLoading = docsQ.isLoading || usersQ.isLoading || vehiclesQ.isLoading;
  const isError = docsQ.isError || usersQ.isError || vehiclesQ.isError;

  // Validade do documento em revisão. Reposta sempre que o diálogo abre noutro
  // documento — senão as datas do anterior ficariam no formulário.
  const [validity, setValidity] = useState<ValidityValue>(EMPTY_VALIDITY);

  useEffect(() => {
    setValidity(reviewDoc ? validityFromDocument(reviewDoc) : EMPTY_VALIDITY);
  }, [reviewDoc?.id]);

  const { mutate: updateStatus, isPending: updating } = useMutation({
    mutationFn: ({ id, status, notes, dates }: {
      id: string;
      status: DocumentStatus;
      notes?: string;
      dates?: { issuedAt: string | null; expiresAt: string | null };
    }) => documentsService.updateStatus(id, { status, notes, ...dates }),
    onSuccess: (_, { status }) => {
      // Aprovar reavalia o estado do veículo no servidor e pode desbloquear o
      // motorista; invalidar só `documents` deixava as outras telas com o
      // estado antigo até alguém recarregar.
      invalidateAfterDocument(queryClient);
      toast.success(status === 'APPROVED' ? 'Documento aprovado!' : 'Documento rejeitado.');
      setRejectDoc(null);
      setRejectReason('');
      setReviewDoc(null);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao processar documento.'),
  });

  const { mutate: removeDocument, isPending: removing } = useMutation({
    mutationFn: (id: string) => documentsService.remove(id),
    onSuccess: () => {
      invalidateAfterDocument(queryClient);
      toast.success('Documento removido.');
      setReviewDoc(null);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao remover documento.'),
  });

  const documents = docsQ.data?.documents ?? [];
  const users = usersQ.data?.users ?? [];
  const vehicles = vehiclesQ.data?.vehicles ?? [];

  const getDriver = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return { name: u?.name ?? '—', email: u?.email ?? '' };
  };

  // Nº de veículos por motorista (para compor o denominador do progresso).
  const vehicleCountByUser = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of vehicles) {
      if (v.userId) map[v.userId] = (map[v.userId] ?? 0) + 1;
    }
    return map;
  }, [vehicles]);

  // Progresso de cadastro por motorista, sensível à aba (categoria) selecionada:
  // - "all"     → aprovados (pessoais + veículo) / total exigido (5 + 4×veículos)
  // - "driver"  → aprovados pessoais / 5
  // - "vehicle" → aprovados de veículo / (4 × nº de veículos do motorista)
  const driverProgress = useMemo(() => {
    const personalRequired = DRIVER_DOCUMENT_TYPES.length;   // 5
    const perVehicleRequired = VEHICLE_DOCUMENT_TYPES.length; // 4

    const map: Record<string, { approved: number; total: number }> = {};

    const ensure = (userId: string) => {
      if (!map[userId]) {
        const numVehicles = vehicleCountByUser[userId] ?? 0;
        let total: number;
        if (category === 'driver') {
          total = personalRequired;
        } else if (category === 'vehicle') {
          total = perVehicleRequired * numVehicles;
        } else {
          total = personalRequired + perVehicleRequired * numVehicles;
        }
        map[userId] = { approved: 0, total };
      }
      return map[userId];
    };

    for (const d of documents) {
      const isPersonalRequired = !d.vehicleId && DRIVER_DOCUMENT_TYPES.includes(d.type);
      const isVehicleRequired = !!d.vehicleId && VEHICLE_DOCUMENT_TYPES.includes(d.type);

      // Filtra o que conta conforme a aba:
      if (category === 'driver' && !isPersonalRequired) continue;
      if (category === 'vehicle' && !isVehicleRequired) continue;
      if (category === 'all' && !isPersonalRequired && !isVehicleRequired) continue;

      const p = ensure(d.userId);
      if (d.status === 'APPROVED') p.approved += 1;
    }

    return map;
  }, [documents, vehicleCountByUser, category]);

  // Contagens (sobre o total, independente dos filtros)
  const counts = useMemo(() => {
    const expiringSoon = documents.filter(d => {
      if (!d.expiresAt || d.status === 'EXPIRED') return false;
      const dias = daysUntil(d.expiresAt);
      return dias !== null && dias >= 0 && dias <= 30;
    });
    return {
      pending: documents.filter(d => d.status === 'PENDING').length,
      approved: documents.filter(d => d.status === 'APPROVED').length,
      rejected: documents.filter(d => d.status === 'REJECTED').length,
      expired: documents.filter(d => d.status === 'EXPIRED').length,
      expiringSoon: expiringSoon.length,
    };
  }, [documents]);

  // Contagem por categoria (para os badges das abas)
  const categoryCounts = useMemo(() => ({
    all: documents.length,
    driver: documents.filter(d => categoryOf(d.type) === 'driver').length,
    vehicle: documents.filter(d => categoryOf(d.type) === 'vehicle').length,
  }), [documents]);

  // Aplicação dos filtros + ordenação por urgência
  const filtered = useMemo(() => {
    return documents.filter(doc => {
      const driver = getDriver(doc.userId);
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        driver.name.toLowerCase().includes(q) ||
        driver.email.toLowerCase().includes(q);

      const matchCategory = category === 'all' || categoryOf(doc.type) === category;
      const matchStatus = statusFilter === 'all' || doc.status === statusFilter;
      const matchType = typeFilter === 'all' || doc.type === typeFilter;

      let matchExpiry = true;
      if (expiryFilter !== 'all') {
        const limit = Number(expiryFilter);
        const dias = doc.expiresAt ? daysUntil(doc.expiresAt) : null;
        matchExpiry =
          doc.status !== 'EXPIRED' &&
          dias !== null && dias >= 0 && dias <= limit;
      }

      return matchSearch && matchCategory && matchStatus && matchType && matchExpiry;
    }).sort((a, b) => {
      // 1º por urgência; empate → mais recente primeiro
      const ra = urgencyRank(a);
      const rb = urgencyRank(b);
      if (ra !== rb) return ra - rb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [documents, users, search, category, statusFilter, typeFilter, expiryFilter]);

  const hasActiveFilters =
    search !== '' || category !== 'all' || statusFilter !== 'all' || typeFilter !== 'all' || expiryFilter !== 'all';

  function clearFilters() {
    setSearch('');
    setCategory('all');
    setStatusFilter('all');
    setTypeFilter('all');
    setExpiryFilter('all');
  }

  // Toggle de filtro por status via card: clicar no card ativo limpa; senão aplica.
  function toggleStatusFilter(status: DocumentStatus) {
    if (statusFilter === status && expiryFilter === 'all') {
      setStatusFilter('all');
    } else {
      setStatusFilter(status);
      setExpiryFilter('all');
    }
  }

  function toggleExpiryFilter() {
    if (expiryFilter === '30') {
      setExpiryFilter('all');
    } else {
      setExpiryFilter('30');
      setStatusFilter('all');
    }
  }

  function handleRejectConfirm() {
    if (!rejectDoc) return;
    // Motivo opcional: se vazio, rejeita sem motivo (email omite a razão).
    updateStatus({ id: rejectDoc.id, status: 'REJECTED', notes: rejectReason.trim() || undefined });
  }

  if (isLoading) {
    return <DocumentsSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Erro ao carregar documentos.</p>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  // Card de resumo clicável (toggle de filtro)
  function StatCard({
    label, value, colorCls, icon, active, onClick,
  }: {
    label: string; value: number; colorCls: string; icon: React.ReactNode; active: boolean; onClick: () => void;
  }) {
    return (
      <Card
        onClick={onClick}
        className={`cursor-pointer transition-colors ${active ? 'border-primary ring-1 ring-primary/30' : 'hover:border-primary/40'}`}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs sm:text-sm font-medium">{label}</CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${colorCls}`}>{value}</div>
        </CardContent>
      </Card>
    );
  }

  // Indicador de progresso do motorista, conforme a aba ativa
  function DriverProgress({ userId }: { userId: string }) {
    const p = driverProgress[userId];
    if (!p || p.total === 0) return null;
    const complete = p.approved === p.total;
    const scopeLabel =
      category === 'driver' ? 'pessoais'
      : category === 'vehicle' ? 'de veículo'
      : 'pessoais + veículo';
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${complete ? 'bg-brand-50 text-brand-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-secondary text-muted-foreground'}`}
        title={`${p.approved} de ${p.total} documentos ${scopeLabel} aprovados`}
      >
        {complete && <CheckCircle className="h-3 w-3" />}
        {p.approved}/{p.total}
      </span>
    );
  }

  // Aba de categoria
  function CategoryTab({ value, label }: { value: Category; label: string }) {
    const active = category === value;
    const count = categoryCounts[value];
    return (
      <button
        onClick={() => setCategory(value)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/70'}`}
      >
        {label}
        <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-primary-foreground/20' : 'bg-background/60'}`}>{count}</span>
      </button>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Documentos"
        subtitle="Analise e valide os documentos enviados pelos motoristas"
        icon={<FileText className="h-5 w-5" />}
      />

      {/* Cards de resumo — toggles de filtro */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Pendentes" value={counts.pending} colorCls="text-amber-600 dark:text-amber-400"
          icon={<Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />}
          active={statusFilter === 'PENDING' && expiryFilter === 'all'}
          onClick={() => toggleStatusFilter('PENDING')}
        />
        <StatCard
          label="Aprovados" value={counts.approved} colorCls="text-success"
          icon={<CheckCircle className="h-4 w-4 text-success shrink-0" />}
          active={statusFilter === 'APPROVED' && expiryFilter === 'all'}
          onClick={() => toggleStatusFilter('APPROVED')}
        />
        <StatCard
          label="Rejeitados" value={counts.rejected} colorCls="text-destructive"
          icon={<XCircle className="h-4 w-4 text-destructive shrink-0" />}
          active={statusFilter === 'REJECTED' && expiryFilter === 'all'}
          onClick={() => toggleStatusFilter('REJECTED')}
        />
        <StatCard
          label="Expirados" value={counts.expired} colorCls="text-orange-600 dark:text-orange-400"
          icon={<CalendarClock className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />}
          active={statusFilter === 'EXPIRED' && expiryFilter === 'all'}
          onClick={() => toggleStatusFilter('EXPIRED')}
        />
        <StatCard
          label="A expirar (30d)" value={counts.expiringSoon} colorCls="text-amber-600"
          icon={<AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />}
          active={expiryFilter === '30'}
          onClick={toggleExpiryFilter}
        />
      </div>

      {/* Abas por categoria */}
      <div className="flex gap-2 flex-wrap">
        <CategoryTab value="all" label="Todos" />
        <CategoryTab value="driver" label="Motorista" />
        <CategoryTab value="vehicle" label="Veículo" />
      </div>

      {/* Barra de filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por motorista (nome ou email)…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | DocumentStatus)}>
              <SelectTrigger className="w-full lg:w-[170px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="PENDING">Pendentes</SelectItem>
                <SelectItem value="APPROVED">Aprovados</SelectItem>
                <SelectItem value="REJECTED">Rejeitados</SelectItem>
                <SelectItem value="EXPIRED">Expirados</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full lg:w-[230px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={expiryFilter} onValueChange={(v) => setExpiryFilter(v as 'all' | '30' | '15' | '7')}>
              <SelectTrigger className="w-full lg:w-[190px]"><SelectValue placeholder="Validade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer validade</SelectItem>
                <SelectItem value="30">A expirar em 30 dias</SelectItem>
                <SelectItem value="15">A expirar em 15 dias</SelectItem>
                <SelectItem value="7">A expirar em 7 dias</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters} className="lg:w-auto">
                Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista filtrada */}
      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
          <CardDescription>
            {filtered.length} de {documents.length}
            {hasActiveFilters ? ' (filtros ativos)' : ' no total'} · ordenados por urgência
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {hasActiveFilters ? 'Nenhum documento corresponde aos filtros.' : 'Nenhum documento enviado ainda.'}
            </p>
          ) : (
            <>
              {/* Tabela — desktop */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motorista</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Validade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(doc => {
                      const driver = getDriver(doc.userId);
                      return (
                        <TableRow key={doc.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <p className="font-medium whitespace-nowrap">{driver.name}</p>
                              <DriverProgress userId={doc.userId} />
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-nowrap">{driver.email}</p>
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5 whitespace-nowrap">
                              {doc.vehicleId
                                ? <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                : <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                              {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                            </span>
                            <span className="block text-xs text-muted-foreground mt-0.5">
                              Enviado {new Date(doc.createdAt).toLocaleDateString('pt-PT')}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs"><ValidityText doc={doc} /></TableCell>
                          <TableCell>{getStatusBadge(doc.status)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => viewDocument(doc.id)} title="Ver ficheiro">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant={doc.status === 'PENDING' ? 'default' : 'outline'}
                                onClick={() => setReviewDoc(doc)}
                              >
                                <ClipboardCheck className="h-3.5 w-3.5 mr-1" />Analisar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Cards — mobile */}
              <div className="md:hidden space-y-3">
                {filtered.map(doc => {
                  const driver = getDriver(doc.userId);
                  return (
                    <div key={doc.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{driver.name}</p>
                            <DriverProgress userId={doc.userId} />
                          </div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {doc.vehicleId ? <Car className="h-3 w-3 shrink-0" /> : <User className="h-3 w-3 shrink-0" />}
                            {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                          </p>
                          <p className="text-xs mt-1"><ValidityText doc={doc} /></p>
                        </div>
                        <div className="shrink-0">{getStatusBadge(doc.status)}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => viewDocument(doc.id)}>
                          <Eye className="h-3 w-3 mr-1" />Ver
                        </Button>
                        <Button
                          size="sm"
                          variant={doc.status === 'PENDING' ? 'default' : 'outline'}
                          className="flex-1"
                          onClick={() => setReviewDoc(doc)}
                        >
                          <ClipboardCheck className="h-3 w-3 mr-1" />Analisar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog de análise — todas as ações num só lugar */}
      <Dialog open={reviewDoc !== null} onOpenChange={(v) => { if (!v) setReviewDoc(null); }}>
        <DialogContent className="max-w-lg">
          {reviewDoc && (() => {
            const driver = getDriver(reviewDoc.userId);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    {DOC_TYPE_LABELS[reviewDoc.type] ?? reviewDoc.type}
                  </DialogTitle>
                  <DialogDescription>
                    {reviewDoc.vehicleId ? 'Documento de veículo' : 'Documento pessoal'} · {driver.name}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-1">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Motorista</p>
                      <p className="font-medium">{driver.name}</p>
                      <p className="text-xs text-muted-foreground break-all">{driver.email}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <div className="mt-0.5">{getStatusBadge(reviewDoc.status)}</div>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Enviado em</p>
                      <p className="font-medium">{new Date(reviewDoc.createdAt).toLocaleDateString('pt-PT')}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Validade</p>
                      <p className="font-medium text-xs mt-1"><ValidityText doc={reviewDoc} /></p>
                    </div>
                  </div>

                  {reviewDoc.notes && reviewDoc.notes.replace('[avisado-7d]', '').trim() && (
                    <div className="rounded-lg bg-muted/50 border p-3 text-sm">
                      <p className="text-xs text-muted-foreground mb-1">Notas / motivo anterior</p>
                      <p>{reviewDoc.notes.replace('[avisado-7d]', '').trim()}</p>
                    </div>
                  )}

                  <Button variant="outline" className="w-full" onClick={() => viewDocument(reviewDoc.id)}>
                    <Eye className="h-4 w-4 mr-2" />Ver ficheiro
                  </Button>

                  {/* Logo abaixo de "Ver ficheiro", de propósito: as datas são
                      lidas do documento, e é essa a sequência do trabalho. */}
                  {reviewDoc.status !== 'REJECTED' && (
                    <DocumentValidityFields value={validity} onChange={setValidity} />
                  )}
                </div>

                <DialogFooter className="mt-2 flex-col sm:flex-row gap-2 sm:justify-between">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        disabled={removing}
                        className="text-destructive hover:text-destructive sm:mr-auto"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />Apagar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apagar documento?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O documento <strong>{DOC_TYPE_LABELS[reviewDoc.type] ?? reviewDoc.type}</strong> de{' '}
                          <strong>{driver.name}</strong> será removido permanentemente. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/90"
                          onClick={() => removeDocument(reviewDoc.id)}
                        >
                          Apagar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <div className="flex gap-2 w-full sm:w-auto">
                    {reviewDoc.status !== 'REJECTED' && (
                      <Button
                        variant="destructive"
                        className="flex-1 sm:flex-none"
                        disabled={updating}
                        onClick={() => { setRejectDoc(reviewDoc); setRejectReason(''); }}
                      >
                        <XCircle className="h-4 w-4 mr-2" />Rejeitar
                      </Button>
                    )}
                    {reviewDoc.status !== 'APPROVED' && (
                      <Button
                        className="flex-1 sm:flex-none"
                        // Aprovar sem decidir a validade deixaria o documento
                        // para sempre sem avisar ninguém. "Não expira" é uma
                        // decisão válida; ausência de decisão não é.
                        disabled={updating || !isValidityDecided(validity)}
                        title={
                          isValidityDecided(validity)
                            ? undefined
                            : 'Indique a validade ou marque como sem validade'
                        }
                        onClick={() =>
                          updateStatus({
                            id: reviewDoc.id,
                            status: 'APPROVED',
                            dates: {
                              issuedAt: validity.issuedAt,
                              expiresAt: validity.neverExpires ? null : validity.expiresAt,
                            },
                          })
                        }
                      >
                        {updating
                          ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          : <CheckCircle className="h-4 w-4 mr-2" />}
                        Aprovar
                      </Button>
                    )}
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog de rejeição com motivo (opcional) */}
      <Dialog open={rejectDoc !== null} onOpenChange={(v) => { if (!v) { setRejectDoc(null); setRejectReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar documento</DialogTitle>
            <DialogDescription>
              {rejectDoc && (
                <>
                  <strong>{DOC_TYPE_LABELS[rejectDoc.type] ?? rejectDoc.type}</strong> de{' '}
                  <strong>{getDriver(rejectDoc.userId).name}</strong>. Se indicar um motivo, ele é enviado por email ao motorista.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Motivo (opcional) — ex: documento ilegível, reenvie uma foto nítida da frente e do verso."
              className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none resize-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDoc(null); setRejectReason(''); }} disabled={updating}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRejectConfirm} disabled={updating}>
              {updating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rejeitando…</> : <><XCircle className="h-4 w-4 mr-2" />Rejeitar documento</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}