// src/modules/permissions/permissions.catalog.ts
//
// O catálogo das áreas do painel, e o que cada papel via ANTES de isto existir.
//
// ─── PORQUE É QUE ESTE FICHEIRO NÃO IMPORTA O PRISMA ────────────────────────
//
// Porque é a definição, não os dados. Fica puro para poder ser testado com
// números escritos à mão e para o frontend poder ter uma cópia da mesma lista
// sem arrastar a base de dados atrás.

export const AREAS = [
  'DASHBOARD', 'DRIVERS', 'DOCUMENTS', 'FLEET', 'RANKS',
  'SETTLEMENTS', 'FINANCIAL', 'GREEN_RECEIPTS', 'ANALYTICS',
  'INVESTMENTS', 'INVESTORS', 'PROJECTS',
  'NOTIFICATIONS', 'SUPPORT', 'SETTINGS', 'TEAM',
] as const;

export type Area = (typeof AREAS)[number];
export type Access = 'NONE' | 'VIEW' | 'MANAGE';

/** Ordem de força. Comparar níveis sem isto seria comparar texto. */
const FORCA: Record<Access, number> = { NONE: 0, VIEW: 1, MANAGE: 2 };

export function atLeast(tem: Access, precisa: Access): boolean {
  return FORCA[tem] >= FORCA[precisa];
}

/** O nome de cada área, para os ecrãs e para os avisos de acesso negado. */
export const NOME_DA_AREA: Record<Area, string> = {
  DASHBOARD: 'Dashboard',
  DRIVERS: 'Motoristas',
  DOCUMENTS: 'Documentos',
  FLEET: 'Frotas',
  RANKS: 'Níveis',
  SETTLEMENTS: 'Faturação',
  FINANCIAL: 'Financeiro',
  GREEN_RECEIPTS: 'Recibos Verdes',
  ANALYTICS: 'Análises',
  INVESTMENTS: 'Investimentos',
  INVESTORS: 'Investidores',
  PROJECTS: 'Projetos',
  NOTIFICATIONS: 'Notificações',
  SUPPORT: 'Suporte',
  SETTINGS: 'Configurações',
  TEAM: 'Equipa',
};

/**
 * Os grupos do menu, e a ordem por que aparecem.
 *
 * Quinze entradas numa lista seguida não se lêem — procura-se a que interessa
 * com os olhos, todas as vezes. Agrupadas por assunto, encontra-se pelo grupo
 * e o menu deixa de ser uma lista para passar a ser um mapa.
 *
 * A ordem dentro de cada grupo é a do trabalho, não a alfabética: primeiro o
 * que se abre todos os dias, depois o que se abre todas as semanas.
 */
export const GRUPOS: { titulo: string; areas: Area[] }[] = [
  { titulo: 'Operação', areas: ['DASHBOARD', 'DRIVERS', 'DOCUMENTS', 'FLEET', 'RANKS'] },
  { titulo: 'Dinheiro', areas: ['SETTLEMENTS', 'FINANCIAL', 'GREEN_RECEIPTS', 'ANALYTICS'] },
  { titulo: 'Investimento', areas: ['INVESTMENTS', 'INVESTORS', 'PROJECTS'] },
  { titulo: 'Sistema', areas: ['NOTIFICATIONS', 'SUPPORT', 'SETTINGS', 'TEAM'] },
];

/**
 * O que cada papel via ANTES de as permissões existirem.
 *
 * É isto que faz este deploy não mudar nada para ninguém no dia em que entra:
 * uma pessoa sem permissões configuradas continua a ver exatamente o que via.
 * Assim que alguém lhe configurar UMA área, passa a valer a configuração e
 * este mapa deixa de a tocar.
 *
 * O ADMIN não está aqui porque não passa por este caminho: tem tudo, sempre.
 */
