// src/features/driver/services/pessoal.service.ts
//
// As finanças pessoais: o diário de trading e as despesas.
//
// Para contas com a marca ligada. Para todas as outras, estas rotas respondem
// 404 — e é de propósito: para quem não a tem, isto não existe.

import { apiClient } from '@/shared/lib/api-client';
import type { Periodo } from '@/features/driver/periodo';

/**
 * O período, como pedaço de endereço.
 *
 * O filtro é aplicado no SERVIDOR e não aqui: a lista e o total têm de vir da
 * mesma condição. Filtrados em sítios diferentes, bastava um deles tratar o
 * último dia do mês de outra maneira para o total deixar de bater com as
 * linhas à vista.
 */
function query(p?: Periodo): string {
  if (!p?.de && !p?.ate) return '';
  const partes: string[] = [];
  if (p?.de) partes.push(`de=${p.de}`);
  if (p?.ate) partes.push(`ate=${p.ate}`);
  return `?${partes.join('&')}`;
}

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

// ─── CRÉDITOS ───────────────────────────────────────────────────────────────

export interface EstadoDoCredito {
  pagas: number;
  prestacoes: number;
  /** De 0 a 100. É a barra. */
  percentagemPaga: number;
  capitalPago: number;
  emDivida: number;
  jurosPagos: number;
  jurosPorPagar: number;
  jurosTotais: number;
  totalAPagar: number;
  ultimoPagamento: { n: number; quando: string; prestacao: number } | null;
  proximoPagamento: { n: number; quando: string; prestacao: number } | null;
  fim: string | null;
  terminado: boolean;
}

export interface AnoDeJuros {
  ano: number;
  pago: number;
  juro: number;
  capital: number;
  percentagemEmJuros: number;
}

export interface Credito {
  id: string;
  nome: string;
  credor: string | null;
  capital: number;
  inicio: string;
  prestacoes: number;
  prestacaoDoContrato: number | null;
  prestacaoEmVigor: number;
  tan: number;
  taeg: number | null;
  mtic: number | null;
  notas: string | null;
  liquidado: boolean;
  liquidadoEm: string | null;
  estado: EstadoDoCredito;
  porAno: AnoDeJuros[];
  /**
   * A prestação do contrato bate certo com as contas?
   *
   * `null` quando não foi escrita. Quando foi e não bate, há um engano a
   * copiar o contrato — e o quadro inteiro está errado sem nada no ecrã a
   * denunciá-lo.
   */
  conferencia: { bate: boolean; calculada: number; diferenca: number } | null;
}

export interface ResumoDeCreditos {
  aCorrer: number;
  total: number;
  emDivida: number;
  prestacaoMensal: number;
  jurosPagos: number;
  jurosPorPagar: number;
  jurosTotais: number;
  porAno: AnoDeJuros[];
}

export interface CorpoDeCredito {
  name: string;
  lender?: string | null;
  principal: string | number;
  startedOn: string;
  installments: string | number;
  monthlyPayment?: string | number | null;
  tan?: string | number | null;
  taeg?: string | number | null;
  mtic?: string | number | null;
  notes?: string | null;
  closedOn?: string | null;
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
  listarOperacoes: (p?: Periodo) =>
    apiClient.get<{ operacoes: Operacao[] }>(`/pessoal/trading${query(p)}`),

  resumoDeTrading: (p?: Periodo) =>
    apiClient.get<{ resumo: ResumoDeTrading; porMes: LinhaDeMes[] }>(
      `/pessoal/trading/resumo${query(p)}`,
    ),

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

  // ── Créditos ──
  listarCreditos: () =>
    apiClient.get<{ creditos: Credito[] }>('/pessoal/creditos'),

  resumoDeCreditos: () =>
    apiClient.get<ResumoDeCreditos>('/pessoal/creditos/resumo'),

  criarCredito: (corpo: CorpoDeCredito) =>
    apiClient.post<Credito>('/pessoal/creditos', corpo),

  actualizarCredito: (id: string, corpo: CorpoDeCredito) =>
    apiClient.put<Credito>(`/pessoal/creditos/${id}`, corpo),

  apagarCredito: (id: string) =>
    apiClient.delete<void>(`/pessoal/creditos/${id}`),

  // ── Despesas ──
  listarDespesas: (p?: Periodo) =>
    apiClient.get<{ despesas: Despesa[] }>(`/pessoal/despesas${query(p)}`),

  resumoDeDespesas: (p?: Periodo) =>
    apiClient.get<ResumoDeDespesas>(`/pessoal/despesas/resumo${query(p)}`),

  criarDespesa: (corpo: CorpoDaDespesa) =>
    apiClient.post<Despesa>('/pessoal/despesas', corpo),

  actualizarDespesa: (id: string, corpo: CorpoDaDespesa) =>
    apiClient.put<Despesa>(`/pessoal/despesas/${id}`, corpo),

  apagarDespesa: (id: string) =>
    apiClient.delete<void>(`/pessoal/despesas/${id}`),
};
