// src/app/components/admin/admin-dashboard.tsx

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { StatsCard } from '@/app/components/stats-card';
import { Users, DollarSign, Car, Clock, Loader2, AlertCircle } from 'lucide-react';
import {
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
  LineChart, Line,
  PieChart, Pie, Cell,
} from 'recharts';
import { usersService }       from '@/features/admin/services/users.service';
import { earningsService }    from '@/features/driver/services/earnings.service';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { vehiclesService }    from '@/features/driver/services/vehicles.service';
import { queryKeys }          from '@/shared/lib/query-keys';
import { FINANCIAL }          from '@/shared/constants';
import type { ApiEarning }    from '@/shared/types/api';

const COLORS = ['#108865', '#1D1D1D', '#3b82f6', '#f59e0b'];

function buildMonthlyRevenue(earnings: ApiEarning[], months = 6) {
  const map: Record<string, number> = {};
  earnings.forEach((e) => {
    const d   = new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map[key]  = (map[key] ?? 0) + Number(e.amount);
  });

  const now = new Date();
  return Array.from({ length: months }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      month:   d.toLocaleDateString('pt-BR', { month: 'short' }),
      receita: Math.round((map[key] ?? 0) * FINANCIAL.companyCommission),
    };
  });
}

function buildPlatformData(earnings: ApiEarning[]) {
  const map: Record<string, number> = {};
  earnings.forEach((e) => {
    map[e.platform] = (map[e.platform] ?? 0) + 1;
  });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

export function AdminDashboard() {
  const usersQ       = useQuery({ queryKey: queryKeys.users.list,         queryFn: () => usersService.list() });
  const earningsQ    = useQuery({ queryKey: queryKeys.earnings.list,       queryFn: () => earningsService.list() });
  const withdrawalsQ = useQuery({ queryKey: queryKeys.withdrawals.list,    queryFn: () => withdrawalsService.list() });
  const vehiclesQ    = useQuery({ queryKey: queryKeys.vehicles.list,       queryFn: () => vehiclesService.list() });

  const isLoading = usersQ.isLoading || earningsQ.isLoading || withdrawalsQ.isLoading || vehiclesQ.isLoading;
  const isError   = usersQ.isError   || earningsQ.isError   || withdrawalsQ.isError   || vehiclesQ.isError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando dashboard…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar dados do dashboard.</p>
      </div>
    );
  }

  const users       = usersQ.data?.users             ?? [];
  const earnings    = earningsQ.data?.earnings        ?? [];
  const withdrawals = withdrawalsQ.data?.withdrawals  ?? [];
  const vehicles    = vehiclesQ.data?.vehicles        ?? [];

  const drivers        = users.filter(u => u.role === 'DRIVER');
  const activeDrivers  = drivers.filter(u => u.status === 'ACTIVE');
  const totalRevenue   = earnings.reduce((s, e) => s + Number(e.amount), 0) * FINANCIAL.companyCommission;
  const pendingW       = withdrawals.filter(w => w.status === 'PENDING');
  const pendingWAmount = pendingW.reduce((s, w) => s + Number(w.amount), 0);

  // Receita do mês corrente
  const now = new Date();
  const monthlyRevenue = earnings
    .filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + Number(e.amount), 0) * FINANCIAL.companyCommission;

  const monthlyData   = buildMonthlyRevenue(earnings);
  const platformData  = buildPlatformData(earnings);

  // Veículos por status
  const vehiclesByStatus = [
    { name: 'Ativos',      value: vehicles.filter(v => v.status === 'ACTIVE').length },
    { name: 'Manutenção',  value: vehicles.filter(v => v.status === 'MAINTENANCE').length },
    { name: 'Inativos',    value: vehicles.filter(v => v.status === 'INACTIVE').length },
  ].filter(v => v.value > 0);

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total de Motoristas"
          value={drivers.length.toString()}
          description={`${activeDrivers.length} ativos`}
          icon={<Users className="h-4 w-4" />}
        />
        <StatsCard
          title="Receita do Mês"
          value={`€ ${(monthlyRevenue / 1000).toFixed(1)}k`}
          description={`${FINANCIAL.companyCommission * 100}% de comissão`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <StatsCard
          title="Veículos na Frota"
          value={vehicles.length.toString()}
          description={`${vehicles.filter(v => v.status === 'ACTIVE').length} ativos`}
          icon={<Car className="h-4 w-4" />}
        />
        <StatsCard
          title="Saques Pendentes"
          value={pendingW.length.toString()}
          description={`€ ${pendingWAmount.toFixed(2)} a processar`}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Gráfico de receita mensal */}
      <Card>
        <CardHeader>
          <CardTitle>Receita da Plataforma por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [`€ ${v.toFixed(2)}`, 'Receita']} />
              <Line type="monotone" dataKey="receita" stroke="#108865" strokeWidth={2} dot={{ fill: '#108865' }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Distribuições */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ganhos por Plataforma</CardTitle>
          </CardHeader>
          <CardContent>
            {platformData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">Sem dados ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={platformData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {platformData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Veículos por Status</CardTitle>
          </CardHeader>
          <CardContent>
            {vehiclesByStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">Nenhum veículo cadastrado.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={vehiclesByStatus}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [v, 'Veículos']} />
                  <Bar dataKey="value" fill="#108865" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Receita Total</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">€ {(totalRevenue / 1000).toFixed(1)}k</p>
            <p className="text-sm text-muted-foreground mt-2">Comissão acumulada da plataforma</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total de Lançamentos</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{earnings.length.toLocaleString('pt-BR')}</p>
            <p className="text-sm text-muted-foreground mt-2">Registros de ganhos no sistema</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Saques Pendentes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-yellow-600">{pendingW.length}</p>
            <p className="text-sm text-muted-foreground mt-2">Aguardando processamento</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}