export const PADRAO_DO_PAPEL: Record<string, Partial<Record<Area, Access>>> = {
  // Via tudo menos Configurações, Recibos Verdes e Equipa.
  MANAGER: Object.fromEntries(
    AREAS.map((a) => [
      a,
      (['SETTINGS', 'GREEN_RECEIPTS', 'TEAM'] as Area[]).includes(a) ? 'NONE' : 'MANAGE',
    ]),
  ) as Partial<Record<Area, Access>>,

  // Lia motoristas, documentos, FECHOS, financeiro, investimentos e níveis;
  // só mexia no suporte.
  //
  // Os FECHOS faltavam neste inventário, e o engano esteve invisível enquanto
  // o `requireArea` não impunha nada — ver area.middleware. Mal a guarda passou
  // a funcionar, o suporte levou 403 em /settlements e /earnings (que estão os
  // dois atrás da área SETTLEMENTS), e o `support-role.integration.test.ts`,
  // que existia antes das permissões, ficou vermelho.
  //
  // O suporte precisa de os ver: a pergunta mais comum num ticket é "porque é
  // que o meu fecho deu este valor". Sem isto, reencaminha tudo para a
  // administração. Só VER — criar e confirmar continua a ser recusado pelos
  // serviços, e os testes "não cria um fecho" e "não confirma um lançamento"
  // continuam a prová-lo.
  SUPPORT: {
    DRIVERS: 'VIEW',
    DOCUMENTS: 'VIEW',
    SETTLEMENTS: 'VIEW',
    FINANCIAL: 'VIEW',
    INVESTMENTS: 'VIEW',
    RANKS: 'VIEW',
    SUPPORT: 'MANAGE',
  },
};

/**
 * Conjuntos prontos, para não ter de carregar em dezasseis interruptores.
 *
 * Não são papéis: são pontos de partida. Aplicar um preenche os dezasseis
 * valores e a partir daí muda-se o que for preciso — que é a diferença entre
 * isto e o sistema de papéis que estava aqui antes.
 */
export const PERFIS: { id: string; nome: string; descricao: string; acessos: Partial<Record<Area, Access>> }[] = [
  {
    id: 'faturacao',
    nome: 'Faturação',
    descricao: 'Regista fechos e vê os motoristas. Não mexe em pagamentos.',
    acessos: {
      DASHBOARD: 'VIEW', DRIVERS: 'VIEW', SETTLEMENTS: 'MANAGE',
      GREEN_RECEIPTS: 'VIEW', FINANCIAL: 'VIEW',
    },
  },
  {
    id: 'suporte',
    nome: 'Suporte',
    descricao: 'Responde a tickets e consulta o que precisa para responder.',
    // Igual ao padrão do papel — ver a nota em PADRAO_DO_PAPEL.SUPPORT.
    acessos: {
      DRIVERS: 'VIEW', DOCUMENTS: 'VIEW', SETTLEMENTS: 'VIEW', FINANCIAL: 'VIEW',
      INVESTMENTS: 'VIEW', RANKS: 'VIEW', SUPPORT: 'MANAGE',
    },
  },
  {
    id: 'frota',
    nome: 'Frota',
    descricao: 'Trata dos carros e dos documentos. Não vê dinheiro.',
    acessos: {
      DASHBOARD: 'VIEW', DRIVERS: 'VIEW', DOCUMENTS: 'MANAGE', FLEET: 'MANAGE',
    },
  },
  {
    id: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Paga retiradas, classifica recibos e vê as análises.',
    acessos: {
      DASHBOARD: 'VIEW', DRIVERS: 'VIEW', SETTLEMENTS: 'VIEW',
      FINANCIAL: 'MANAGE', GREEN_RECEIPTS: 'MANAGE', ANALYTICS: 'VIEW',
    },
  },
  {
    id: 'investimento',
    nome: 'Investimento',
    descricao: 'Trata dos investidores e dos projetos.',
    acessos: {
      DASHBOARD: 'VIEW', INVESTMENTS: 'MANAGE', INVESTORS: 'MANAGE', PROJECTS: 'MANAGE',
    },
  },
  {
    id: 'leitura',
    nome: 'Só leitura',
    descricao: 'Vê tudo, não mexe em nada. Para um contabilista, por exemplo.',
    acessos: Object.fromEntries(
      AREAS.map((a) => [a, (['SETTINGS', 'TEAM'] as Area[]).includes(a) ? 'NONE' : 'VIEW']),
    ) as Partial<Record<Area, Access>>,
  },
  {
    id: 'nada',
    nome: 'Sem acesso',
    descricao: 'Tira tudo. A conta continua a existir mas não entra no painel.',
    acessos: Object.fromEntries(AREAS.map((a) => [a, 'NONE'])) as Partial<Record<Area, Access>>,
  },
];
