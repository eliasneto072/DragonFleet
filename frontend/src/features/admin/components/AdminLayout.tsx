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

import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, DollarSign, Car, TrendingUp,
  Settings, FileText, MessageCircle, Bell, ReceiptText, FileSpreadsheet,
  ShieldCheck, PiggyBank, Trophy, Landmark, Handshake, Gauge, FileUp, CalendarClock,
  Wrench, Boxes, Lock, AlertTriangle, Package,
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

/**
 * As funcionalidades do catálogo, com o nome e a descrição para a tela do
 * cadeado. É uma cópia curta do catálogo do servidor — só o que o painel
 * precisa de mostrar, e nunca o que decide o acesso.
 */
export const FUNCIONALIDADES_DO_MENU: { codigo: string; nome: string; descricao: string }[] = [
  { codigo: 'DRIVERS', nome: 'Motoristas', descricao: 'Fichas dos motoristas, saldos e histórico.' },
  { codigo: 'DOCUMENTS', nome: 'Documentos', descricao: 'Receber, validar e vigiar as validades.' },
  { codigo: 'FLEET', nome: 'Frotas', descricao: 'Os carros: atribuições, inspeções e seguros.' },
  { codigo: 'OFICINA', nome: 'Oficina', descricao: 'Marcações de reparação, oficinas e mecânicos.' },
  { codigo: 'MATERIAL', nome: 'Material', descricao: 'Stock de peças e consumíveis, com os preços de compra.' },
  { codigo: 'RANKS', nome: 'Níveis', descricao: 'A escada de níveis dos motoristas e as vantagens de cada um.' },
  { codigo: 'SETTLEMENTS', nome: 'Faturação', descricao: 'O fecho semanal: o que entrou, o que saiu, o que se credita.' },
  { codigo: 'IMPORTAR', nome: 'Importar despesas', descricao: 'Carregar ficheiros das plataformas em vez de escrever à mão.' },
  { codigo: 'FINANCIAL', nome: 'Financeiro', descricao: 'Retiradas, ajustes e movimentos de banca.' },
  { codigo: 'AGENDAMENTOS', nome: 'Agendamentos', descricao: 'Pagamentos e descontos marcados para datas futuras.' },
  { codigo: 'GREEN_RECEIPTS', nome: 'Recibos Verdes', descricao: 'Os recibos dos motoristas, por empresa.' },
  { codigo: 'ANALYTICS', nome: 'Análises', descricao: 'Receitas, margens e evolução ao longo do tempo.' },
  { codigo: 'ESTATISTICAS', nome: 'Estatísticas', descricao: 'Os números da frota em bruto, por carro e por motorista.' },
  { codigo: 'NOTIFICATIONS', nome: 'Notificações', descricao: 'Avisos automáticos e mensagens para os motoristas.' },
  { codigo: 'SUPPORT', nome: 'Suporte', descricao: 'Os pedidos de ajuda dos motoristas, em tickets.' },
  { codigo: 'SETTINGS', nome: 'Configurações', descricao: 'Comissão, impostos e limites da frota.' },
  { codigo: 'TEAM', nome: 'Equipa', descricao: 'Contas de gestor e as permissões de cada uma.' },
];

