// src/app/components/admin/analytics-dashboard.tsx

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Users, DollarSign, TrendingUp, Activity, Loader2, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import {
  Line, Bar, Doughnut,
} from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  BarElement, ArcElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { earningsService }    from '@/features/driver/services/earnings.service';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { usersService }       from '@/features/admin/services/users.service';
import { documentsService }   from '@/features/driver/services/documents.service';
import { queryKeys }          from '@/shared/lib/query-keys';
import { FINANCIAL }          from '@/shared/constants';
import type { ApiEarning }    from '@/shared/types/api';

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement,
  BarElement, ArcElement,
  Title, Tooltip, Legend, Filler,
);

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: true, position: 'bottom' as const } },
  scales: { y: { beginAtZero: true } },
};

const DONUT_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom' as const } },
};

function buildMonthlyRevenue(earnings: ApiEarning[], months = 12) {
  const map: Record<string, number> = {};
  earnings.forEach(e => {
    const d   = new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map[key]  = (map[key] ?? 0) + Number(e.amount) * FINANCIAL.companyCommission;
  });

  const now = new Date();
  return Array.from({ length: months }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      label: d.toLocaleDateString('pt-BR', { month: 'short' }),
      value: Math.round(map[key] ?? 0),
    };
  });
}

function buildPlatformBar(earnings: ApiEarning[]) {
  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const platforms = ['UBER', 'BOLT', 'FREE_NOW', 'OTHER'];
  const COLORS    = ['#000000', '#108865', '#3b82f6', '#f59e0b'];

  const map: Record<string, Record<string, number>> = {};
  DAYS.forEach(d => { map[d] = {}; });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  earnings
    .filter(e => new Date(e.date) >= cutoff)
    .forEach(e => {
      const day = DAYS[new Date(e.date).getDay()];
      map[day][e.platform] = (map[day][e.platform] ?? 0) + 1;
    });

  return {
    labels: DAYS,
    datasets: platforms
      .filter(p => earnings.some(e => e.platform === p))
      .map((p, i) => ({
        label:           p === 'FREE_NOW' ? 'Free Now' : p.charAt(0) + p.slice(1).toLowerCase(),
        data:            DAYS.map(d => map[d][p] ?? 0),
        backgroundColor: COLORS[i],
      })),
  };
}

