// src/features/admin/pages/DriverDetailPage.tsx
//
// Página de detalhe do motorista (admin):
// - Dados e status do motorista, com ações de ativar/desativar/bloquear
// - Saldo: resumo + adicionar/retirar dinheiro (CREDIT/DEBIT) + extrato auditado
// - Documentos separados em Pessoais e De veículo (agrupados por veículo),
//   cada seção com barra de progresso enviados/exigidos

import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  ArrowLeft, Loader2, AlertCircle, UserCheck, UserX, Ban, Mail, Wallet,
  Plus, Minus, TrendingUp, Clock, ArrowDownCircle,
  CheckCircle, XCircle, Eye, CalendarClock, History, User, Car,
} from 'lucide-react';
import { toast } from 'sonner';
import { usersService } from '@/features/admin/services/users.service';
import { balanceService, type AdjustmentType } from '@/features/admin/services/balance.service';
import { documentsService } from '@/features/driver/services/documents.service';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { DriverWithdrawalsCard } from '@/app/components/admin/driver-withdrawals-card';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatDate } from '@/shared/lib/format';
import type { UserStatus, DocumentStatus, ApiDocument } from '@/shared/types/api';
import {
  DOCUMENT_TYPE_LABELS as DOC_TYPE_LABELS, daysUntil,
  DRIVER_DOCUMENT_TYPES, VEHICLE_DOCUMENT_TYPES,
} from '@/shared/lib/document-labels';

// ── Helpers ───────────────────────────────────────────────────────────────────

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n);

const STATUS_STYLES: Record<UserStatus, { label: string; cls: string }> = {
  ACTIVE: { label: 'Ativo', cls: 'bg-green-100 text-green-800' },
  INACTIVE: { label: 'Inativo', cls: 'bg-secondary text-muted-foreground' },
  BLOCKED: { label: 'Bloqueado', cls: 'bg-destructive/10 text-destructive' },
  AGUARDANDO_REGULARIZACAO: { label: 'Aguardando regularização', cls: 'bg-amber-100 text-amber-700' },
};

