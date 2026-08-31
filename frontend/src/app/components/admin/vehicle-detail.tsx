// src/app/components/admin/vehicle-detail.tsx
//
// Detalhe do veículo (admin). Onde a ação acontece:
// - dados do veículo + estado
// - os 4 documentos obrigatórios (ver, aprovar, rejeitar com motivo opcional)
// - atribuição a um motorista (+ histórico)
// - controlo de ativação (forçar/remover exceção)

import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
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
  Car, ArrowLeft, Loader2, AlertCircle, CheckCircle, XCircle, Clock,
  Eye, UserPlus, UserMinus, Zap, ZapOff, FileText, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { usersService } from '@/features/admin/services/users.service';
import { documentsService } from '@/features/driver/services/documents.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { ApiDocument, DocumentStatus } from '@/shared/types/api';
import {
  VEHICLE_STATUS_LABELS, VEHICLE_STATUS_STYLES, VEHICLE_REQUIRED_DOCS,
} from '@/shared/lib/vehicle-labels';
import { DOCUMENT_TYPE_LABELS } from '@/shared/lib/document-labels';

function docStatusBadge(status: DocumentStatus) {
  const map: Record<DocumentStatus, { cls: string; label: string; Icon: typeof CheckCircle }> = {
    APPROVED: { cls: 'bg-green-100 text-green-700', label: 'Aprovado', Icon: CheckCircle },
    PENDING: { cls: 'bg-yellow-100 text-yellow-700', label: 'Pendente', Icon: Clock },
    REJECTED: { cls: 'bg-red-100 text-red-700', label: 'Rejeitado', Icon: XCircle },
    EXPIRED: { cls: 'bg-orange-100 text-orange-700', label: 'Expirado', Icon: Clock },
  };
  const { cls, label, Icon } = map[status];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}><Icon className="h-3 w-3" />{label}</span>;
}

// Abre o ficheiro via endpoint autenticado do backend (não expõe a URL do Cloudinary)
function viewDocument(id: string) {
  documentsService.openFile(id).catch((err: any) => toast.error(err?.message ?? 'Erro ao abrir o documento.'));
}

