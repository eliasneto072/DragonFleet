// src/app/router/index.tsx

import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from '@/app/providers/RootLayout';
import { LandingPage } from '@/features/landing/pages/LandingPage';
import { MotoristasPage } from '@/features/landing/pages/MotoristasPage';
import { GestoresPage } from '@/features/landing/pages/GestoresPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';

import { DriverLayout } from '@/features/driver/components/DriverLayout';
import { AdminLayout } from '@/features/admin/components/AdminLayout';

import { WorkshopLayout } from '@/features/workshop/components/WorkshopLayout';

import DriverDashboardPage from '@/features/driver/pages/DriverDashboardPage';
import WithdrawalsPage from '@/features/driver/pages/WithdrawalsPage';
import PessoalPage from '@/features/driver/pages/PessoalPage';
import DocumentsPage from '@/features/driver/pages/DocumentsPage';
import VehiclesPage from '@/features/driver/pages/VehiclesPage';
import ProfilePage from '@/features/driver/pages/ProfilePage';
import NotificationsPage from '@/features/driver/pages/NotificationsPage';
import SupportPage from '@/features/driver/pages/SupportPage';
import InvestmentsPage from '@/features/driver/pages/InvestmentsPage';
import DriverBookingsPage from '@/features/driver/pages/BookingsPage';
import WorkshopBookingsPage from '@/features/workshop/pages/WorkshopBookingsPage';

import { AdminDashboardPage } from '@/features/admin/pages/AdminDashboardPage';
import { DriversPage } from '@/features/admin/pages/DriversPage';
import { DriverDetailPage } from '@/features/admin/pages/DriverDetailPage'; // ← novo
import { SettlementsPage } from '@/features/admin/pages/SettlementsPage';
import { PedidosDeExtratoPage } from '@/features/admin/pages/PedidosDeExtratoPage';
import { FinancialPage } from '@/features/admin/pages/FinancialPage';
import { ScheduledPaymentsPage } from '@/features/admin/pages/ScheduledPaymentsPage';
import { GreenReceiptsPage } from '@/features/admin/pages/GreenReceiptsPage';
import { FleetPage } from '@/features/admin/pages/FleetPage';
import { EmpresaPage } from '@/features/admin/pages/EmpresaPage';
import { BookingsPage } from '@/features/admin/pages/BookingsPage';
import { MaterialsPage } from '@/features/admin/pages/MaterialsPage';
import { VehicleDetailPage } from '@/features/admin/pages/VehicleDetailPage';
import { AssignmentLookupPage } from '@/features/admin/pages/AssignmentLookupPage';
import { AnalyticsPage } from '@/features/admin/pages/AnalyticsPage';
import { FleetStatsPage } from '@/features/admin/pages/FleetStatsPage';
import { ExpenseImportPage } from '@/features/admin/pages/ExpenseImportPage';
import { NotificationsAdminPage } from '@/features/admin/pages/NotificationsAdminPage';
import { SettingsPage } from '@/features/admin/pages/SettingsPage';
import { DocumentsAdminPage } from '@/features/admin/pages/DocumentsAdminPage';
import { SupportAdminPage } from '@/features/admin/pages/SupportAdminPage';
import { TeamPage } from '@/features/admin/pages/TeamPage';
import { InvestmentsAdminPage } from '@/features/admin/pages/InvestmentsAdminPage';
import { RanksPage } from '@/features/admin/pages/RanksPage';
import { InvestorsPage } from '@/features/admin/pages/InvestorsPage';
import { ProjectsPage } from '@/features/admin/pages/ProjectsPage';
import { AdminOnly, RequireArea } from '@/features/admin/components/AdminOnly';
import { SystemLayout } from '@/features/system/components/SystemLayout';
import { FleetsPage } from '@/features/system/pages/FleetsPage';
import { PlansPage } from '@/features/system/pages/PlansPage';
import { PlanoNecessarioPage } from '@/features/admin/pages/PlanoNecessarioPage';
import { MeuPlanoPage } from '@/features/admin/pages/MeuPlanoPage';
import { RequestsPage } from '@/features/system/pages/RequestsPage';
import { LeadsPage } from '@/features/system/pages/LeadsPage';
import { PessoaisPage } from '@/features/system/pages/PessoaisPage';

