// src/app/components/admin/financial-control.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/app/components/ui/dialog';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { DollarSign, TrendingUp, CheckCircle, Clock, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { earningsService }    from '@/features/driver/services/earnings.service';
import { usersService }       from '@/features/admin/services/users.service';
import { queryKeys }          from '@/shared/lib/query-keys';
import { FINANCIAL }          from '@/shared/constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { WithdrawalStatus } from '@/shared/types/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStatusBadge(status: WithdrawalStatus) {
  switch (status) {
    case 'PAID':     return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Pago</Badge>;
    case 'APPROVED': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><CheckCircle className="h-3 w-3 mr-1" />Aprovado</Badge>;
    case 'PENDING':  return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    case 'REJECTED': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>;
    default: return null;
  }
}

// ── Modal de rejeição ─────────────────────────────────────────────────────────

interface RejectModalProps {
  open:      boolean;
  onClose:   () => void;
  onConfirm: (notes: string) => void;
  loading:   boolean;
}

function RejectModal({ open, onClose, onConfirm, loading }: RejectModalProps) {
  const [notes, setNotes] = useState('');

  function handleConfirm() {
    if (!notes.trim()) {
      toast.error('Indica o motivo da rejeição.');
      return;
    }
    onConfirm(notes.trim());
  }

  function handleClose() {
    setNotes('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rejeitar Saque</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label htmlFor="reject-notes">Motivo da rejeição</Label>
          <Textarea
            id="reject-notes"
            placeholder="Ex: Saldo insuficiente, documentação pendente…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />A rejeitar…</> : 'Confirmar rejeição'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function FinancialControl() {
  const queryClient = useQueryClient();

  // Estado do modal de rejeição
  const [rejectId,    setRejectId]    = useState<string | null>(null);

  const withdrawalsQ = useQuery({ queryKey: queryKeys.withdrawals.list, queryFn: () => withdrawalsService.list() });
  const earningsQ    = useQuery({ queryKey: queryKeys.earnings.list,    queryFn: () => earningsService.list() });
  const usersQ       = useQuery({ queryKey: queryKeys.users.list,       queryFn: () => usersService.list() });

  const isLoading = withdrawalsQ.isLoading || earningsQ.isLoading;
  const isError   = withdrawalsQ.isError   || earningsQ.isError;

  const { mutate: updateStatus, isPending: updating } = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: WithdrawalStatus; notes?: string }) =>
      withdrawalsService.updateStatus(id, { status, notes }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.withdrawals.all });
      toast.success(status === 'APPROVED' ? 'Saque aprovado!' : 'Saque rejeitado.');
      setRejectId(null);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao processar saque.'),
  });

  function handleApprove(id: string) {
    updateStatus({ id, status: 'APPROVED' });
  }

  function handleRejectConfirm(notes: string) {
    if (!rejectId) return;
    updateStatus({ id: rejectId, status: 'REJECTED', notes });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /><span>Carregando dados financeiros…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar dados financeiros.</p>
        <Button variant="outline" onClick={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.withdrawals.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.earnings.all });
        }}>Tentar novamente</Button>
      </div>
    );
  }

  const withdrawals = withdrawalsQ.data?.withdrawals ?? [];
  const earnings    = earningsQ.data?.earnings       ?? [];
  const users       = usersQ.data?.users             ?? [];

  const totalEarnings      = earnings.reduce((s, e) => s + Number(e.amount), 0);
  const platformRevenue    = totalEarnings * FINANCIAL.companyCommission;
  const pendingWithdrawals = withdrawals.filter(w => w.status === 'PENDING');
  const paidWithdrawals    = withdrawals.filter(w => w.status === 'PAID');
  const totalPendingAmount = pendingWithdrawals.reduce((s, w) => s + Number(w.amount), 0);
  const totalPaidAmount    = paidWithdrawals.reduce((s, w) => s + Number(w.amount), 0);

  const chartData = [
    { categoria: 'Ganhos',     valor: totalEarnings },
    { categoria: 'Pagos',      valor: totalPaidAmount },
    { categoria: 'Plataforma', valor: platformRevenue },
    { categoria: 'Pendentes',  valor: totalPendingAmount },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Controle Financeiro</h2>
        <p className="text-muted-foreground">Gerencie transações e saques da plataforma</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Ganhos Totais</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-2xl font-bold">€ {totalEarnings.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Todos os motoristas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Saques Pagos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-2xl font-bold text-green-600">€ {totalPaidAmount.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{paidWithdrawals.length} processado(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-2xl font-bold text-yellow-600">€ {totalPendingAmount.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{pendingWithdrawals.length} aguardando</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Receita</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-2xl font-bold text-blue-600">€ {platformRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Taxa {FINANCIAL.companyCommission * 100}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico */}
      <Card>
        <CardHeader>
          <CardTitle>Visão Geral Financeira</CardTitle>
          <CardDescription>Distribuição de valores por categoria</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="categoria" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`€ ${v.toFixed(2)}`, 'Valor']} />
              <Bar dataKey="valor" fill="#108865" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Saques pendentes */}
      <Card>
        <CardHeader>
          <CardTitle>Solicitações Pendentes</CardTitle>
          <CardDescription>Aprovações necessárias ({pendingWithdrawals.length})</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingWithdrawals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum saque pendente.</p>
          ) : (
            <>
              {/* Tabela — md+ */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motorista</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingWithdrawals.map(w => {
                      const driver = users.find(u => u.id === w.userId);
                      return (
                        <TableRow key={w.id}>
                          <TableCell>
                            <p className="font-medium">{driver?.name ?? '—'}</p>
                            <p className="text-sm text-muted-foreground">{driver?.email}</p>
                          </TableCell>
                          <TableCell>{new Date(w.requestedAt).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell className="font-bold">€ {Number(w.amount).toFixed(2)}</TableCell>
                          <TableCell>{getStatusBadge(w.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" disabled={updating} onClick={() => handleApprove(w.id)}>
                                {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                                Aprovar
                              </Button>
                              <Button size="sm" variant="destructive" disabled={updating} onClick={() => setRejectId(w.id)}>
                                <XCircle className="h-3 w-3 mr-1" />Rejeitar
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
                {pendingWithdrawals.map(w => {
                  const driver = users.find(u => u.id === w.userId);
                  return (
                    <div key={w.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{driver?.name ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">{new Date(w.requestedAt).toLocaleDateString('pt-BR')}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">€ {Number(w.amount).toFixed(2)}</p>
                          {getStatusBadge(w.status)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" disabled={updating} onClick={() => handleApprove(w.id)}>
                          Aprovar
                        </Button>
                        <Button size="sm" variant="destructive" className="flex-1" disabled={updating} onClick={() => setRejectId(w.id)}>
                          Rejeitar
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

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Saques</CardTitle>
          <CardDescription>Todas as movimentações</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...withdrawals]
                  .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
                  .slice(0, 20)
                  .map(w => {
                    const driver = users.find(u => u.id === w.userId);
                    return (
                      <TableRow key={w.id}>
                        <TableCell>
                          <p className="font-medium whitespace-nowrap">{driver?.name ?? '—'}</p>
                          <p className="text-sm text-muted-foreground whitespace-nowrap">{driver?.email}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{new Date(w.requestedAt).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell className="font-bold whitespace-nowrap">€ {Number(w.amount).toFixed(2)}</TableCell>
                        <TableCell>{getStatusBadge(w.status)}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de rejeição */}
      <RejectModal
        open={!!rejectId}
        onClose={() => setRejectId(null)}
        onConfirm={handleRejectConfirm}
        loading={updating}
      />
    </div>
  );
}