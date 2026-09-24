// src/shared/lib/query-keys.ts
//
// Todas as query keys do projeto em um só lugar.
// Isso garante que invalidações (após mutations) funcionem corretamente
// e que não existam strings mágicas espalhadas pelo código.
//
// Padrão: array do geral para o específico → permite invalidar por prefixo.
// Ex: queryClient.invalidateQueries({ queryKey: queryKeys.earnings.all })
//     invalida tanto earnings.list quanto earnings.detail(id)

export const queryKeys = {
  // Auth
  auth: {
    me: ['auth', 'me'] as const,
  },

  // Earnings
  earnings: {
    all: ['earnings'] as const,
    list: ['earnings', 'list'] as const,
    listByUser: (userId: string) => ['earnings', 'list', userId] as const,
    detail: (id: string) => ['earnings', 'detail', id] as const,
  },

  // Withdrawals
  withdrawals: {
    all: ['withdrawals'] as const,
    list: ['withdrawals', 'list'] as const,
    listByUser: (userId: string) => ['withdrawals', 'list', userId] as const,
    detail: (id: string) => ['withdrawals', 'detail', id] as const,
  },

  // Documents
  documents: {
    all: ['documents'] as const,
    list: ['documents', 'list'] as const,
    detail: (id: string) => ['documents', 'detail', id] as const,
  },

  // Notifications
  notifications: {
    all: ['notifications'] as const,
    list: ['notifications', 'list'] as const,
    listByUser: (userId: string) => ['notifications', 'list', userId] as const,
    detail: (id: string) => ['notifications', 'detail', id] as const,
  },

  // Vehicles
  vehicles: {
    all: ['vehicles'] as const,
    list: ['vehicles', 'list'] as const,
    listByUser: (userId: string) => ['vehicles', 'list', userId] as const,
    detail: (id: string) => ['vehicles', 'detail', id] as const,
    /** Consulta "quem teve este carro" — a chave inclui os parâmetros para
     *  cada pesquisa ter a sua entrada em cache. */
    lookup: (plate: string, from: string, to: string) =>
      ['vehicles', 'lookup', plate, from, to] as const,
  },

  // Users (admin)
  users: {
    all: ['users'] as const,
    list: ['users', 'list'] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
    /**
     * A lista COMPLETA, sem paginar — para mapas de nomes e seletores.
     *
     * Chave própria e separada da `list`: essa passou a levar pesquisa,
     * filtros e página, e partilhar a chave faria a lista completa ser
     * substituída na cache por uma página de 50. O sintoma seria nomes de
     * motorista a aparecer como travessão, sem erro nenhum.
     */
    allUnpaged: ['users', 'all'] as const,
  },

  // Investimentos. Sob a mesma raiz tudo o que muda quando se aplica ou
  // resgata: invalidar `investments.all` refresca planos (totais do admin),
  // as aplicações do motorista e a vista geral de uma vez.
  investments: {
    all: ['investments'] as const,
    plans: (all: boolean) => ['investments', 'plans', all] as const,
    mine: ['investments', 'mine'] as const,
    forUser: (userId: string) => ['investments', 'user', userId] as const,
    overview: (status: string, planId: string, search: string) =>
      ['investments', 'overview', status, planId, search] as const,
    detail: (id: string) => ['investments', 'detail', id] as const,
    rates: (planId: string) => ['investments', 'rates', planId] as const,
  },

  // Portal do investidor (invest.dragonfleet.pt)
  //
  // Tudo sob a mesma raiz: registar um depósito ou decidir um resgate muda o
  // saldo, o extrato, a lista de contas e os totais da empresa ao mesmo tempo.
  // Invalidar `investors.all` refresca os quatro de uma vez, que é sempre o que
  // se quer — uma tela dessas com um número velho é pior do que um segundo de
  // espera.
  investors: {
    all: ['investors'] as const,
    me: ['investors', 'me'] as const,
    statement: (accountId: string, page: number, kind: string) =>
      ['investors', 'statement', accountId, page, kind] as const,
    monthly: (accountId: string) => ['investors', 'monthly', accountId] as const,
    withdrawals: (accountId: string) => ['investors', 'withdrawals', accountId] as const,
    notifications: ['investors', 'notifications'] as const,
    accounts: ['investors', 'accounts'] as const,
    account: (id: string) => ['investors', 'account', id] as const,
    overview: ['investors', 'overview'] as const,
    pending: ['investors', 'pending'] as const,
  },

  // Projetos de investimento
  //
  // Sob raiz própria mas invalidados junto com `investors.all`: subscrever ou
  // distribuir muda o saldo do investidor E o estado do projeto ao mesmo
  // tempo, e uma das duas telas ficaria com um número velho.
  projects: {
    all: ['projects'] as const,
    list: (status: string, search: string) => ['projects', 'list', status, search] as const,
    detail: (id: string) => ['projects', 'detail', id] as const,
    mine: ['projects', 'mine'] as const,
  },

  // Níveis (ranks)
  ranks: {
    all: ['ranks'] as const,
    configs: ['ranks', 'configs'] as const,
    me: ['ranks', 'me'] as const,
    forUser: (userId: string) => ['ranks', 'user', userId] as const,
    events: (userId: string) => ['ranks', 'events', userId] as const,
    overview: (tier: string, search: string) => ['ranks', 'overview', tier, search] as const,
  },

  // Balance (admin)
  balance: {
    all: ['balance'] as const,
    summary: (userId: string) => ['balance', 'summary', userId] as const,
    adjustments: (userId: string) => ['balance', 'adjustments', userId] as const,
    /** O extrato acumulado. Sob 'balance' de proposito: e a mesma conta que o
     *  resumo, explicada linha a linha — invalidar um deve invalidar o outro. */
    ledger: (userId: string) => ['balance', 'ledger', userId] as const,
  },

  // Dados bancários
  //
  // `mine` e `pending` são vistas distintas do mesmo recurso e não derivam uma
  // da outra: o motorista vê a própria conta, a administração vê a fila de
  // quem espera decisão. Ambas descendem de `all`, para uma aprovação poder
  // invalidar as duas de uma vez.
  bank: {
    all: ['bank'] as const,
    mine: ['bank', 'mine'] as const,
    pending: ['bank', 'pending'] as const,
    byUser: (userId: string) => ['bank', 'user', userId] as const,
  },

  // Suporte
  //
  // Estava definida à mão em dois componentes — admin-support e o do motorista —
  // ambos com ['support','tickets'] escrito literalmente. Funcionava por
  // coincidência: bastava um deles mudar o texto para as invalidações deixarem
  // de se encontrar, e o sintoma seria uma tela desatualizada sem erro nenhum.
  support: {
    all: ['support'] as const,
    tickets: ['support', 'tickets'] as const,
  },

  // Sociedades do recibo verde
  //
  // `all` inclui as inativas e serve a gestão da lista; `active` é o que o
  // seletor da aprovação mostra. São chaves distintas porque respondem a
  // perguntas distintas e uma não deriva da outra.
  companies: {
    root: ['companies'] as const,
    active: ['companies', 'active'] as const,
    all: ['companies', 'all'] as const,
  },

  // Analytics (admin)
  //
  // Em stats o período entra na chave: trocar o selector muda a chave e o
  // React Query busca de novo, mantendo em cache o resultado de cada período.
  // overview não tem período: é sempre o estado atual da fila de trabalho.
  analytics: {
    all: ['analytics'] as const,
    stats: (from?: string, to?: string) =>
      ['analytics', 'stats', from ?? 'default', to ?? 'default'] as const,
    overview: ['analytics', 'overview'] as const,
  },

  // Weekly settlements
  //
  // A única origem de dinheiro na conta do motorista. Invalidar por prefixo
  // (settlements.all) depois de registar ou cancelar: o saldo e o painel
  // dependem disto.
  settlements: {
    all: ['settlements'] as const,
    list: (userId?: string, status?: string) =>
      ['settlements', 'list', userId ?? 'all', status ?? 'all'] as const,
    detail: (id: string) => ['settlements', 'detail', id] as const,
    reported: (userId: string, from: string, to: string) =>
      ['settlements', 'reported', userId, from, to] as const,
  },

  // Settings (admin)
  settings: {
    all: ['settings'] as const,
    detail: ['settings', 'detail'] as const,
  },
};