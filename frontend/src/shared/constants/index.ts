export const BRAND = {
  name: 'DragonFleet',
  primaryColor: '#1D1D1D',
  accentColor: '#108865',
} as const;

/**
 * Valores de recurso, usados apenas enquanto as configurações do servidor não
 * chegam.
 *
 * NÃO SÃO A VERDADE. Os limites reais vivem em SystemSettings e são aplicados
 * pelo servidor: durante meses estes números disseram 20% de comissão e 10.000
 * de máximo enquanto o sistema estava em 15% e 5.000, e as telas anunciavam ao
 * motorista regras que não eram cumpridas.
 *
 * Quem precisa dos valores deve ler de GET /settings — ver useSettings.
 */
export const FINANCIAL_FALLBACK = {
  minWithdrawal: 0,
  maxWithdrawal: 0,
  companyCommission: 0,
  processingDays: 1,
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