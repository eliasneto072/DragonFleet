// src/app/components/admin/admin-documents.tsx
//
// Dashboard de documentos do admin:
// - Filtros: pesquisa por motorista, status, tipo e validade ("a expirar")
// - Cards de resumo clicáveis (atalho de filtro), incluindo Expirados e A expirar
// - Linhas limpas: apenas "Ver" + "Analisar"; ações ficam no dialog de análise
// - Rejeição com motivo escrito pelo admin (segue no email ao motorista)
// - "Ver" via endpoint autenticado do backend

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
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
import { queryKeys } from '@/shared/lib/query-keys';
import type { DocumentStatus, ApiDocument } from '@/shared/types/api';
import { DOCUMENT_TYPE_LABELS as DOC_TYPE_LABELS, daysUntil } from '@/shared/lib/document-labels';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStatusBadge(status: DocumentStatus) {
  switch (status) {
    case 'APPROVED': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Aprovado</Badge>;
    case 'PENDING': return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    case 'REJECTED': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>;
    case 'EXPIRED': return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100"><CalendarClock className="h-3 w-3 mr-1" />Expirado</Badge>;
    default: return null;
  }
}

// Abre o arquivo via endpoint autenticado do backend (não expõe a URL do Cloudinary)
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
      <span className="text-orange-600 font-medium inline-flex items-center gap-1 whitespace-nowrap">
        <CalendarClock className="h-3 w-3 shrink-0" />Expirou em {dateStr}
      </span>
    );
  }

  const urgente = dias !== null && dias <= 7;
  const atencao = dias !== null && dias <= 30;

  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${urgente ? 'text-orange-600 font-medium' : atencao ? 'text-amber-600' : 'text-muted-foreground'}`}>
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
  const [statusFilter, setStatusFilter] = useState<'all' | DocumentStatus>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expiryFilter, setExpiryFilter] = useState<'all' | '30' | '15' | '7'>('all');

  // Dialogs
  const [reviewDoc, setReviewDoc] = useState<ApiDocument | null>(null);
  const [rejectDoc, setRejectDoc] = useState<ApiDocument | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const docsQ = useQuery({ queryKey: queryKeys.documents.list, queryFn: () => documentsService.list() });
  const usersQ = useQuery({ queryKey: queryKeys.users.list, queryFn: () => usersService.list() });

  const isLoading = docsQ.isLoading || usersQ.isLoading;
  const isError = docsQ.isError || usersQ.isError;

  const { mutate: updateStatus, isPending: updating } = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: DocumentStatus; notes?: string }) =>
      documentsService.updateStatus(id, { status, notes }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      toast.success('Documento removido.');
      setReviewDoc(null);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao remover documento.'),
  });

  const documents = docsQ.data?.documents ?? [];
  const users = usersQ.data?.users ?? [];

  const getDriver = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return { name: u?.name ?? '—', email: u?.email ?? '' };
  };

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

  // Aplicação dos filtros
  const filtered = useMemo(() => {
    return documents.filter(doc => {
      const driver = getDriver(doc.userId);
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        driver.name.toLowerCase().includes(q) ||
        driver.email.toLowerCase().includes(q);

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

      return matchSearch && matchStatus && matchType && matchExpiry;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [documents, users, search, statusFilter, typeFilter, expiryFilter]);

  const hasActiveFilters =
    search !== '' || statusFilter !== 'all' || typeFilter !== 'all' || expiryFilter !== 'all';

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setExpiryFilter('all');
  }

  function handleRejectConfirm() {
    if (!rejectDoc) return;
    if (!rejectReason.trim()) {
      toast.error('Escreva o motivo da rejeição — ele será enviado ao motorista.');
      return;
    }
    updateStatus({ id: rejectDoc.id, status: 'REJECTED', notes: rejectReason.trim() });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /><span>Carregando documentos…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar documentos.</p>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  // Card de resumo clicável (atalho de filtro)
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Gestão de Documentos</h2>
        <p className="text-muted-foreground">Analise e valide os documentos enviados pelos motoristas</p>
      </div>

      {/* Cards de resumo — clicáveis como atalho de filtro */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Pendentes" value={counts.pending} colorCls="text-yellow-600"
          icon={<Clock className="h-4 w-4 text-yellow-600 shrink-0" />}
          active={statusFilter === 'PENDING' && expiryFilter === 'all'}
          onClick={() => { clearFilters(); setStatusFilter('PENDING'); }}
        />
        <StatCard
          label="Aprovados" value={counts.approved} colorCls="text-green-600"
          icon={<CheckCircle className="h-4 w-4 text-green-600 shrink-0" />}
          active={statusFilter === 'APPROVED' && expiryFilter === 'all'}
          onClick={() => { clearFilters(); setStatusFilter('APPROVED'); }}
        />
        <StatCard
          label="Rejeitados" value={counts.rejected} colorCls="text-red-600"
          icon={<XCircle className="h-4 w-4 text-red-600 shrink-0" />}
          active={statusFilter === 'REJECTED' && expiryFilter === 'all'}
          onClick={() => { clearFilters(); setStatusFilter('REJECTED'); }}
        />
        <StatCard
          label="Expirados" value={counts.expired} colorCls="text-orange-600"
          icon={<CalendarClock className="h-4 w-4 text-orange-600 shrink-0" />}
          active={statusFilter === 'EXPIRED' && expiryFilter === 'all'}
          onClick={() => { clearFilters(); setStatusFilter('EXPIRED'); }}
        />
        <StatCard
          label="A expirar (30d)" value={counts.expiringSoon} colorCls="text-amber-600"
          icon={<AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />}
          active={expiryFilter === '30'}
          onClick={() => { clearFilters(); setExpiryFilter('30'); }}
        />
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
            {hasActiveFilters ? ' (filtros ativos)' : ' no total'}
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
                            <p className="font-medium whitespace-nowrap">{driver.name}</p>
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
                          <p className="font-medium truncate">{driver.name}</p>
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
                        disabled={updating}
                        onClick={() => updateStatus({ id: reviewDoc.id, status: 'APPROVED' })}
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

      {/* Dialog de rejeição com motivo */}
      <Dialog open={rejectDoc !== null} onOpenChange={(v) => { if (!v) { setRejectDoc(null); setRejectReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar documento</DialogTitle>
            <DialogDescription>
              {rejectDoc && (
                <>
                  <strong>{DOC_TYPE_LABELS[rejectDoc.type] ?? rejectDoc.type}</strong> de{' '}
                  <strong>{getDriver(rejectDoc.userId).name}</strong>. O motivo será enviado por email ao motorista.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Ex: Documento ilegível — reenvie uma foto nítida da frente e do verso."
              className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none resize-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              Seja específico: o motorista verá exatamente este texto.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDoc(null); setRejectReason(''); }} disabled={updating}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRejectConfirm} disabled={updating || !rejectReason.trim()}>
              {updating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rejeitando…</> : <><XCircle className="h-4 w-4 mr-2" />Rejeitar documento</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}