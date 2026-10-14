// src/shared/services/pedidos-de-extrato.service.ts
//
// Os pedidos de esclarecimento sobre uma linha do fecho semanal.
//
// Está em `shared` e não em `features/driver` ou `features/admin` porque as
// duas pontas falam com as mesmas rotas: o motorista pede, a gestão responde.
// Dois serviços — um de cada lado — divergiam no primeiro campo novo.

import { apiClient } from '@/shared/lib/api-client';

/** As linhas do fecho que se podem questionar. Igual ao enum do servidor. */
export type LinhaDoFecho =
  | 'VIA_VERDE' | 'COMBUSTIVEL' | 'CARREGAMENTO' | 'VIATURA'
  | 'OUTRAS_DEDUCOES' | 'IMPOSTO' | 'COMISSAO' | 'UBER' | 'BOLT' | 'OUTRA';

export type EstadoDoPedido = 'ABERTO' | 'RESPONDIDO';

export interface PedidoDeExtrato {
  id: string;
  linha: LinhaDoFecho;
  /** O nome da linha em português, escrito pelo servidor. */
  etiqueta: string;
  /** O que o motorista escreveu. Pode não ter escrito nada. */
  motivo: string | null;
  estado: EstadoDoPedido;
  resposta: string | null;
  /** O extrato anexado, quando houver. */
  ficheiro: string | null;
  respondidoEm: string | null;
  respondidoPor: string | null;
  criadoEm: string;
  motorista?: { id: string; nome: string };
  fecho?: { id: string; semanaInicio: string; semanaFim: string };
}

/** Uma linha do fecho e se dá para pedir sobre ela agora. */
export interface LinhaQuestionavel {
  linha: LinhaDoFecho;
  etiqueta: string;
  valor: number;
  pedidoAberto: boolean;
  jaRespondido: boolean;
  disponivel: boolean;
  /** Porque não, quando não dá. Já escrito para se mostrar tal e qual. */
  motivo: string | null;
}

export interface PedidosDoFecho {
  pedidos: PedidoDeExtrato[];
  linhas: LinhaQuestionavel[];
  /** Só o próprio motorista pede. A gestão vê e responde. */
  podePedir: boolean;
  maximoDeAbertos: number;
}

export const pedidosDeExtratoService = {
  /** Os pedidos de uma semana, e que linhas é que ainda dão para pedir. */
  doFecho: (settlementId: string) =>
    apiClient.get<PedidosDoFecho>(`/settlements/${settlementId}/pedidos`),

  criar: (settlementId: string, corpo: { line: LinhaDoFecho; reason?: string | null }) =>
    apiClient.post<{ pedido: PedidoDeExtrato }>(
      `/settlements/${settlementId}/pedidos`, corpo,
    ),

  /** A fila da gestão. Sem estado, vêm os abertos e os respondidos. */
  listar: (estado?: EstadoDoPedido) =>
    apiClient.get<{ pedidos: PedidoDeExtrato[] }>(
      `/settlements/pedidos${estado ? `?status=${estado}` : ''}`,
    ),

  meus: () => apiClient.get<{ pedidos: PedidoDeExtrato[] }>('/settlements/pedidos/meus'),

  /**
   * Responder: texto, extrato, ou os dois — num pedido só.
   *
   * O campo do ficheiro tem de se chamar `extrato`, que é o que o
   * `upload.single('extrato')` da rota espera. Qualquer outro nome faz o multer
   * ignorar o ficheiro, e a resposta fica sem anexo sem erro nenhum.
   */
  responder: (id: string, corpo: { answer?: string | null; extrato?: File | null }) => {
    const form = new FormData();
    if (corpo.answer) form.append('answer', corpo.answer);
    if (corpo.extrato) form.append('extrato', corpo.extrato);
    return apiClient.upload<{ pedido: PedidoDeExtrato }>(
      `/settlements/pedidos/${id}/responder`, form,
    );
  },

  /** O motorista retira um pedido ainda sem resposta. */
  retirar: (id: string) => apiClient.delete<void>(`/settlements/pedidos/${id}`),
};