export const router = createBrowserRouter([

  // ── Rotas públicas ───────────────────────────────────────────────────────
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  // As duas portas da página inicial. Páginas públicas, sem guarda nenhuma.
  { path: '/motoristas', element: <MotoristasPage /> },
  { path: '/gestores', element: <GestoresPage /> },
  { path: '/register', element: <RegisterPage /> },
  // O link do convite. A mesma página: ela lê o código e decide o que mostrar.
  //
  // Duas rotas e não uma com parâmetro opcional porque o /register sem código
  // continua a existir de propósito — é onde se explica que o registo é por
  // convite a quem chegue ali por um link antigo ou por hábito.
  { path: '/register/:code', element: <RegisterPage /> },

  // ── Rotas protegidas ─────────────────────────────────────────────────────
  {
    path: '/app',
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/app/driver" replace /> },

      // ── O portal da oficina ───────────────────────────────────────────
      //
      // Fica sob /app porque partilha a sessão e a guarda de autenticação. O
      // RootLayout manda para cá qualquer conta de mecânico que tente outra
      // rota: as outras telas pedem dados que o servidor lhe recusa, e o que
      // ela veria era uma aplicação cheia de erros.
      {
        path: 'oficina',
        element: <WorkshopLayout />,
        children: [
          { index: true, element: <WorkshopBookingsPage /> },
        ],
      },

      {
        path: 'driver',
        element: <DriverLayout />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <DriverDashboardPage /> },
          { path: 'withdrawals', element: <WithdrawalsPage /> },
          { path: 'investments', element: <InvestmentsPage /> },
          { path: 'documents', element: <DocumentsPage /> },
          { path: 'vehicles', element: <VehiclesPage /> },
          { path: 'oficina', element: <DriverBookingsPage /> },
          // As finanças pessoais. A rota existe para toda a gente — esconder
          // uma rota nunca guardou nada — e é a própria página que manda de
          // volta ao painel quem não tiver a marca. A guarda que conta está
          // no servidor, que responde 404 a estas chamadas.
          { path: 'pessoal', element: <PessoalPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'support', element: <SupportPage /> },
        ],
      },

      // ── O painel da plataforma ────────────────────────────────────────
      //
      // Separado de 'admin' e não uma tela dentro dele: é outro painel, com
      // outro menu e outra condição de entrada. Aqui não há áreas — ou é o
      // dono da plataforma, ou o SystemLayout manda-o para o painel da frota.
      // A guarda a sério está no servidor, que responde 403 a quem chegue aqui
      // pelo endereço.
      {
        path: 'sistema',
        element: <SystemLayout />,
        children: [
          { index: true, element: <Navigate to="frotas" replace /> },
          { path: 'frotas', element: <FleetsPage /> },
          { path: 'planos', element: <PlansPage /> },
          { path: 'pedidos', element: <RequestsPage /> },
          { path: 'contactos', element: <LeadsPage /> },
          { path: 'pessoais', element: <PessoaisPage /> },
        ],
      },

      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },

          // Cada tela declara a ÁREA a que pertence. Quem não a tiver é
          // mandado para a primeira que puder abrir — a guarda a sério está
          // no servidor, isto é para a interface não prometer o que não pode
          // cumprir.
          { path: 'dashboard',      element: <RequireArea area="DASHBOARD"><AdminDashboardPage /></RequireArea> },
          { path: 'drivers',        element: <RequireArea area="DRIVERS" funcionalidade="DRIVERS"><DriversPage /></RequireArea> },
          { path: 'drivers/:id',    element: <RequireArea area="DRIVERS" funcionalidade="DRIVERS"><DriverDetailPage /></RequireArea> },
          { path: 'documents',      element: <RequireArea area="DOCUMENTS" funcionalidade="DOCUMENTS"><DocumentsAdminPage /></RequireArea> },
          // As contas da empresa. Sem `RequireArea` e sem funcionalidade: não
          // é uma área do painel nem se vende — é a contabilidade de UMA
          // empresa, a da casa. A guarda está no servidor (`soDaCasa` mais
          // `requireAdmin`), que é onde as guardas contam.
          { path: 'empresa', element: <EmpresaPage /> },
          { path: 'fleet',          element: <RequireArea area="FLEET" funcionalidade="FLEET"><FleetPage /></RequireArea> },
          // Antes de 'fleet/:id' por legibilidade — o React Router já dá
          // prioridade ao segmento estático, mas quem lê o ficheiro não tem
          // de saber isso para perceber que 'lookup' não é um id.
          { path: 'fleet/lookup',   element: <RequireArea area="FLEET" funcionalidade="FLEET"><AssignmentLookupPage /></RequireArea> },
          { path: 'fleet/:id',      element: <RequireArea area="FLEET" funcionalidade="FLEET"><VehicleDetailPage /></RequireArea> },
          // A oficina é sobre os carros, por isso vive na área da Frota — a
          // mesma que o servidor exige em `/bookings`.
          { path: 'oficina',        element: <RequireArea area="FLEET" funcionalidade="OFICINA"><BookingsPage /></RequireArea> },
          // O material é dos carros, por isso também na área da Frota.
          { path: 'material',       element: <RequireArea area="FLEET" funcionalidade="MATERIAL"><MaterialsPage /></RequireArea> },
          { path: 'ranks',          element: <RequireArea area="RANKS" funcionalidade="RANKS"><RanksPage /></RequireArea> },

          { path: 'settlements',    element: <RequireArea area="SETTLEMENTS" funcionalidade="SETTLEMENTS"><SettlementsPage /></RequireArea> },
          // Os pedidos de esclarecimento sobre uma linha do fecho. Na mesma
          // área da Faturação: é sobre um fecho que se pergunta. Quem só tem
          // VIEW chega aqui de propósito — o suporte precisa de SABER que a
          // pergunta existe; responder é que exige MANAGE, e isso é no servidor.
          { path: 'pedidos-extrato', element: <RequireArea area="SETTLEMENTS" funcionalidade="SETTLEMENTS"><PedidosDeExtratoPage /></RequireArea> },
          // Cria fechos, por isso vive na mesma área da faturação.
          { path: 'importar',       element: <RequireArea area="SETTLEMENTS" funcionalidade="IMPORTAR"><ExpenseImportPage /></RequireArea> },
          { path: 'financial',      element: <RequireArea area="FINANCIAL" funcionalidade="FINANCIAL"><FinancialPage /></RequireArea> },
          // Mexe no saldo, por isso vive na mesma área do resto do dinheiro.
          { path: 'agendamentos',   element: <RequireArea area="FINANCIAL" funcionalidade="AGENDAMENTOS"><ScheduledPaymentsPage /></RequireArea> },
          { path: 'green-receipts', element: <RequireArea area="GREEN_RECEIPTS" funcionalidade="GREEN_RECEIPTS"><GreenReceiptsPage /></RequireArea> },
          { path: 'analytics',      element: <RequireArea area="ANALYTICS" funcionalidade="ANALYTICS"><AnalyticsPage /></RequireArea> },
          { path: 'estatisticas',   element: <RequireArea area="ANALYTICS" funcionalidade="ESTATISTICAS"><FleetStatsPage /></RequireArea> },

          { path: 'investments',    element: <RequireArea area="INVESTMENTS" soDaCasa><InvestmentsAdminPage /></RequireArea> },
          { path: 'investors',      element: <RequireArea area="INVESTORS" soDaCasa><InvestorsPage /></RequireArea> },
          { path: 'projects',       element: <RequireArea area="PROJECTS" soDaCasa><ProjectsPage /></RequireArea> },

          { path: 'notifications',  element: <RequireArea area="NOTIFICATIONS" funcionalidade="NOTIFICATIONS"><NotificationsAdminPage /></RequireArea> },
          { path: 'support',        element: <RequireArea area="SUPPORT" funcionalidade="SUPPORT"><SupportAdminPage /></RequireArea> },
          { path: 'settings',       element: <RequireArea area="SETTINGS" funcionalidade="SETTINGS"><SettingsPage /></RequireArea> },

          // A Equipa fica em AdminOnly e não numa área: é onde se distribuem
          // as permissões, e dá-la por permissão seria dar a chave para
          // alguém se dar todas as outras.
          { path: 'team',           element: <AdminOnly><TeamPage /></AdminOnly> },

          // A tela do cadeado. Sem guarda nenhuma de propósito: quem lá chega
          // é porque uma guarda o mandou para cá, e é aqui que se explica
          // porquê. Pô-la atrás de uma guarda dava um salto infinito.
          { path: 'plano/:codigo',  element: <PlanoNecessarioPage /> },

          // A loja. Sem `funcionalidade` de propósito — é para aqui que os
          // cadeados mandam, e um cadeado na loja não deixava ninguém comprar.
          { path: 'meu-plano',      element: <AdminOnly><MeuPlanoPage /></AdminOnly> },
        ],
      },
    ],
  },
]);