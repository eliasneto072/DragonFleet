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

export interface Tramo {
  /** A partir de que prestação este valor vale. 1 é a primeira. */
  dePrestacao: number;
  valor: number;
}

/** O estado REAL, contado pelos pagamentos registados. É o que a barra mostra. */
export interface EstadoPorPagamentos {
  pago: number;
  porPagar: number;
  percentagem: number;
  prestacoesPagas: number;
  prestacoesDevidas: number;
  /** Quantas estão em atraso. É a razão de os pagamentos serem registados. */
  emAtraso: number;
  valorEmAtraso: number;
  ultimoPagamento: string | null;
  liquidado: boolean;
}

export interface PontoAcumulado {
  mes: string;
  previsto: number;
  /** Nulo depois de hoje: a linha acaba onde o tempo acabou. */
  pago: number | null;
}

export interface Pagamento {
  id: string;
  quando: string;
  valor: number;
  notas: string | null;
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
  /** Nulo quer dizer «não preenchi», e NUNCA «sem juros». */
  tan: number | null;
  taeg: number | null;
  mtic: number | null;
  /** O que se devolve ao todo. A alternativa à taxa. */
  totalAPagar: number | null;
  tramos: Tramo[];
  totalDoPlano: number | null;
  juroTotal: number | null;
  custo: { total: number; porAno: number } | null;
  pago: EstadoPorPagamentos;
  pagamentosRegistados: number;
  acumulado: PontoAcumulado[];
  notas: string | null;
  liquidado: boolean;
  liquidadoEm: string | null;
  /** Só existe quando há TAN. Nulo nos créditos por plano. */
  estado: EstadoDoCredito | null;
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
  /** O que falta pagar ao todo: pelo quadro com taxa, pelo plano sem ela. */
  emDivida: number;
  prestacaoMensal: number;

  // ── Juros: dois números, e é de propósito ────────────────────────────────
  //
  // Um crédito sem taxa não reparte juro por prestação — ninguém sabe quanto
  // de cada prestação é juro. Os três campos abaixo só contam os créditos COM
  // taxa; `juroSemQuadro` traz o resto, que se sabe ao todo e não se sabe
  // repartir. Quem mostrar isto no ecrã mostra os dois, nunca só o primeiro.
  jurosPagos: number;
  jurosPorPagar: number;
  /** `jurosPagos + jurosPorPagar`. Só os créditos com taxa. */
  jurosTotais: number;
  /** Juro dos créditos sem taxa: total a pagar menos capital, sem repartição. */
  juroSemQuadro: number;
  /** Juro de todos os créditos, com taxa e sem ela. */
  juroDeTudo: number;

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
  /** O que se devolve ao todo. Vazio = não sei. */
  totalToPay?: string | number | null;
  /** «A partir da N.ª prestação, passa a ser X.» */
  tramos?: { dePrestacao: number | string; valor: number | string }[];
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


/**
 * Um campo de data vazio é «sem data», e não uma data por escrever.
 *
 * ─── PORQUE É QUE ISTO EXISTE AQUI E NÃO SÓ NO SERVIDOR ───────────────────
 *
 * O `<input type="date">` por preencher vale `""`, e era isso que o
 * formulário enviava na data de fecho. O servidor recusava com «Data
 * inválida», e o resultado era que NENHUM crédito por liquidar e NENHUMA
 * posição de trading aberta se conseguiam editar.
 *
 * O servidor foi corrigido e é lá que a regra manda. Isto fica como segunda
 * linha: mesmo que um dia alguém volte a apertar a validação do outro lado,
 * daqui não sai um vazio a fingir de data. Custa três linhas e fecha a porta
 * aos dois ecrãs de uma vez.
 */
function semVazios<T extends object>(corpo: T, campos: (keyof T)[]): T {
  // `object` e não `Record<string, unknown>`: os corpos são interfaces, e uma
  // interface não tem índice implícito, por isso não encaixa no Record. O
  // compilador apanhou isto à primeira.
  const out = { ...corpo };
  for (const campo of campos) {
    const v = out[campo];
    if (typeof v === 'string' && v.trim() === '') {
      (out as Record<string, unknown>)[String(campo)] = null;
    }
  }
  return out;
}

export const pessoalService = {
  // ── Trading ──
  listarOperacoes: (p?: Periodo) =>
    apiClient.get<{ operacoes: Operacao[] }>(`/pessoal/trading${query(p)}`),

  resumoDeTrading: (p?: Periodo) =>
    apiClient.get<{ resumo: ResumoDeTrading; porMes: LinhaDeMes[] }>(
      `/pessoal/trading/resumo${query(p)}`,
    ),

  criarOperacao: (corpo: CorpoDaOperacao) =>
    apiClient.post<Operacao>('/pessoal/trading', semVazios(corpo, ['closedAt'])),

  actualizarOperacao: (id: string, corpo: CorpoDaOperacao) =>
    apiClient.put<Operacao>(`/pessoal/trading/${id}`, semVazios(corpo, ['closedAt'])),

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
    apiClient.post<Credito>('/pessoal/creditos', semVazios(corpo, ['closedOn'])),

  actualizarCredito: (id: string, corpo: CorpoDeCredito) =>
    apiClient.put<Credito>(`/pessoal/creditos/${id}`, semVazios(corpo, ['closedOn'])),

  pagamentosDoCredito: (id: string) =>
    apiClient.get<{ pagamentos: Pagamento[] }>(`/pessoal/creditos/${id}/pagamentos`),

  registarPagamento: (id: string, corpo: { paidOn: string; amount: string | number; notes?: string | null }) =>
    apiClient.post<{ pagamento: Pagamento }>(`/pessoal/creditos/${id}/pagamentos`, corpo),

  apagarPagamento: (id: string, pagamentoId: string) =>
    apiClient.delete<void>(`/pessoal/creditos/${id}/pagamentos/${pagamentoId}`),

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
