// src/shared/services/extratos.service.ts
//
// A importação de extratos bancários, dos dois lados.
//
// Está em `shared` porque as duas pontas — o portal do motorista e o painel da
// empresa — falam com as mesmas rotas. Dois serviços divergiam no primeiro
// campo novo.

import { apiClient } from '@/shared/lib/api-client';

export type Ambito = 'PESSOAL' | 'EMPRESA';
export type Classe = 'DESPESA' | 'RECEITA' | 'TRANSFERENCIA';
export type Banco = 'ABANCA' | 'NOVO_BANCO' | 'MILLENNIUM' | 'REVOLUT' | 'REVOLUT_BUSINESS';

export const NOME_DO_BANCO: Record<Banco, string> = {
  ABANCA: 'ABANCA',
  NOVO_BANCO: 'Novo Banco',
  MILLENNIUM: 'Millennium BCP',
  REVOLUT: 'Revolut',
  REVOLUT_BUSINESS: 'Revolut Business',
};

export interface ContaDeExtrato {
  id: string;
  bank: Banco;
  scope: Ambito;
  tail: string;
  label: string;
}

export interface MovimentoPrevisto {
  pos: number;
  data: string;
  dataLancamento: string | null;
  descricao: string;
  valor: number;
  saldo: number | null;
  referencia: string | null;
  classe: Classe;
  /** A frase que explica porque foi classificado assim. */
  motivo: string;
  confianca: 'certa' | 'provavel' | 'pelo-sinal' | string;
  /** Vai criar uma despesa? Sugestão do servidor; ele decide. */
  conta: boolean;
}

export interface Previsao {
  banco: Banco;
  ficheiro: { nome: string; hash: string };
  conta: { id: string | null; label: string | null; tail: string | null; nova: boolean };
  periodo: { de: string | null; ate: string | null };
  saldoInicial: number | null;
  saldoFinal: number | null;
  avisos: string[];
  movimentos: MovimentoPrevisto[];
  totais: { despesas: number; receitas: number; transferencias: number };
}

export interface ExtratoImportado {
  id: string;
  conta: { id: string; label: string; bank: Banco; tail: string };
  nome: string | null;
  de: string | null;
  ate: string | null;
  saldoInicial: number | null;
  saldoFinal: number | null;
  movimentos: number;
  importadoEm: string;
}

export const extratosService = {
  contas: (ambito: Ambito) =>
    apiClient.get<{ contas: ContaDeExtrato[] }>(`/extratos/contas?ambito=${ambito}`),

  /**
   * Lê o PDF e devolve o que lá está. NÃO grava nada.
   *
   * O campo do ficheiro tem de se chamar `extrato`: é o que a rota espera, e
   * qualquer outro nome faz o servidor receber um pedido sem ficheiro.
   */
  prever: (ambito: Ambito, ficheiro: File) => {
    const form = new FormData();
    form.append('ambito', ambito);
    form.append('extrato', ficheiro);
    return apiClient.upload<Previsao>('/extratos/prever', form);
  },

  importar: (corpo: {
    ambito: Ambito;
    contaId?: string | null;
    novaConta?: { banco: Banco; tail: string; label: string } | null;
    ficheiro: { nome: string; hash: string };
    periodo: { de: string | null; ate: string | null };
    saldoInicial: number | null;
    saldoFinal: number | null;
    movimentos: MovimentoPrevisto[];
  }) =>
    apiClient.post<{ extratoId: string; movimentos: number; despesasCriadas: number }>(
      '/extratos/importar', corpo,
    ),

  listar: (ambito: Ambito) =>
    apiClient.get<{ extratos: ExtratoImportado[] }>(`/extratos?ambito=${ambito}`),

  apagar: (ambito: Ambito, id: string) =>
    apiClient.delete<void>(`/extratos/${id}?ambito=${ambito}`),
};
