// src/features/admin/services/empresa.service.ts
//
// As contas da empresa: lucro, caixa e despesas.
//
// Só da frota da casa (`soDaCasa` do lado do servidor) e só para o
// administrador dela. Não é uma funcionalidade que se venda.

import { apiClient } from '@/shared/lib/api-client';
import type { Periodo } from '@/features/driver/periodo';

function query(p?: Periodo): string {
  if (!p?.de && !p?.ate) return '';
  const partes: string[] = [];
  if (p?.de) partes.push(`de=${p.de}`);
  if (p?.ate) partes.push(`ate=${p.ate}`);
  return `?${partes.join('&')}`;
}

export interface LinhaDeMes {
  mes: string;
  receita: number;
  despesas: number;
  lucro: number;
}

export interface Lucro {
  /** Alugueres de carros da frota, sem os do dono. */
  alugueres: number;
  /** Slots de quem traz carro próprio. */
  slots: number;
  comissoes: number;
  /** O líquido das semanas do dono, que entra por inteiro. */
  doDono: number;
  receita: number;
  despesas: number;
  /** Negativo é prejuízo. */
  lucro: number;
  /** `null` enquanto não houver receita. */
  margem: number | null;
  porMes: LinhaDeMes[];
  porCategoria: { categoriaId: string | null; nome: string; total: number }[];
}

export interface Caixa {
  /** O saldo declarado do banco. */
  declarado: number;
  declaradoEm: string | null;
  /** O que se deve aos motoristas, hoje. Calculado, exacto. */
  dosMotoristas: number;
  /** Pode ser negativo, e aí é um aviso. */
  livre: number;
  diasDesdeADeclaracao: number | null;
  nota: string | null;
}

export interface DespesaDaEmpresa {
  id: string;
  categoria: { id: string; name: string } | null;
  valor: number;
  quando: string;
  fornecedor: string | null;
  notas: string | null;
  recibo: string | null;
  lancadaPor: string | null;
}

export interface CategoriaDaEmpresa {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

export interface CorpoDaDespesa {
  categoryId?: string | null;
  amount: string | number;
  spentOn: string;
  supplier?: string | null;
  notes?: string | null;
}

export const empresaService = {
  lucro: (p?: Periodo) => apiClient.get<Lucro>(`/empresa/lucro${query(p)}`),

  caixa: () => apiClient.get<Caixa>('/empresa/caixa'),

  historicoDeCaixa: () => apiClient.get<{
    historico: { id: string; saldo: number; quando: string; nota: string | null }[];
  }>('/empresa/caixa/historico'),

  declararSaldo: (saldo: string | number, quando: string, nota?: string | null) =>
    apiClient.post('/empresa/caixa', { saldo, quando, nota }),

  listarDespesas: (p?: Periodo) =>
    apiClient.get<{ despesas: DespesaDaEmpresa[] }>(`/empresa/despesas${query(p)}`),

  criarDespesa: (corpo: CorpoDaDespesa) =>
    apiClient.post<DespesaDaEmpresa>('/empresa/despesas', corpo),

  actualizarDespesa: (id: string, corpo: CorpoDaDespesa) =>
    apiClient.put<DespesaDaEmpresa>(`/empresa/despesas/${id}`, corpo),

  apagarDespesa: (id: string) => apiClient.delete<void>(`/empresa/despesas/${id}`),

  listarCategorias: () =>
    apiClient.get<{ categorias: CategoriaDaEmpresa[] }>('/empresa/categorias'),

  criarCategoria: (nome: string) =>
    apiClient.post<CategoriaDaEmpresa>('/empresa/categorias', { nome }),

  apagarCategoria: (id: string) => apiClient.delete<void>(`/empresa/categorias/${id}`),
};
