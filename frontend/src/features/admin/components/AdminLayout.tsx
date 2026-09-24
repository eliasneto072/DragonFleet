// src/features/admin/components/AdminLayout.tsx
//
// A moldura do painel de administração: o menu e quem vê o quê.
//
// ─── PORQUE É QUE O MENU TEM GRUPOS ─────────────────────────────────────────
//
// Eram dezasseis entradas numa lista seguida. Ninguém lê dezasseis entradas —
// procura-se a que interessa com os olhos, todas as vezes, e a que se usa
// menos fica escondida no meio das outras. Agrupadas por assunto, encontra-se
// primeiro o grupo e só depois a entrada, e o menu deixa de ser uma lista para
// passar a ser um mapa.
//
// Quatro grupos, quatro ou cinco entradas cada. A ordem dentro do grupo é a do
// trabalho e não a alfabética: primeiro o que se abre todos os dias.
//
// ─── E PORQUE É QUE É CONSTRUÍDO A PARTIR DAS PERMISSÕES ────────────────────
//
// Antes havia duas listas escritas no código a dizer o que cada papel via.
// Agora cada entrada declara a ÁREA a que pertence, e o menu mostra as que a
// pessoa pode abrir. Acrescentar uma tela nova passa a ser declarar a área
// dela — e não lembrar-se de ir a duas listas noutro ficheiro.
//
// Um grupo onde não sobra nenhuma entrada desaparece inteiro, título incluído.

import { Navigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, DollarSign, Car, TrendingUp,
  Settings, FileText, MessageCircle, Bell, ReceiptText, FileSpreadsheet,
  ShieldCheck, PiggyBank, Trophy, Landmark, Handshake,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AppShell, type NavItem } from '@/app/components/AppShell';
import { useAuth } from '@/features/auth/context/AuthContext';
import type { Area } from '@/shared/lib/areas';

interface Entrada {
  to: string;
  icon: LucideIcon;
  label: string;
  area: Area;
}

const MENU: { titulo: string; entradas: Entrada[] }[] = [
  {
    titulo: 'Operação',
    entradas: [
      { to: '/app/admin/dashboard',  icon: LayoutDashboard, label: 'Dashboard',   area: 'DASHBOARD' },
      { to: '/app/admin/drivers',    icon: Users,           label: 'Motoristas',  area: 'DRIVERS' },
      { to: '/app/admin/documents',  icon: FileText,        label: 'Documentos',  area: 'DOCUMENTS' },
      { to: '/app/admin/fleet',      icon: Car,             label: 'Frotas',      area: 'FLEET' },
      { to: '/app/admin/ranks',      icon: Trophy,          label: 'Níveis',      area: 'RANKS' },
    ],
  },
  {
    titulo: 'Dinheiro',
    entradas: [
      // Rótulo curto de propósito: a barra lateral tem cerca de 200px úteis e
      // "Registo semanal de faturação" quebraria em três linhas. O nome
      // completo é o título da página.
      { to: '/app/admin/settlements',    icon: ReceiptText,     label: 'Faturação',      area: 'SETTLEMENTS' },
      { to: '/app/admin/financial',      icon: DollarSign,      label: 'Financeiro',     area: 'FINANCIAL' },
      { to: '/app/admin/green-receipts', icon: FileSpreadsheet, label: 'Recibos Verdes', area: 'GREEN_RECEIPTS' },
      { to: '/app/admin/analytics',      icon: TrendingUp,      label: 'Análises',       area: 'ANALYTICS' },
    ],
  },
  {
    titulo: 'Investimento',
    entradas: [
      { to: '/app/admin/investments', icon: PiggyBank, label: 'Investimentos', area: 'INVESTMENTS' },
      { to: '/app/admin/investors',   icon: Landmark,  label: 'Investidores',  area: 'INVESTORS' },
      { to: '/app/admin/projects',    icon: Handshake, label: 'Projetos',      area: 'PROJECTS' },
    ],
  },
  {
    titulo: 'Sistema',
    entradas: [
      { to: '/app/admin/notifications', icon: Bell,          label: 'Notificações',  area: 'NOTIFICATIONS' },
      { to: '/app/admin/support',       icon: MessageCircle, label: 'Suporte',       area: 'SUPPORT' },
      { to: '/app/admin/settings',      icon: Settings,      label: 'Configurações', area: 'SETTINGS' },
      { to: '/app/admin/team',          icon: ShieldCheck,   label: 'Equipa',        area: 'TEAM' },
    ],
  },
];

/**
 * A primeira tela a que esta pessoa tem acesso.
 *
 * Serve para quem não pode abrir o Dashboard: mandá-lo para lá dava um salto
 * imediato para outro sítio, ou um ecrã em branco. Percorre o menu pela ordem
 * em que está e devolve a primeira entrada que ele pode abrir.
 */
export function primeiraTelaPermitida(can: (a: Area) => boolean): string | null {
  for (const grupo of MENU) {
    for (const e of grupo.entradas) if (can(e.area)) return e.to;
  }
  return null;
}

export function AdminLayout() {
  const { user, can } = useAuth();

  if (user?.role === 'DRIVER') {
    return <Navigate to="/app/driver" replace />;
  }

  const navGroups = MENU
    .map((g) => ({
      title: g.titulo,
      items: g.entradas
        .filter((e) => can(e.area))
        .map(({ to, icon, label }): NavItem => ({ to, icon, label })),
    }))
    // Um grupo sem entradas desaparece com o título: um cabeçalho "Dinheiro"
    // sozinho, sem nada por baixo, é pior do que não existir.
    .filter((g) => g.items.length > 0);

  return (
    // Sem "Ver como Motorista": o botão levava o administrador ao painel do
    // motorista com o próprio id, mostrando dados vazios em vez dos de alguém.
    // A ficha do motorista já reúne saldo, documentos, retiradas, veículos e
    // histórico — que era o que se procurava ali.
    //
    // O caminho inverso, em DriverLayout, fica: um administrador que chegue ao
    // painel do motorista precisa de voltar.
    <AppShell
      navGroups={navGroups}
      area="Painel Administrativo"
    />
  );
}
