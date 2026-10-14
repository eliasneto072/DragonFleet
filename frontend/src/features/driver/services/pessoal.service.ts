// src/features/driver/services/pessoal.service.ts
//
// As finanças pessoais: o diário de trading e as despesas.
//
// Para contas com a marca ligada. Para todas as outras, estas rotas respondem
// 404 — e é de propósito: para quem não a tem, isto não existe.

import { apiClient } from '@/shared/lib/api-client';

export type Direccao = 'LONG' | 'SHORT';

export interface Operacao {
  id: string;
  asset: string;
  broker: string | null;
  direction: Direccao;
  openedAt: string;
  closedAt: string | null;
  size: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  /** Resultado bruto, antes de comissões. */
  result: number;
  fees: number;
  /** `result − fees`. Vem calculado do servidor — ver a nota abaixo. */
  liquido: number;
  /** Variação do preço em percentagem, quando há entrada e saída. */
  retorno: number | null;
  notes: string | null;
}

export interface ResumoDeTrading {
  total: number;
  ganhas: number;
  perdidas: number;
  nulas: number;
  bruto: number;
  comissoes: number;
  liquido: number;
  /** `null` enquanto não houver operações com resultado. */
  taxaDeAcerto: number | null;
  melhor: number | null;
  pior: number | null;
  media: number | null;
}

export interface LinhaDeMes {
  mes: string;
  total: number;
  liquido: number;
}

export interface Categoria {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

export interface Despesa {
  id: string;
  categoria: { id: string; name: string } | null;
  amount: number;
  spentOn: string;
  notes: string | null;
  receiptUrl: string | null;
  /** O saldo já descontou isto. */
  lancadaNoSaldo: boolean;
}

export interface ResumoDeDespesas {
  total: number;
  porMes: LinhaDeMes[];
  porCategoria: { categoriaId: string | null; nome: string; total: number }[];
}

export interface CorpoDaOperacao {
  asset: string;
  broker?: string | null;
  direction: Direccao;
  openedAt: string;
  closedAt?: string | null;
  size?: string | number | null;
  entryPrice?: string | number | null;
  exitPrice?: string | number | null;
  result: string | number;
  fees?: string | number | null;
  notes?: string | null;
}

export interface CorpoDaDespesa {
  categoryId?: string | null;
  amount: string | number;
  spentOn: string;
  notes?: string | null;
  receiptUrl?: string | null;
  receiptKey?: string | null;
}

// ─── PORQUE É QUE NENHUMA DESTAS FUNÇÕES RECEBE UM `userId` ─────────────────
//
// Porque o servidor não o aceitaria. Estas rotas trabalham sempre sobre a
// pessoa da sessão: não há parâmetro onde caiba o id de outra, nem aqui nem
// lá. É a diferença entre uma funcionalidade privada e uma funcionalidade que
// é privada enquanto ninguém experimentar mudar um número no endereço.

export const pessoalService = {
  // ── Trading ──
  listarOperacoes: () =>
    apiClient.get<{ operacoes: Operacao[] }>('/pessoal/trading'),

  resumoDeTrading: () =>
    apiClient.get<{ resumo: ResumoDeTrading; porMes: LinhaDeMes[] }>('/pessoal/trading/resumo'),

  criarOperacao: (corpo: CorpoDaOperacao) =>
    apiClient.post<Operacao>('/pessoal/trading', corpo),

  actualizarOperacao: (id: string, corpo: CorpoDaOperacao) =>
    apiClient.put<Operacao>(`/pessoal/trading/${id}`, corpo),

  apagarOperacao: (id: string) =>
    apiClient.delete<void>(`/pessoal/trading/${id}`),

  // ── Categorias ──
  listarCategorias: () =>
    apiClient.get<{ categorias: Categoria[] }>('/pessoal/categorias'),

  criarCategoria: (nome: string) =>
    apiClient.post<Categoria>('/pessoal/categorias', { nome }),

  apagarCategoria: (id: string) =>
    apiClient.delete<void>(`/pessoal/categorias/${id}`),

  // ── Despesas ──
  listarDespesas: () =>
    apiClient.get<{ despesas: Despesa[] }>('/pessoal/despesas'),

  resumoDeDespesas: () =>
    apiClient.get<ResumoDeDespesas>('/pessoal/despesas/resumo'),

  criarDespesa: (corpo: CorpoDaDespesa) =>
    apiClient.post<Despesa>('/pessoal/despesas', corpo),

  actualizarDespesa: (id: string, corpo: CorpoDaDespesa) =>
    apiClient.put<Despesa>(`/pessoal/despesas/${id}`, corpo),

  apagarDespesa: (id: string) =>
    apiClient.delete<void>(`/pessoal/despesas/${id}`),
};
