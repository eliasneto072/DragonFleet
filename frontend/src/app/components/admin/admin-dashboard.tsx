import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { StatsCard } from '@/app/components/stats-card';
import { Users, DollarSign, Car, TrendingUp, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { adminStatsData, revenueByMonthData, ridesByVehicleType } from "@/shared/lib/mock-data";

export function AdminDashboard() {
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total de Motoristas"
          value={adminStatsData.totalDrivers.toString()}
          description={`${adminStatsData.activeDrivers} ativos`}
          icon={<Users className="h-4 w-4" />}
        />
        <StatsCard
          title="Receita Mensal"
          value={`R$ ${(adminStatsData.monthlyRevenue / 1000).toFixed(1)}k`}
          description="Janeiro 2026"
          icon={<DollarSign className="h-4 w-4" />}
          trend={{ value: '+8.2% vs. mês anterior', positive: true }}
        />
        <StatsCard
          title="Corridas do Mês"
          value={adminStatsData.monthlyRides.toLocaleString()}
          description="Total de corridas"
          icon={<Car className="h-4 w-4" />}
        />
        <StatsCard
          title="Avaliação Média"
          value={adminStatsData.averageRating.toFixed(1)}
          description="Satisfação geral"
          icon={<Activity className="h-4 w-4" />}
        />
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Receita por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={revenueByMonthData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip 
                formatter={(value: number) => `R$ ${(value / 1000).toFixed(1)}k`}
                labelStyle={{ color: '#000' }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bottom Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Corridas por Tipo de Veículo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={ridesByVehicleType}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ type, percentage }) => `${type} (${percentage}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="rides"
                >
                  {ridesByVehicleType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ridesByVehicleType} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="type" type="category" />
                <Tooltip labelStyle={{ color: '#000' }} />
                <Bar dataKey="rides" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Receita Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">R$ {(adminStatsData.totalRevenue / 1000).toFixed(1)}k</p>
            <p className="text-sm text-muted-foreground mt-2">Desde o início</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total de Corridas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{adminStatsData.totalRides.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground mt-2">Todas as corridas realizadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Saques Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{adminStatsData.pendingWithdrawals}</p>
            <p className="text-sm text-muted-foreground mt-2">Aguardando processamento</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
