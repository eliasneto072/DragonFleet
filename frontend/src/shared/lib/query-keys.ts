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
    all:          ['earnings'] as const,
    list:         ['earnings', 'list'] as const,
    listByUser:   (userId: string) => ['earnings', 'list', userId] as const,
    detail:       (id: string)     => ['earnings', 'detail', id] as const,
  },

  // Withdrawals
  withdrawals: {
    all:          ['withdrawals'] as const,
    list:         ['withdrawals', 'list'] as const,
    listByUser:   (userId: string) => ['withdrawals', 'list', userId] as const,
    detail:       (id: string)     => ['withdrawals', 'detail', id] as const,
  },

  // Documents
  documents: {
    all:          ['documents'] as const,
    list:         ['documents', 'list'] as const,
    detail:       (id: string) => ['documents', 'detail', id] as const,
  },

  // Notifications
  notifications: {
    all:          ['notifications'] as const,
    list:         ['notifications', 'list'] as const,
    listByUser:   (userId: string) => ['notifications', 'list', userId] as const,
    detail:       (id: string)     => ['notifications', 'detail', id] as const,
  },

  // Vehicles
  vehicles: {
    all:          ['vehicles'] as const,
    list:         ['vehicles', 'list'] as const,
    listByUser:   (userId: string) => ['vehicles', 'list', userId] as const,
    detail:       (id: string)     => ['vehicles', 'detail', id] as const,
  },

  // Users (admin)
  users: {
    all:          ['users'] as const,
    list:         ['users', 'list'] as const,
    detail:       (id: string) => ['users', 'detail', id] as const,
  },
};