export function VehicleDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedDriver, setSelectedDriver] = useState('');

  // Dialog de rejeição de documento (motivo opcional)
  const [rejectDoc, setRejectDoc] = useState<ApiDocument | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const vehicleQ = useQuery({ queryKey: [...queryKeys.vehicles.all, id], queryFn: () => vehiclesService.getById(id), enabled: !!id });
  const usersQ = useQuery({ queryKey: queryKeys.users.allUnpaged, queryFn: () => usersService.listAll() });
  const docsQ = useQuery({ queryKey: queryKeys.documents.list, queryFn: () => documentsService.list() });
  const historyQ = useQuery({ queryKey: [...queryKeys.vehicles.all, id, 'history'], queryFn: () => vehiclesService.assignmentHistory(id), enabled: !!id });

  const vehicle = vehicleQ.data?.vehicle;
  const users = usersQ.data?.users ?? [];
  const drivers = users.filter((u) => u.role === 'DRIVER');
  const allDocs = docsQ.data?.documents ?? [];
  const history = historyQ.data?.history ?? [];

  const vehicleDocs = useMemo(
    () => allDocs.filter((d) => d.vehicleId === id),
    [allDocs, id],
  );

  const currentDriver = vehicle?.userId ? users.find((u) => u.id === vehicle.userId) : null;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
  };

  const { mutate: updateDocStatus, isPending: updatingDoc } = useMutation({
    mutationFn: ({ docId, status, notes }: { docId: string; status: DocumentStatus; notes?: string }) =>
      documentsService.updateStatus(docId, { status, notes }),
    onSuccess: (_, { status }) => {
      invalidateAll();
      toast.success(status === 'APPROVED' ? 'Documento aprovado.' : 'Documento rejeitado.');
      setRejectDoc(null);
      setRejectReason('');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atualizar documento.'),
  });

  const { mutate: assign, isPending: assigning } = useMutation({
    mutationFn: () => vehiclesService.assign(id, selectedDriver),
    onSuccess: () => { invalidateAll(); historyQ.refetch(); setSelectedDriver(''); toast.success('Veículo atribuído.'); },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atribuir.'),
  });

  const { mutate: unassign } = useMutation({
    mutationFn: () => vehiclesService.unassign(id),
    onSuccess: () => { invalidateAll(); historyQ.refetch(); toast.success('Veículo desatribuído.'); },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao desatribuir.'),
  });

  const { mutate: setForced } = useMutation({
    mutationFn: (forced: boolean) => vehiclesService.forceActivation(id, forced),
    onSuccess: () => { invalidateAll(); toast.success('Ativação atualizada.'); },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao alterar ativação.'),
  });

  if (vehicleQ.isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground gap-2"><Loader2 className="h-5 w-5 animate-spin" /><span>Carregando…</span></div>;
  }
  if (vehicleQ.isError || !vehicle) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Veículo não encontrado.</p>
        <Button variant="outline" onClick={() => navigate('/app/admin/fleet')}><ArrowLeft className="h-4 w-4 mr-2" />Voltar à lista</Button>
      </div>
    );
  }

  const statusCls = VEHICLE_STATUS_STYLES[vehicle.status] ?? VEHICLE_STATUS_STYLES.INACTIVE;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/app/admin/fleet')}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-14 w-14 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <Car className="h-7 w-7 text-accent" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{vehicle.brand} {vehicle.model}</h1>
          <p className="text-sm text-muted-foreground font-mono">{vehicle.plate} · {vehicle.year}{vehicle.vin ? ` · VIN ${vehicle.vin}` : ''}</p>
        </div>
        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${statusCls}`}>
          {VEHICLE_STATUS_LABELS[vehicle.status]}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Documentos — coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-5 w-5" />Documentos do veículo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {VEHICLE_REQUIRED_DOCS.map((type) => {
                const doc = vehicleDocs.find((d) => d.type === type);
                return (
                  <div key={type} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{DOCUMENT_TYPE_LABELS[type]}</p>
                      {doc ? docStatusBadge(doc.status) : <span className="text-xs text-muted-foreground">Não enviado</span>}
                    </div>
                    {doc && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => viewDocument(doc.id)}>
                          <Eye className="h-3 w-3 mr-1" />Ver
                        </Button>
                        {doc.status !== 'APPROVED' && (
                          <Button size="sm" variant="outline" className="text-green-700 hover:text-green-700 hover:border-green-300"
                            disabled={updatingDoc}
                            onClick={() => updateDocStatus({ docId: doc.id, status: 'APPROVED' })}>
                            <CheckCircle className="h-3 w-3" />
                          </Button>
                        )}
                        {doc.status !== 'REJECTED' && (
                          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive hover:border-destructive/40"
                            disabled={updatingDoc}
                            onClick={() => { setRejectDoc(doc); setRejectReason(''); }}>
                            <XCircle className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground pt-1">
                O veículo ativa automaticamente quando os 4 documentos estiverem aprovados. O motorista envia os documentos a partir da área dele.
              </p>
            </CardContent>
          </Card>

          {/* Histórico de atribuições */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><History className="h-5 w-5" />Histórico de atribuições</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem atribuições registadas.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-sm border-b last:border-0 py-2">
                      <span>{h.user?.name ?? 'Motorista removido'}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.startedAt).toLocaleDateString('pt-PT')}
                        {' → '}
                        {h.endedAt ? new Date(h.endedAt).toLocaleDateString('pt-PT') : <span className="text-green-700 font-medium">atual</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna lateral — atribuição e ativação */}
        <div className="space-y-6">
          {/* Atribuição */}
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Atribuição</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {currentDriver ? (
                <>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground">Motorista atual</p>
                    <p className="font-medium">{currentDriver.name}</p>
                  </div>
                  <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => unassign()}>
                    <UserMinus className="h-4 w-4 mr-2" />Desatribuir
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Veículo não atribuído.</p>
                  <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                    <SelectTrigger><SelectValue placeholder="Escolher motorista" /></SelectTrigger>
                    <SelectContent>
                      {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button className="w-full" disabled={!selectedDriver || assigning} onClick={() => assign()}>
                    {assigning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                    Atribuir
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Ativação */}
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Ativação</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {vehicle.activationForced ? (
                <>
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-amber-800 text-xs">
                    <Zap className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Ativação <strong>forçada</strong> pelo admin. O veículo mantém-se ativo mesmo sem todos os documentos aprovados.</span>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => setForced(false)}>
                    <ZapOff className="h-4 w-4 mr-2" />Remover exceção
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    O veículo segue a regra automática: ativa quando os 4 documentos são aprovados.
                  </p>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="w-full"><Zap className="h-4 w-4 mr-2" />Forçar ativação</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Forçar ativação?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O veículo ficará <strong>ativo</strong> mesmo sem todos os documentos aprovados. Use apenas como exceção — fica registado que foi uma ativação manual.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => setForced(true)}>Forçar ativação</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog de rejeição de documento (motivo opcional) */}
      <Dialog open={rejectDoc !== null} onOpenChange={(v) => { if (!v) { setRejectDoc(null); setRejectReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar documento</DialogTitle>
            <DialogDescription>
              {rejectDoc && (
                <>
                  <strong>{DOCUMENT_TYPE_LABELS[rejectDoc.type] ?? rejectDoc.type}</strong> deste veículo.
                  Se indicar um motivo, ele é enviado por email ao motorista.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Motivo (opcional) — ex: apólice ilegível, reenvie o PDF completo."
              className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none resize-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDoc(null); setRejectReason(''); }} disabled={updatingDoc}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectDoc && updateDocStatus({ docId: rejectDoc.id, status: 'REJECTED', notes: rejectReason.trim() || undefined })}
              disabled={updatingDoc}
            >
              {updatingDoc ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rejeitando…</> : <><XCircle className="h-4 w-4 mr-2" />Rejeitar documento</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}