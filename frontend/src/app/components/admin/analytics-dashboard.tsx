import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Users, TrendingUp, Car, DollarSign, Activity, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export function AnalyticsDashboard() {
  // Revenue Chart Data
  const revenueData = {
    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    datasets: [
      {
        label: 'Receita Total',
        data: [38200, 42100, 39800, 45200, 43900, 47600, 49100, 51200, 48900, 52400, 54100, 56800],
        borderColor: '#108865',
        backgroundColor: 'rgba(16, 136, 101, 0.1)',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  // Trips Chart Data
  const tripsData = {
    labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
    datasets: [
      {
        label: 'Uber',
        data: [320, 340, 315, 380, 425, 390, 310],
        backgroundColor: '#000000',
      },
      {
        label: 'Bolt',
        data: [280, 295, 310, 340, 365, 350, 275],
        backgroundColor: '#108865',
      },
    ],
  };

  // Platform Distribution
  const platformData = {
    labels: ['Uber', 'Bolt'],
    datasets: [
      {
        data: [55, 45],
        backgroundColor: ['#000000', '#108865'],
        borderWidth: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
    },
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Painel Analítico</h2>
        <p className="text-muted-foreground">Visão geral da performance da frota</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Receita Total</p>
                <h3 className="text-2xl font-bold mt-1">€56.8K</h3>
                <p className="text-xs text-green-600 mt-1">+12.5% vs mês anterior</p>
              </div>
              <div className="h-12 w-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Motoristas Ativos</p>
                <h3 className="text-2xl font-bold mt-1">156</h3>
                <p className="text-xs text-green-600 mt-1">+8 novos este mês</p>
              </div>
              <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <Users className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Viagens Hoje</p>
                <h3 className="text-2xl font-bold mt-1">892</h3>
                <p className="text-xs text-green-600 mt-1">+5.2% vs ontem</p>
              </div>
              <div className="h-12 w-12 bg-gradient-to-br from-[#108865] to-[#0d6b4f] rounded-lg flex items-center justify-center">
                <Car className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Taxa Aprovação</p>
                <h3 className="text-2xl font-bold mt-1">94%</h3>
                <p className="text-xs text-green-600 mt-1">+2% vs mês anterior</p>
              </div>
              <div className="h-12 w-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Evolução da Receita (2026)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <Line data={revenueData} options={chartOptions} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Viagens por Plataforma (Semanal)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <Bar data={tripsData} options={chartOptions} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Plataforma</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <Doughnut data={platformData} options={doughnutOptions} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Indicadores de Desempenho</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold">Retiradas Aprovadas</p>
                    <p className="text-sm text-muted-foreground">Últimas 24h</p>
                  </div>
                </div>
                <span className="text-2xl font-bold">45</span>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-semibold">Pedidos Pendentes</p>
                    <p className="text-sm text-muted-foreground">Retiradas aguardando</p>
                  </div>
                </div>
                <span className="text-2xl font-bold">12</span>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-semibold">Documentos Expirados</p>
                    <p className="text-sm text-muted-foreground">Requerem atenção</p>
                  </div>
                </div>
                <span className="text-2xl font-bold">8</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      <Card>
        <CardHeader>
          <CardTitle>Top 5 Motoristas (Este Mês)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { name: 'Maria Santos', trips: 203, revenue: '€3,890', rating: 4.9 },
              { name: 'João Silva', trips: 147, revenue: '€2,450', rating: 4.8 },
              { name: 'Pedro Costa', trips: 189, revenue: '€3,234', rating: 4.7 },
              { name: 'Ana Ferreira', trips: 176, revenue: '€2,987', rating: 4.9 },
              { name: 'Carlos Mendes', trips: 165, revenue: '€2,756', rating: 4.6 },
            ].map((driver, index) => (
              <div
                key={driver.name}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="h-8 w-8 bg-gradient-to-br from-[#108865] to-[#0d6b4f] rounded-full flex items-center justify-center text-white font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold">{driver.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {driver.trips} viagens • {driver.rating}★
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-[#108865]">{driver.revenue}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
