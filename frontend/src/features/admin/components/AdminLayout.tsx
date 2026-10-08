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
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, DollarSign, Car, TrendingUp,
  Settings, FileText, MessageCircle, Bell, ReceiptText, FileSpreadsheet,
  ShieldCheck, PiggyBank, Trophy, Landmark, Handshake, Gauge, FileUp, CalendarClock,
  Wrench, Boxes,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AppShell, type NavItem } from '@/app/components/AppShell';
import { useAuth } from '@/features/auth/context/AuthContext';
import {
  pendingService, type PendingKey, type PendingSummary,
} from '@/shared/services/pending.service';
import { notificationsService } from '@/features/driver/services/notifications.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { Area } from '@/shared/lib/areas';

interface Entrada {
  to: string;
  icon: LucideIcon;
  label: string;
  area: Area;
  /**
   * As pendências que pertencem a ESTA entrada.
   *
   * Existe porque uma área pode ter várias entradas: a Frota tem três — Frotas,
   * Oficina e Material. Sem isto, o total da área aparecia repetido nas três, e
   * um 5 ao lado de "Material" quando o que havia eram cinco marcações por
   * confirmar é pior do que não mostrar número nenhum.
   *
   * Deixar por preencher é válido e tem um significado: a entrada mostra o
   * total da área. É o que faz uma fonte nova no servidor acender o menu certo
   * sem ser preciso mexer aqui — ver `fontesDaEntrada` abaixo.
   */
  fontes?: PendingKey[];
}