interface Entrada {
  to: string;
  icon: LucideIcon;
  label: string;
  area: Area;
  /**
   * A funcionalidade do plano a que esta entrada pertence.
   *
   * Ausente quer dizer "não se vende": é o caso do Dashboard (vai em todos os
   * planos) e das três entradas de investimento, que são da casa. Para essas
   * usa-se `soDaCasa` em vez disto.
   */
  funcionalidade?: string;
  /** Só a frota da casa vê esta entrada. Investimentos, investidores, projetos. */
  soDaCasa?: true;
  /** O contrário: só as frotas CLIENTES. A casa não compra planos a ninguém. */
  soClientes?: true;
  /** Só o administrador da frota, e não toda a equipa. Quem paga é quem decide. */
  soAdmin?: true;
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
      { to: '/app/admin/drivers',    icon: Users,           label: 'Motoristas',  area: 'DRIVERS', funcionalidade: 'DRIVERS' },
      { to: '/app/admin/documents',  icon: FileText,        label: 'Documentos',  area: 'DOCUMENTS', funcionalidade: 'DOCUMENTS' },
      // As três entradas da Frota repartem as pendências da área entre si.
      {
        to: '/app/admin/fleet', icon: Car, label: 'Frotas', area: 'FLEET', funcionalidade: 'FLEET',
        fontes: ['inspections', 'vehiclesPending'],
      },
      {
        to: '/app/admin/oficina', icon: Wrench, label: 'Oficina', area: 'FLEET', funcionalidade: 'OFICINA',
        fontes: [
          'bookingsPropostas', 'bookingsSemAcompanhante', 'bookingsPorConcluir',
          'bookingsPendentes', 'bookingsAgendadas',
        ],
      },
      {
        to: '/app/admin/material', icon: Boxes, label: 'Material', area: 'FLEET', funcionalidade: 'MATERIAL',
        fontes: ['materialsLow'],
      },
      { to: '/app/admin/ranks',      icon: Trophy,          label: 'Níveis',      area: 'RANKS', funcionalidade: 'RANKS' },
    ],
  },
  {
    titulo: 'Dinheiro',
    entradas: [
      // Rótulo curto de propósito: a barra lateral tem cerca de 200px úteis e
      // "Registo semanal de faturação" quebraria em três linhas. O nome
      // completo é o título da página.
      {
        to: '/app/admin/settlements', icon: ReceiptText, label: 'Faturação', area: 'SETTLEMENTS', funcionalidade: 'SETTLEMENTS',
        fontes: ['earningsPending', 'missingSettlements'],
      },
      // A importação não tem pendências próprias: lista vazia para não herdar
      // as da Faturação, que se tratam no ecrã ao lado.
      { to: '/app/admin/importar',       icon: FileUp,          label: 'Importar',       area: 'SETTLEMENTS', funcionalidade: 'IMPORTAR', fontes: [] },
      {
        to: '/app/admin/financial', icon: DollarSign, label: 'Financeiro', area: 'FINANCIAL', funcionalidade: 'FINANCIAL',
        fontes: ['withdrawalsPending', 'bankPending'],
      },
      {
        to: '/app/admin/agendamentos', icon: CalendarClock, label: 'Agendamentos', area: 'FINANCIAL', funcionalidade: 'AGENDAMENTOS',
        fontes: ['scheduledLate'],
      },
      { to: '/app/admin/green-receipts', icon: FileSpreadsheet, label: 'Recibos Verdes', area: 'GREEN_RECEIPTS', funcionalidade: 'GREEN_RECEIPTS' },
      { to: '/app/admin/analytics',      icon: TrendingUp,      label: 'Análises',       area: 'ANALYTICS', funcionalidade: 'ANALYTICS' },
      // Duas entradas na mesma área, e nenhuma tem pendências: sem a lista
      // vazia, uma fonte nova em ANALYTICS acendia as duas.
      { to: '/app/admin/estatisticas',   icon: Gauge,           label: 'Estatísticas',   area: 'ANALYTICS', funcionalidade: 'ESTATISTICAS', fontes: [] },
    ],
  },
  {
    titulo: 'Investimento',
    entradas: [
      { to: '/app/admin/investments', icon: PiggyBank, label: 'Investimentos', area: 'INVESTMENTS', soDaCasa: true },
      { to: '/app/admin/investors',   icon: Landmark,  label: 'Investidores',  area: 'INVESTORS', soDaCasa: true },
      { to: '/app/admin/projects',    icon: Handshake, label: 'Projetos',      area: 'PROJECTS', soDaCasa: true },
    ],
  },
  {
    titulo: 'Sistema',
    entradas: [
      { to: '/app/admin/notifications', icon: Bell,          label: 'Notificações',  area: 'NOTIFICATIONS', funcionalidade: 'NOTIFICATIONS' },
      { to: '/app/admin/support',       icon: MessageCircle, label: 'Suporte',       area: 'SUPPORT', funcionalidade: 'SUPPORT' },
      { to: '/app/admin/settings',      icon: Settings,      label: 'Configurações', area: 'SETTINGS', funcionalidade: 'SETTINGS' },
      { to: '/app/admin/team',          icon: ShieldCheck,   label: 'Equipa',        area: 'TEAM', funcionalidade: 'TEAM' },
      // ── O meu plano ──
      //
      // Sem `funcionalidade`: nunca leva cadeado, e é o ponto. Esta é a loja,
      // e não se vende o acesso à loja — é para aqui que os cadeados mandam a
      // pessoa. Só o administrador da frota a vê (é quem paga), e a frota da
      // casa não, porque não compra nada a ninguém.
      {
        to: '/app/admin/meu-plano', icon: Package, label: 'O meu plano',
        area: 'DASHBOARD', soAdmin: true, soClientes: true, fontes: [],
      },
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
export function primeiraTelaPermitida(
  can: (a: Area) => boolean,
  /** O plano inclui? Omitido, não há plano a limitar — é o estado antigo. */
  tem: (codigo: string) => boolean = () => true,
): string | null {
  for (const grupo of MENU) {
    for (const e of grupo.entradas) {
      if (!can(e.area)) continue;
      // Uma tela com cadeado não serve de destino: mandava a pessoa para a
      // página a dizer que não pode entrar, como primeira coisa que vê.
      if (e.funcionalidade && !tem(e.funcionalidade)) continue;
      if (e.soDaCasa || e.soClientes) continue;
      return e.to;
    }
  }
  return null;
}

/**
 * O aviso da assinatura, por cima de todas as telas.
 *
 * Três estados e três tons, e o silêncio é um deles: uma frota em dia não vê
 * faixa nenhuma. Um aviso permanente deixa de ser lido ao terceiro dia.
 */
function AvisoDaAssinatura() {
  const { frota } = useAuth();
  if (!frota) return null;

  const { estado, dias } = frota.assinatura;
  if (estado === 'activa' || estado === 'sem_assinatura') return null;

  const expirada = estado === 'expirada';

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
        expirada
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
      }`}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">
          {expirada
            ? 'A assinatura desta frota expirou.'
            : dias === 0
              ? 'A assinatura desta frota acaba hoje.'
              : `A assinatura desta frota acaba em ${dias} dia${dias === 1 ? '' : 's'}.`}
        </p>
        <p className="opacity-90">
          {expirada
            // Dito por inteiro: o que ainda dá e o que não dá. "Expirou" sozinho
            // deixa a pessoa a descobrir os limites um clique de cada vez.
            ? 'Pode consultar e exportar tudo o que já cá está, mas não registar '
              + 'nada de novo até ser renovada. Fale com quem gere a vossa conta.'
            : 'Renove para não interromper os registos. Depois do prazo, o painel '
              + 'fica só de leitura.'}
        </p>
      </div>
    </div>
  );
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
  const { user, can, tem, frota } = useAuth();
  const navigate = useNavigate();

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
        // As áreas da casa — investimentos, investidores, projetos — não se
        // vendem e por isso não levam cadeado: desaparecem. Um cadeado ali
        // era uma montra de uma coisa que não está à venda.
        .filter((e) => !e.soDaCasa || frota?.daCasa !== false)
        .filter((e) => !e.soClientes || frota?.daCasa === false)
        .filter((e) => !e.soAdmin || user?.role === 'ADMIN')
        .map((e): NavItem => {
          // ── O cadeado ──
          //
          // A entrada fica visível e leva à tela que explica de que plano faz
          // parte. É de propósito que não desaparece: um menu que não existe
          // nunca é comprado. Sem número, porque não há trabalho por fazer
          // numa secção a que a frota não chega.
          if (e.funcionalidade && !tem(e.funcionalidade)) {
            return {
              to: `/app/admin/plano/${e.funcionalidade}`,
              icon: Lock,
              label: e.label,
            };
          }

          return {
            to: e.to,
            icon: e.icon,
            label: e.label,
            ...marcaDaEntrada(e, pending),
            // As notificações por ler mandam na entrada delas: é a única que não
            // conta trabalho por fazer, e por isso não vem do /pending.
            ...(e.area === 'NOTIFICATIONS' && porLer > 0
              ? { badge: porLer, badgeTone: 'new' as const }
              : {}),
          };
        }),
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
    // ── O botão que troca para o painel da plataforma ───────────────────────
    //
    // Uma conta, dois painéis. Ele é o dono da plataforma E o administrador da
    // frota dele, e faz as duas coisas no mesmo dia — com duas contas teria de
    // sair e entrar de novo, com dois emails, para ver a lista de clientes e
    // voltar ao trabalho da casa.
    //
    // Só aparece a quem tem a marca. Para todos os outros administradores —
    // que são os das frotas clientes — este botão não existe, e o painel a que
    // ele leva responde 403 a quem lá chegar pelo endereço.
    <AppShell
      navGroups={navGroups}
      area="Painel Administrativo"
      switchLabel={user?.isOwner ? 'Painel da Plataforma' : null}
      onSwitch={user?.isOwner ? () => navigate('/app/sistema') : undefined}
      banner={<AvisoDaAssinatura />}
    />
  );
}
