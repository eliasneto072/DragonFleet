// src/features/admin/services/meu-plano.service.ts
//
// O plano desta frota, do ponto de vista do cliente.
//
// Em `features/admin` porque é do painel da frota — quem o abre é o
// administrador dela, não o dono da plataforma. O lado de lá (a lista de
// pedidos que chegam) vive em `features/system`.

import { apiClient } from '@/shared/lib/api-client';

export interface PlanoParaCliente {
  id: string;
  nome: string;
  duracaoDias: number;
  preco: string;
  funcionalidades: string[];
  /** É o plano que esta frota tem agora. */
  oMeu: boolean;
  /** O que este plano acrescenta ao actual. Vazio = não acrescenta nada. */
  acrescenta: { codigo: string; nome: string }[];
}

export interface MeuPlano {
  frota: { nome: string };
  atual: {
    nome: string | null;
    preco: string | null;
    duracaoDias: number | null;
    funcionalidades: string[];
    terminaEm: string | null;
    assinatura: { estado: string; dias: number | null };
  };
  disponiveis: PlanoParaCliente[];
  pedidoAberto: {
    id: string; planoNome: string | null; mensagem: string | null; criadoEm: string;
  } | null;
}

export const meuPlanoService = {
  get(): Promise<MeuPlano> {
    return apiClient.get('/meu-plano');
  },

  /** `planoId` nulo quer dizer "nenhum destes, quero falar". */
  pedir(entrada: { planoId?: string | null; mensagem?: string | null }):
  Promise<{ id: string; actualizado: boolean }> {
    return apiClient.post('/meu-plano/pedido', entrada);
  },

  cancelar(id: string): Promise<{ ok: boolean }> {
    return apiClient.delete(`/meu-plano/pedido/${id}`);
  },
};