const MENU: { titulo: string; entradas: Entrada[] }[] = [
  {
    titulo: 'Operação',
    entradas: [
      { to: '/app/admin/dashboard',  icon: LayoutDashboard, label: 'Dashboard',   area: 'DASHBOARD' },
      { to: '/app/admin/drivers',    icon: Users,           label: 'Motoristas',  area: 'DRIVERS' },
      { to: '/app/admin/documents',  icon: FileText,        label: 'Documentos',  area: 'DOCUMENTS' },
      // As três entradas da Frota repartem as pendências da área entre si.
      {
        to: '/app/admin/fleet', icon: Car, label: 'Frotas', area: 'FLEET',
        fontes: ['inspections', 'vehiclesPending'],
      },
      {
        to: '/app/admin/oficina', icon: Wrench, label: 'Oficina', area: 'FLEET',
        fontes: [
          'bookingsPropostas', 'bookingsSemAcompanhante', 'bookingsPorConcluir',
          'bookingsPendentes', 'bookingsAgendadas',
        ],
      },
      {
        to: '/app/admin/material', icon: Boxes, label: 'Material', area: 'FLEET',
        fontes: ['materialsLow'],
      },
      { to: '/app/admin/ranks',      icon: Trophy,          label: 'Níveis',      area: 'RANKS' },
    ],
  },
  {
    titulo: 'Dinheiro',
    entradas: [
      // Rótulo curto de propósito: a barra lateral tem cerca de 200px úteis e
      // "Registo semanal de faturação" quebraria em três linhas. O nome
      // completo é o título da página.
      {
        to: '/app/admin/settlements', icon: ReceiptText, label: 'Faturação', area: 'SETTLEMENTS',
        fontes: ['earningsPending', 'missingSettlements'],
      },
      // A importação não tem pendências próprias: lista vazia para não herdar
      // as da Faturação, que se tratam no ecrã ao lado.
      { to: '/app/admin/importar',       icon: FileUp,          label: 'Importar',       area: 'SETTLEMENTS', fontes: [] },
      {
        to: '/app/admin/financial', icon: DollarSign, label: 'Financeiro', area: 'FINANCIAL',
        fontes: ['withdrawalsPending', 'bankPending'],
      },
      {
        to: '/app/admin/agendamentos', icon: CalendarClock, label: 'Agendamentos', area: 'FINANCIAL',
        fontes: ['scheduledLate'],
      },
      { to: '/app/admin/green-receipts', icon: FileSpreadsheet, label: 'Recibos Verdes', area: 'GREEN_RECEIPTS' },
      { to: '/app/admin/analytics',      icon: TrendingUp,      label: 'Análises',       area: 'ANALYTICS' },
      // Duas entradas na mesma área, e nenhuma tem pendências: sem a lista
      // vazia, uma fonte nova em ANALYTICS acendia as duas.
      { to: '/app/admin/estatisticas',   icon: Gauge,           label: 'Estatísticas',   area: 'ANALYTICS', fontes: [] },
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

/**
 * O número e a cor de uma entrada do menu.
 *
 * ─── O QUE CONTA E O QUE NÃO CONTA ──────────────────────────────────────────
 *
 * As pendências informativas (`nivel: 'inform'`) ficam de fora. Um motorista
 * com saldo negativo regulariza-se no próximo fecho, e até lá acendia o menu
 * todos os dias — e um número que nunca chega a zero deixa de ser aviso e
 * passa a decoração. A mesma regra está no servidor, em `totalPorFazer`.
 *
 * ─── AS DUAS CORES ──────────────────────────────────────────────────────────
 *
 * Vermelho se alguma das pendências está atrasada; laranja se estão todas no
 * tempo delas. Quem é que decide o que é "atrasado" é o servidor (mais de três
 * dias à espera, ou prazo vencido), e por isso é igual no menu e no painel.
 */
function marcaDaEntrada(
  entrada: Entrada,
  pending: PendingSummary | undefined,
): { badge?: number; badgeTone?: NavItem['badgeTone'] } {
  if (!pending) return {};

  // Sem lista própria, vale o total da área — é o que faz uma fonte nova no
  // servidor aparecer no menu certo sem mexer neste ficheiro.
  if (entrada.fontes === undefined) {
    const daArea = pending.byArea[entrada.area];
    if (!daArea || daArea.count <= 0) return {};
    return { badge: daArea.count, badgeTone: daArea.late ? 'late' : 'waiting' };
  }

  if (entrada.fontes.length === 0) return {};

  const minhas = pending.sources.filter(
    (f) => entrada.fontes!.includes(f.key) && f.nivel !== 'inform',
  );
  const count = minhas.reduce((s, f) => s + f.count, 0);
  if (count <= 0) return {};

  return { badge: count, badgeTone: minhas.some((f) => f.late) ? 'late' : 'waiting' };
}

export function AdminLayout() {
  const { user, can } = useAuth();

  // ── O que falta fazer, para os números do menu ───────────────────────────
  //
  // A MESMA chave do painel, de propósito: o React Query serve as duas da
  // mesma cache, e é por isso que o menu nunca diz três enquanto o painel diz
  // dois. Um minuto de validade — navegar entre telas não repete a consulta.
  //
  // Esta consulta corre em TODAS as telas do painel, por ser aqui que a
  // moldura vive. É o preço de ter os números sempre certos, e é por isso que
  // o servidor responde a isto com contagens e mais nada.
  const pendingQ = useQuery({
    queryKey: queryKeys.pending.all,
    queryFn: () => pendingService.get(),
    staleTime: 60_000,
    // Um erro aqui não tem de estragar o menu: sem resposta, fica sem números.
    retry: 1,
  });
  const pending = pendingQ.data?.pending;

  // ── As notificações por ler ──────────────────────────────────────────────
  //
  // Fora do /pending de propósito: aquilo conta TRABALHO por fazer, e uma
  // notificação não é trabalho — é novidade. Daí o tom neutro e não o laranja.
  //
  // Os avisos automáticos (inspeções a expirar, marcações novas) chegam à
  // administração por aqui, e sem este número ficavam à espera de alguém
  // decidir abrir o menu por iniciativa própria.
  const notifsQ = useQuery({
    queryKey: queryKeys.notifications.list,
    queryFn: () => notificationsService.list(),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
  const porLer = (notifsQ.data?.notifications ?? []).filter(
    (n) => n.userId === user?.id && !n.read,
  ).length;

  if (user?.role === 'DRIVER') {
    return <Navigate to="/app/driver" replace />;
  }

  const navGroups = MENU
    .map((g) => ({
      title: g.titulo,
      items: g.entradas
        .filter((e) => can(e.area))
        .map((e): NavItem => ({
          to: e.to,
          icon: e.icon,
          label: e.label,
          ...marcaDaEntrada(e, pending),
          // As notificações por ler mandam na entrada delas: é a única que não
          // conta trabalho por fazer, e por isso não vem do /pending.
          ...(e.area === 'NOTIFICATIONS' && porLer > 0
            ? { badge: porLer, badgeTone: 'new' as const }
            : {}),
        })),
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