function StatusPill({ status }: { status: UserStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.INACTIVE;
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

function docStatusBadge(status: DocumentStatus) {
  switch (status) {
    case 'APPROVED': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Aprovado</Badge>;
    case 'PENDING': return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    case 'REJECTED': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>;
    case 'EXPIRED': return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100"><CalendarClock className="h-3 w-3 mr-1" />Expirado</Badge>;
    default: return null;
  }
}

// Barra de progresso de documentos enviados vs. exigidos.
function DocProgress({ sent, required }: { sent: number; required: number }) {
  const pct = required > 0 ? Math.round((sent / required) * 100) : 0;
  const complete = sent >= required;
  const missing = Math.max(required - sent, 0);
  return (
    <div className="flex items-center gap-3 min-w-[180px]">
      <div className="flex-1">
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${complete ? 'bg-green-500' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className={`text-xs font-medium whitespace-nowrap ${complete ? 'text-green-600' : 'text-muted-foreground'}`}>
        {sent}/{required} enviados
        {missing > 0 && <span className="text-amber-600"> · faltam {missing}</span>}
      </span>
    </div>
  );
}

function viewDocument(id: string) {
  documentsService.openFile(id).catch((err: any) => toast.error(err?.message ?? 'Erro ao abrir o documento.'));
}

// ── Página ─────────────────────────────────────────────────────────────────────

export function DriverDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Dialog de ajuste de saldo
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<AdjustmentType>('CREDIT');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  // Dialog de rejeição de documento
  const [rejectDoc, setRejectDoc] = useState<ApiDocument | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────────
  const userQ = useQuery({ queryKey: queryKeys.users.detail(id), queryFn: () => usersService.getById(id) });
  const balanceQ = useQuery({ queryKey: queryKeys.balance.summary(id), queryFn: () => balanceService.getSummary(id) });
  const adjustmentsQ = useQuery({ queryKey: queryKeys.balance.adjustments(id), queryFn: () => balanceService.listAdjustments(id) });
  const docsQ = useQuery({ queryKey: queryKeys.documents.list, queryFn: () => documentsService.list() });
  const vehiclesQ = useQuery({ queryKey: queryKeys.vehicles.list, queryFn: () => vehiclesService.list() });

  const user = userQ.data?.user;
  const balance = balanceQ.data?.balance;
  const adjustments = adjustmentsQ.data?.adjustments ?? [];
  const allDocs = docsQ.data?.documents ?? [];
  const vehicles = vehiclesQ.data?.vehicles ?? [];

  // Documentos deste motorista, separados por tipo (pessoal vs veículo).
  const personalDocs = useMemo(
    () => allDocs.filter((d) => d.userId === id && !d.vehicleId),
    [allDocs, id],
  );

  // Veículos do motorista.
  const driverVehicles = useMemo(
    () => vehicles.filter((v) => v.userId === id),
    [vehicles, id],
  );

  // Documentos de veículo agrupados por veículo.
  const vehicleDocsById = useMemo(() => {
    const map: Record<string, ApiDocument[]> = {};
    for (const d of allDocs) {
      if (d.vehicleId) {
        (map[d.vehicleId] ??= []).push(d);
      }
    }
    return map;
  }, [allDocs]);

  // Progresso dos documentos pessoais (tipos distintos enviados vs. exigidos).
  const personalProgress = useMemo(() => {
    const sentTypes = new Set(personalDocs.map((d) => d.type));
    const sent = DRIVER_DOCUMENT_TYPES.filter((t) => sentTypes.has(t)).length;
    return { sent, required: DRIVER_DOCUMENT_TYPES.length };
  }, [personalDocs]);

  // Progresso dos documentos de um veículo específico.
  function vehicleProgress(vId: string) {
    const docs = vehicleDocsById[vId] ?? [];
    const sentTypes = new Set(docs.map((d) => d.type));
    const sent = VEHICLE_DOCUMENT_TYPES.filter((t) => sentTypes.has(t)).length;
    return { sent, required: VEHICLE_DOCUMENT_TYPES.length };
  }

  // ── Mutations ──────────────────────────────────────────────────────────────
  const { mutate: updateStatus, isPending: updatingStatus } = useMutation({
    mutationFn: (status: UserStatus) => usersService.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id) });
      toast.success('Motorista atualizado.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atualizar motorista.'),
  });

  const { mutate: createAdjustment, isPending: adjusting } = useMutation({
    mutationFn: () => balanceService.createAdjustment(id, {
      type: adjustType,
      amount: Number(amount),
      reason: reason.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.balance.summary(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.balance.adjustments(id) });
      toast.success(adjustType === 'CREDIT' ? 'Crédito adicionado ao saldo.' : 'Débito aplicado ao saldo.');
      setAdjustOpen(false);
      setAmount('');
      setReason('');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao ajustar saldo.'),
  });

  const { mutate: updateDocStatus, isPending: updatingDoc } = useMutation({
    mutationFn: ({ docId, status, notes }: { docId: string; status: DocumentStatus; notes?: string }) =>
      documentsService.updateStatus(docId, { status, notes }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success(status === 'APPROVED' ? 'Documento aprovado.' : 'Documento rejeitado.');
      setRejectDoc(null);
      setRejectReason('');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao atualizar documento.'),
  });

  function openAdjust(type: AdjustmentType) {
    setAdjustType(type);
    setAmount('');
    setReason('');
    setAdjustOpen(true);
  }

  function handleAdjustSubmit() {
    const value = Number(amount);
    if (!value || value <= 0) { toast.error('Informe um valor maior que zero.'); return; }
    if (adjustType === 'DEBIT' && balance && value > balance.available) {
      toast.error(`Débito superior ao saldo disponível (${eur(balance.available)}).`);
      return;
    }
    createAdjustment();
  }

  function handleRejectConfirm() {
    if (!rejectDoc) return;
    // Motivo opcional
    updateDocStatus({ docId: rejectDoc.id, status: 'REJECTED', notes: rejectReason.trim() || undefined });
  }

  // ── Loading / erro ───────────────────────────────────────────────────────────
  if (userQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /><span>Carregando motorista…</span>
      </div>
    );
  }

  if (userQ.isError || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Motorista não encontrado.</p>
        <Button variant="outline" onClick={() => navigate('/app/admin/drivers')}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar aos motoristas
        </Button>
      </div>
    );
  }

  // Linha de documento reutilizável (pessoal ou de veículo)
  function DocRow({ doc }: { doc: ApiDocument }) {
    const dias = doc.expiresAt ? daysUntil(doc.expiresAt) : null;
    const urgente = dias !== null && dias >= 0 && dias <= 7;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3">
        <div className="min-w-0">
          <p className="font-medium">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</p>
          <p className="text-xs text-muted-foreground">
            Enviado {formatDate(doc.createdAt)}
            {doc.expiresAt && (
              <span className={urgente ? 'text-orange-600 font-medium' : ''}>
                {' · '}Válido até {new Date(doc.expiresAt).toLocaleDateString('pt-PT')}
                {dias !== null && dias >= 0 ? ` (${dias}d)` : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {docStatusBadge(doc.status)}
          <Button size="sm" variant="ghost" onClick={() => viewDocument(doc.id)} title="Ver ficheiro">
            <Eye className="h-4 w-4" />
          </Button>
          {doc.status !== 'APPROVED' && (
            <Button size="sm" disabled={updatingDoc} onClick={() => updateDocStatus({ docId: doc.id, status: 'APPROVED' })}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" />Aprovar
            </Button>
          )}
          {doc.status !== 'REJECTED' && (
            <Button
              size="sm"
              variant="destructive"
              disabled={updatingDoc}
              onClick={() => { setRejectDoc(doc); setRejectReason(''); }}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />Rejeitar
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Voltar + cabeçalho */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/app/admin/drivers')} className="mb-2 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />Motoristas
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">{user.name}</h2>
            <p className="text-muted-foreground flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />{user.email}
            </p>
          </div>
          <StatusPill status={user.status} />
        </div>
      </div>

      {/* Ações de status */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            {user.status !== 'ACTIVE' && (
              <Button disabled={updatingStatus} onClick={() => updateStatus('ACTIVE')}>
                {updatingStatus ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserCheck className="h-4 w-4 mr-2" />}Ativar
              </Button>
            )}
            {user.status === 'ACTIVE' && (
              <Button variant="outline" disabled={updatingStatus} onClick={() => updateStatus('INACTIVE')}>
                <UserX className="h-4 w-4 mr-2" />Desativar
              </Button>
            )}
            {user.status !== 'BLOCKED' && (
              <Button variant="destructive" disabled={updatingStatus} onClick={() => updateStatus('BLOCKED')}>
                <Ban className="h-4 w-4 mr-2" />Bloquear
              </Button>
            )}
            <div className="ml-auto text-sm text-muted-foreground self-center">
              Membro desde {formatDate(user.createdAt)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Saldo */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" />Saldo</CardTitle>
              <CardDescription>Gestão financeira do motorista</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => openAdjust('CREDIT')}>
                <Plus className="h-4 w-4 mr-1" />Adicionar
              </Button>
              <Button size="sm" variant="outline" onClick={() => openAdjust('DEBIT')}>
                <Minus className="h-4 w-4 mr-1" />Retirar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {balanceQ.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />Carregando saldo…
            </div>
          ) : balance ? (
            <>
              {/* Disponível — destaque */}
              <div className="rounded-xl border bg-muted/30 p-5">
                <p className="text-sm text-muted-foreground mb-1">Saldo disponível</p>
                <p className={`text-3xl font-bold ${balance.available < 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {eur(balance.available)}
                </p>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />Ganhos</p>
                  <p className="font-semibold mt-1">{eur(balance.totalEarnings)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-green-600 flex items-center gap-1"><Plus className="h-3.5 w-3.5" />Créditos</p>
                  <p className="font-semibold mt-1">{eur(balance.totalCredits)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-destructive flex items-center gap-1"><Minus className="h-3.5 w-3.5" />Débitos</p>
                  <p className="font-semibold mt-1">{eur(balance.totalDebits)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground flex items-center gap-1"><ArrowDownCircle className="h-3.5 w-3.5" />Levantado</p>
                  <p className="font-semibold mt-1">{eur(balance.totalWithdrawn)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-amber-600 flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Reservado</p>
                  <p className="font-semibold mt-1">{eur(balance.pendingWithdrawals)}</p>
                </div>
              </div>

              {/* Extrato de ajustes */}
              <div>
                <p className="text-sm font-medium flex items-center gap-1 mb-3">
                  <History className="h-4 w-4" />Histórico de ajustes
                </p>
                {adjustmentsQ.isLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : adjustments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                    Nenhum ajuste manual registado.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {adjustments.map((adj) => (
                      <div key={adj.id} className="flex items-center justify-between border rounded-lg p-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${adj.type === 'CREDIT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {adj.type === 'CREDIT' ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {adj.reason || <span className="text-muted-foreground italic">Sem motivo</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(adj.createdAt)}
                              {adj.createdByName ? ` · por ${adj.createdByName}` : ''}
                            </p>
                          </div>
                        </div>
                        <p className={`font-semibold shrink-0 ml-2 ${adj.type === 'CREDIT' ? 'text-green-600' : 'text-destructive'}`}>
                          {adj.type === 'CREDIT' ? '+' : '−'}{eur(adj.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Não foi possível carregar o saldo.</p>
          )}
        </CardContent>
      </Card>

      {/* Retiradas — logo após o saldo, de propósito: aprovar uma retirada sem
          olhar o disponível é o erro que a validação do servidor bloqueia. */}
      <DriverWithdrawalsCard userId={id} />

      {/* Documentos pessoais */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-primary" />Documentos pessoais</CardTitle>
              <CardDescription>{personalDocs.length} documento(s) do motorista</CardDescription>
            </div>
            <DocProgress sent={personalProgress.sent} required={personalProgress.required} />
          </div>
        </CardHeader>
        <CardContent>
          {docsQ.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />Carregando documentos…
            </div>
          ) : personalDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum documento pessoal enviado.</p>
          ) : (
            <div className="space-y-2">
              {personalDocs.map((doc) => <DocRow key={doc.id} doc={doc} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documentos de veículo — agrupados por veículo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Car className="h-5 w-5 text-primary" />Documentos de veículo</CardTitle>
          <CardDescription>
            {driverVehicles.length === 0
              ? 'Nenhum veículo registado'
              : `${driverVehicles.length} veículo(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {docsQ.isLoading || vehiclesQ.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />Carregando…
            </div>
          ) : driverVehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Este motorista não tem veículos registados.</p>
          ) : (
            <div className="space-y-5">
              {driverVehicles.map((v) => {
                const vDocs = vehicleDocsById[v.id] ?? [];
                const p = vehicleProgress(v.id);
                return (
                  <div key={v.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="font-medium text-sm">{v.brand} {v.model}</p>
                        <span className="text-xs text-muted-foreground font-mono">{v.plate}</span>
                      </div>
                      <DocProgress sent={p.sent} required={p.required} />
                    </div>
                    {vDocs.length === 0 ? (
                      <p className="text-xs text-muted-foreground pl-6 py-2">Nenhum documento enviado para este veículo.</p>
                    ) : (
                      <div className="space-y-2 pl-6">
                        {vDocs.map((doc) => <DocRow key={doc.id} doc={doc} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de ajuste de saldo */}
      <Dialog open={adjustOpen} onOpenChange={(v) => { if (!v) setAdjustOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {adjustType === 'CREDIT'
                ? <><Plus className="h-5 w-5 text-green-600" />Adicionar dinheiro</>
                : <><Minus className="h-5 w-5 text-destructive" />Retirar dinheiro</>}
            </DialogTitle>
            <DialogDescription>
              {adjustType === 'CREDIT'
                ? `Creditar saldo de ${user.name}.`
                : `Debitar saldo de ${user.name}.`}
              {balance && ` Disponível: ${eur(balance.available)}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor (€)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Motivo <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <textarea
                id="reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={adjustType === 'CREDIT' ? 'Ex: Bónus de desempenho de outubro.' : 'Ex: Correção de pagamento em duplicado.'}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm outline-none resize-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                Fica registado no histórico com o teu nome. O motorista é notificado.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)} disabled={adjusting}>Cancelar</Button>
            <Button
              variant={adjustType === 'DEBIT' ? 'destructive' : 'default'}
              onClick={handleAdjustSubmit}
              disabled={adjusting || !amount}
            >
              {adjusting
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando…</>
                : adjustType === 'CREDIT'
                  ? <><Plus className="h-4 w-4 mr-2" />Adicionar {amount ? eur(Number(amount)) : ''}</>
                  : <><Minus className="h-4 w-4 mr-2" />Retirar {amount ? eur(Number(amount)) : ''}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de rejeição de documento */}
      <Dialog open={rejectDoc !== null} onOpenChange={(v) => { if (!v) { setRejectDoc(null); setRejectReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar documento</DialogTitle>
            <DialogDescription>
              {rejectDoc && (
                <>
                  <strong>{DOC_TYPE_LABELS[rejectDoc.type] ?? rejectDoc.type}</strong> de{' '}
                  <strong>{user.name}</strong>. Se indicar um motivo, ele é enviado por email ao motorista.
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
            <Button variant="outline" onClick={() => { setRejectDoc(null); setRejectReason(''); }} disabled={updatingDoc}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRejectConfirm} disabled={updatingDoc}>
              {updatingDoc ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rejeitando…</> : <><XCircle className="h-4 w-4 mr-2" />Rejeitar documento</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}