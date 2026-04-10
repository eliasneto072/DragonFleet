import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { StatsCard } from '@/app/components/stats-card';
import { DollarSign, TrendingUp, Star, Car } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { mockEarnings, monthlyEarningsData, weeklyRidesData }  from "@/shared/lib/mock-data";

interface DriverDashboardProps {
  driver: any;
}

export function DriverDashboard({ driver }: DriverDashboardProps) {
  // Calculate this week's earnings
  const thisWeekEarnings = mockEarnings
    .filter(e => e.driverId === driver.id && e.status === 'completed')
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Saldo Disponível"
          value={`R$ ${driver.availableBalance.toFixed(2)}`}
          description="Disponível para saque"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <StatsCard
          title="Ganhos Totais"
          value={`R$ ${driver.totalEarnings.toFixed(2)}`}
          description="Histórico completo"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatsCard
          title="Avaliação"
          value={driver.rating.toFixed(1)}
          description={`${driver.ridesCompleted} corridas completas`}
          icon={<Star className="h-4 w-4" />}
        />
        <StatsCard
          title="Esta Semana"
          value={`R$ ${thisWeekEarnings.toFixed(2)}`}
          description="Ganhos dos últimos 7 dias"
          icon={<DollarSign className="h-4 w-4" />}
          trend={{ value: '+12.5% vs. semana anterior', positive: true }}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ganhos Mensais</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyEarningsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip 
                  formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                  labelStyle={{ color: '#000' }}
                />
                <Line type="monotone" dataKey="earnings" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Corridas por Dia da Semana</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyRidesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip labelStyle={{ color: '#000' }} />
                <Bar dataKey="rides" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Earnings */}
      <Card>
        <CardHeader>
          <CardTitle>Ganhos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockEarnings.slice(0, 5).map((earning) => (
              <div key={earning.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                <div className="flex-1">
                  <p className="font-medium">{earning.description}</p>
                  <p className="text-sm text-muted-foreground">{earning.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600">+ R$ {earning.amount.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground capitalize">{earning.type}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
