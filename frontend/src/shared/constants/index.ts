export const BRAND = {
  name: 'DragonFleet',
  primaryColor: '#1D1D1D',
  accentColor: '#108865',
} as const;

export const FINANCIAL = {
  minWithdrawal: 50,
  maxWithdrawal: 10000,
  companyCommission: 0.20,
  processingDays: 3,
} as const;

export const DRIVER_STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  pending: 'Pendente',
  suspended: 'Suspenso',
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  approved: 'Aprovado',
  pending: 'Pendente',
  rejected: 'Rejeitado',
  expired: 'Expirado',
  expiring_soon: 'Vencendo em breve',
};

export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  available: 'Disponível',
  in_use: 'Em Uso',
  maintenance: 'Manutenção',
};

export const WITHDRAWAL_METHOD_LABELS: Record<string, string> = {
  pix: 'Pix',
  bank_transfer: 'Transferência Bancária',
  paypal: 'PayPal',
};

export const TICKET_CATEGORY_LABELS: Record<string, string> = {
  technical: 'Técnico',
  financial: 'Financeiro',
  documents: 'Documentos',
  account: 'Conta',
  other: 'Outros',
};