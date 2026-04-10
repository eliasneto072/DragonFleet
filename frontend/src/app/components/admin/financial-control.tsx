import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { DollarSign, TrendingUp, CheckCircle, Clock, XCircle, Download } from 'lucide-react';
import { mockWithdrawals, mockEarnings, mockDrivers } from "@/shared/lib/mock-data";
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function FinancialControl() {
  const [periodFilter, setPeriodFilter] = useState('month');

  // Calculate financial stats
  const totalPendingWithdrawals = mockWithdrawals
    .filter(w => w.status === 'pending')
    .reduce((sum, w) => sum + w.amount, 0);

  const totalCompletedWithdrawals = mockWithdrawals
    .filter(w => w.status === 'completed')
    .reduce((sum, w) => sum + w.amount, 0);

  const totalEarnings = mockEarnings
    .filter(e => e.status === 'completed')
    .reduce((sum, e) => sum + e.amount, 0);

  const platformRevenue = totalEarnings * 0.20; // 20% platform fee

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

  const financialData = [
    { category: 'Ganhos Totais', value: totalEarnings },
    { category: 'Saques Pagos', value: totalCompletedWithdrawals },
    { category: 'Receita Plataforma', value: platformRevenue },
    { category: 'Pendentes', value: totalPendingWithdrawals },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Controle Financeiro</h2>
          <p className="text-muted-foreground">Gerencie transações e saques da plataforma</p>
        </div>
        <Button>
          <Download className="h-4 w-4 mr-2" />
          Exportar Relatório
        </Button>
      </div>

      {/* Financial Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ganhos Totais</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {totalEarnings.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Todos os motoristas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saques Pagos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">R$ {totalCompletedWithdrawals.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Processados com sucesso</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saques Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">R$ {totalPendingWithdrawals.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Aguardando processamento</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Plataforma</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">R$ {platformRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Taxa de 20%</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Visão Geral Financeira</CardTitle>
          <CardDescription>Distribuição de valores por categoria</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={financialData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip 
                formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                labelStyle={{ color: '#000' }}
              />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Pending Withdrawals */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Solicitações de Saque Pendentes</CardTitle>
              <CardDescription>Aprovações necessárias</CardDescription>
            </div>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Esta Semana</SelectItem>
                <SelectItem value="month">Este Mês</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockWithdrawals
                .filter(w => w.status === 'pending')
                .map((withdrawal) => {
                  const driver = mockDrivers.find(d => d.id === withdrawal.driverId);
                  return (
                    <TableRow key={withdrawal.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{driver?.name}</p>
                          <p className="text-sm text-muted-foreground">{driver?.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>{new Date(withdrawal.date).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell className="font-bold">R$ {withdrawal.amount.toFixed(2)}</TableCell>
                      <TableCell>{withdrawal.method}</TableCell>
                      <TableCell>{getStatusBadge(withdrawal.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="default">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Aprovar
                          </Button>
                          <Button size="sm" variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Rejeitar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Transações Recentes</CardTitle>
          <CardDescription>Histórico de todas as movimentações</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motorista</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockWithdrawals.slice(0, 10).map((withdrawal) => {
                const driver = mockDrivers.find(d => d.id === withdrawal.driverId);
                return (
                  <TableRow key={withdrawal.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{driver?.name}</p>
                        <p className="text-sm text-muted-foreground">{withdrawal.accountInfo}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p>{new Date(withdrawal.date).toLocaleDateString('pt-BR')}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(withdrawal.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="font-bold">R$ {withdrawal.amount.toFixed(2)}</TableCell>
                    <TableCell>{withdrawal.method}</TableCell>
                    <TableCell>{getStatusBadge(withdrawal.status)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
