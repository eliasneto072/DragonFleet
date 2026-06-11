// src/app/components/driver/withdrawals.tsx
// Responsivo: layout empilhado no mobile

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { DollarSign, CheckCircle, Clock, XCircle, ArrowDownToLine, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { FINANCIAL } from '@/shared/constants';
import type { WithdrawalStatus } from '@/shared/types/api';

function getStatusBadge(status: WithdrawalStatus) {
  switch (status) {
    case 'PAID':     return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Pago</Badge>;
    case 'APPROVED': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><CheckCircle className="h-3 w-3 mr-1" />Aprovado</Badge>;
    case 'PENDING':  return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    case 'REJECTED': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>;
    default: return null;
  }
}

export function Withdrawals() {
  const queryClient = useQueryClient();
  const [open, setOpen]     = useState(false);
  const [amount, setAmount] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.withdrawals.list,
    queryFn:  () => withdrawalsService.list(),
  });

  const withdrawals    = data?.withdrawals ?? [];
  const totalWithdrawn = withdrawals
    .filter(w => w.status === 'PAID' || w.status === 'APPROVED')
    .reduce((sum, w) => sum + Number(w.amount), 0);

  const { mutate: createWithdrawal, isPending } = useMutation({
    mutationFn: (value: number) => withdrawalsService.create(value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.withdrawals.all });
      toast.success('Solicitação de saque enviada!');
      setOpen(false); setAmount('');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao solicitar saque.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount);
    if (isNaN(value) || value < FINANCIAL.minWithdrawal) {
      toast.error(`Valor mínimo: € ${FINANCIAL.minWithdrawal},00`); return;
    }
    if (value > FINANCIAL.maxWithdrawal) {
      toast.error(`Valor máximo: € ${FINANCIAL.maxWithdrawal.toLocaleString('pt-BR')},00`); return;
    }
    createWithdrawal(value);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /><span>Carregando saques…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar saques.</p>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.withdrawals.all })}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Retiradas</h2>
          <p className="text-muted-foreground">Solicite saques e acompanhe seu histórico</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <ArrowDownToLine className="h-4 w-4 mr-2" />Nova Retirada
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Solicitar Retirada</DialogTitle>
              <DialogDescription>
                Mínimo € {FINANCIAL.minWithdrawal},00 · Máximo € {FINANCIAL.maxWithdrawal.toLocaleString('pt-BR')},00
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Valor da Retirada</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                  <Input id="amount" type="number" step="0.01" min={FINANCIAL.minWithdrawal}
                    max={FINANCIAL.maxWithdrawal} placeholder="0,00" className="pl-10"
                    value={amount} onChange={e => setAmount(e.target.value)} required />
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Importante:</strong> Saques são processados em até {FINANCIAL.processingDays} dias úteis.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Solicitar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Saldo */}
      <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
        <CardHeader>
          <CardTitle className="text-white">Total Sacado</CardTitle>
          <CardDescription className="text-blue-100">Soma de saques aprovados e pagos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl sm:text-4xl font-bold">€ {totalWithdrawn.toFixed(2)}</p>
              <p className="text-sm text-blue-100 mt-2">
                {withdrawals.filter(w => w.status === 'PENDING').length} saque(s) pendente(s)
              </p>
            </div>
            <DollarSign className="h-12 w-12 sm:h-16 sm:w-16 opacity-50" />
          </div>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Retiradas</CardTitle>
          <CardDescription>Acompanhe todas as suas solicitações</CardDescription>
        </CardHeader>
        <CardContent>
          {withdrawals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum saque solicitado ainda.</p>
          ) : (
            <div className="space-y-3">
              {withdrawals.map(w => (
                <div key={w.id} className="flex items-start justify-between border-b pb-3 last:border-0 gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">€ {Number(w.amount).toFixed(2)}</p>
                      {getStatusBadge(w.status)}
                    </div>
                    {w.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{w.notes}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">{new Date(w.requestedAt).toLocaleDateString('pt-BR')}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(w.requestedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}