export function AnalyticsDashboard() {
  const earningsQ    = useQuery({ queryKey: queryKeys.earnings.list,    queryFn: () => earningsService.list() });
  const withdrawalsQ = useQuery({ queryKey: queryKeys.withdrawals.list, queryFn: () => withdrawalsService.list() });
  const usersQ       = useQuery({ queryKey: queryKeys.users.list,       queryFn: () => usersService.list() });
  const documentsQ   = useQuery({ queryKey: queryKeys.documents.list,   queryFn: () => documentsService.list() });

  const isLoading = earningsQ.isLoading || usersQ.isLoading;
  const isError   = earningsQ.isError   || usersQ.isError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando analytics…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar dados analíticos.</p>
      </div>
    );
  }

  const earnings    = earningsQ.data?.earnings       ?? [];
  const withdrawals = withdrawalsQ.data?.withdrawals  ?? [];
  const users       = usersQ.data?.users              ?? [];
  const documents   = documentsQ.data?.documents      ?? [];

  const drivers       = users.filter(u => u.role === 'DRIVER');
  const activeDrivers = drivers.filter(u => u.status === 'ACTIVE');
  const totalRevenue  = earnings.reduce((s, e) => s + Number(e.amount), 0) * FINANCIAL.companyCommission;
  const pendingW      = withdrawals.filter(w => w.status === 'PENDING').length;
  const pendingDocs   = documents.filter(d => d.status === 'PENDING').length;

  // Mês corrente
  const now = new Date();
  const thisMonthRevenue = earnings
    .filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + Number(e.amount), 0) * FINANCIAL.companyCommission;

  const monthlyData  = buildMonthlyRevenue(earnings);
  const platformData = buildPlatformBar(earnings);

  // Distribuição de plataformas para o donut
  const platformCounts: Record<string, number> = {};
  earnings.forEach(e => { platformCounts[e.platform] = (platformCounts[e.platform] ?? 0) + 1; });
  const donutData = {
    labels: Object.keys(platformCounts).map(k => k === 'FREE_NOW' ? 'Free Now' : k.charAt(0) + k.slice(1).toLowerCase()),
    datasets: [{
      data:            Object.values(platformCounts),
      backgroundColor: ['#000000', '#108865', '#3b82f6', '#f59e0b'],
      borderWidth:     0,
    }],
  };

  // Top 5 motoristas por ganhos
  const earningsByDriver: Record<string, number> = {};
  earnings.forEach(e => {
    earningsByDriver[e.userId] = (earningsByDriver[e.userId] ?? 0) + Number(e.amount);
  });
  const topDrivers = Object.entries(earningsByDriver)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id, total]) => ({
      user:  users.find(u => u.id === id),
      total,
    }))
    .filter(d => d.user);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Painel Analítico</h2>
        <p className="text-muted-foreground">Visão geral da performance da frota</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Receita do Mês',
            value: `€ ${(thisMonthRevenue / 1000).toFixed(1)}k`,
            sub:   `Total: € ${(totalRevenue / 1000).toFixed(1)}k`,
            icon:  DollarSign,
            color: 'from-green-500 to-green-600',
          },
          {
            label: 'Motoristas Ativos',
            value: activeDrivers.length.toString(),
            sub:   `${drivers.length} cadastrados`,
            icon:  Users,
            color: 'from-blue-500 to-blue-600',
          },
          {
            label: 'Lançamentos',
            value: earnings.length.toLocaleString('pt-BR'),
            sub:   'Total de registros',
            icon:  TrendingUp,
            color: 'from-[#108865] to-[#0d6b4f]',
          },
          {
            label: 'Taxa de Documentos',
            value: documents.length > 0
              ? `${Math.round((documents.filter(d => d.status === 'APPROVED').length / documents.length) * 100)}%`
              : '—',
            sub: `${documents.filter(d => d.status === 'APPROVED').length} aprovados`,
            icon: Activity,
            color: 'from-purple-500 to-purple-600',
          },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{label}</p>
                  <h3 className="text-2xl font-bold mt-1">{value}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                </div>
                <div className={`h-12 w-12 bg-gradient-to-br ${color} rounded-lg flex items-center justify-center`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficos linha + barra */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Receita da Plataforma (12 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <Line
                data={{
                  labels: monthlyData.map(d => d.label),
                  datasets: [{
                    label:           'Receita',
                    data:            monthlyData.map(d => d.value),
                    borderColor:     '#108865',
                    backgroundColor: 'rgba(16,136,101,0.1)',
                    tension:         0.4,
                    fill:            true,
                  }],
                }}
                options={CHART_OPTIONS}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Corridas por Plataforma (30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {platformData.datasets.length === 0
                ? <p className="text-sm text-muted-foreground text-center pt-20">Sem dados.</p>
                : <Bar data={platformData} options={CHART_OPTIONS} />}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Donut + indicadores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Distribuição por Plataforma</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {Object.keys(platformCounts).length === 0
                ? <p className="text-sm text-muted-foreground text-center pt-20">Sem dados.</p>
                : <Doughnut data={donutData} options={DONUT_OPTIONS} />}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Indicadores de Atenção</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { icon: CheckCircle, color: 'green', label: 'Documentos Aprovados',   sub: 'Total aprovado',              value: documents.filter(d => d.status === 'APPROVED').length },
                { icon: Clock,       color: 'orange', label: 'Saques Pendentes',      sub: 'Aguardando aprovação',        value: pendingW },
                { icon: AlertCircle, color: 'red',    label: 'Documentos Pendentes',  sub: 'Aguardando revisão',          value: pendingDocs },
              ].map(({ icon: Icon, color, label, sub, value }) => (
                <div key={label} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 bg-${color}-100 rounded-lg flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 text-${color}-600`} />
                    </div>
                    <div>
                      <p className="font-semibold">{label}</p>
                      <p className="text-sm text-muted-foreground">{sub}</p>
                    </div>
                  </div>
                  <span className="text-2xl font-bold">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top motoristas */}
      <Card>
        <CardHeader><CardTitle>Top 5 Motoristas por Ganhos</CardTitle></CardHeader>
        <CardContent>
          {topDrivers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados suficientes.</p>
          ) : (
            <div className="space-y-3">
              {topDrivers.map(({ user, total }, i) => (
                <div key={user!.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="h-8 w-8 bg-gradient-to-br from-[#108865] to-[#0d6b4f] rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-semibold">{user!.name}</p>
                      <p className="text-sm text-muted-foreground">{user!.email}</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-[#108865]">€ {total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}