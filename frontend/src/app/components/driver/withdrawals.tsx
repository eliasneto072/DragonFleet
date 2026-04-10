import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { DollarSign, CheckCircle, Clock, XCircle, ArrowDownToLine } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { toast } from 'sonner';
import { mockWithdrawals } from "@/shared/lib/mock-data";
interface WithdrawalsProps {
  driver: any;
}

export function Withdrawals({ driver }: WithdrawalsProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Concluído</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>;
      default:
        return null;
    }
  };

  const handleWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    const requestAmount = parseFloat(amount);
    
    if (requestAmount > driver.availableBalance) {
      toast.error('Saldo insuficiente para esta retirada');
      return;
    }
    
    if (requestAmount < 10) {
      toast.error('Valor mínimo para saque é R$ 10,00');
      return;
    }

    toast.success('Solicitação de saque enviada com sucesso!');
    setOpen(false);
    setAmount('');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Retiradas</h2>
          <p className="text-muted-foreground">Solicite saques e acompanhe seu histórico</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <ArrowDownToLine className="h-4 w-4 mr-2" />
              Nova Retirada
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Solicitar Retirada</DialogTitle>
              <DialogDescription>
                Saldo disponível: R$ {driver.availableBalance.toFixed(2)}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleWithdrawal} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Valor da Retirada</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="10"
                    max={driver.availableBalance}
                    placeholder="0,00"
                    className="pl-10"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">Valor mínimo: R$ 10,00</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="method">Método de Pagamento</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix (Instantâneo)</SelectItem>
                    <SelectItem value="bank">Transferência Bancária (1-2 dias úteis)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="account">Chave Pix / Conta Bancária</Label>
                <Input
                  id="account"
                  placeholder="Ex: seu@email.com ou CPF"
                  required
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Importante:</strong> Retiradas via Pix são processadas em até 1 hora. 
                  Transferências bancárias podem levar até 2 dias úteis.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Solicitar Retirada</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Available Balance Card */}
      <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
        <CardHeader>
          <CardTitle className="text-white">Saldo Disponível</CardTitle>
          <CardDescription className="text-blue-100">Disponível para saque imediato</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-4xl font-bold">R$ {driver.availableBalance.toFixed(2)}</p>
              <p className="text-sm text-blue-100 mt-2">Total em ganhos: R$ {driver.totalEarnings.toFixed(2)}</p>
            </div>
            <DollarSign className="h-16 w-16 opacity-50" />
          </div>
        </CardContent>
      </Card>

      {/* Withdrawal History */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Retiradas</CardTitle>
          <CardDescription>Acompanhe todas as suas solicitações de saque</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockWithdrawals.map((withdrawal) => (
              <div key={withdrawal.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">R$ {withdrawal.amount.toFixed(2)}</p>
                    {getStatusBadge(withdrawal.status)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{withdrawal.method}</p>
                  <p className="text-xs text-muted-foreground">{withdrawal.accountInfo}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{new Date(withdrawal.date).toLocaleDateString('pt-BR')}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(withdrawal.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
