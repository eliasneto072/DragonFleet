// src/shared/lib/areas.ts
//
// As áreas do painel, do lado do browser.
//
// É uma CÓPIA da lista que está no servidor (`permissions.catalog.ts`), e isso
// é deliberado: o menu tem de saber desenhar-se antes de qualquer resposta
// chegar, e uma lista que vem da rede obrigaria a um ecrã em branco a cada
// carregamento. A que manda é sempre a do servidor — é ela que recusa os
// pedidos. Esta só decide o que se mostra.
//
// Se as duas divergirem, o sintoma é uma entrada de menu que abre e dá 403.
// Incomodativo, não perigoso.

export const AREAS = [
  'DASHBOARD', 'DRIVERS', 'DOCUMENTS', 'FLEET', 'RANKS',
  'SETTLEMENTS', 'FINANCIAL', 'GREEN_RECEIPTS', 'ANALYTICS',
  'INVESTMENTS', 'INVESTORS', 'PROJECTS',
  'NOTIFICATIONS', 'SUPPORT', 'SETTINGS', 'TEAM',
] as const;

export type Area = (typeof AREAS)[number];
export type Access = 'NONE' | 'VIEW' | 'MANAGE';

const FORCA: Record<Access, number> = { NONE: 0, VIEW: 1, MANAGE: 2 };

export function atLeast(tem: Access | undefined, precisa: Access): boolean {
  return FORCA[tem ?? 'NONE'] >= FORCA[precisa];
}

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

/** Uma frase curta a dizer o que cada área é, para o ecrã das permissões. */
export const DESCRICAO_DA_AREA: Record<Area, string> = {
  DASHBOARD: 'A primeira tela, com os números do dia.',
  DRIVERS: 'A lista de motoristas e a ficha de cada um.',
  DOCUMENTS: 'Validar cartões, cartas e certificados.',
  FLEET: 'Carros, atribuições e histórico.',
  RANKS: 'Os níveis dos motoristas e as vantagens.',
  SETTLEMENTS: 'Registar os fechos semanais.',
  FINANCIAL: 'Retiradas, saldos e dados bancários.',
  GREEN_RECEIPTS: 'Sociedades e classificação dos recibos.',
  ANALYTICS: 'Gráficos e análises da operação.',
  INVESTMENTS: 'Os planos onde os motoristas aplicam.',
  INVESTORS: 'Contas de investidor, depósitos e resgates.',
  PROJECTS: 'Carros financiados e distribuição de lucros.',
  NOTIFICATIONS: 'Enviar avisos aos motoristas.',
  SUPPORT: 'Responder a tickets.',
  SETTINGS: 'Comissão, imposto e limites. Mexe em tudo.',
  TEAM: 'Papéis e permissões de quem trabalha consigo.',
};
