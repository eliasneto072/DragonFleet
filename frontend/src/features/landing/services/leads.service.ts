// src/features/landing/services/leads.service.ts
//
// O formulário de contacto e os preços — as duas chamadas que a página
// pública faz. Nenhuma precisa de sessão.

import { apiClient } from '@/shared/lib/api-client';

export type TipoDeContacto = 'MOTORISTA' | 'GESTOR';

export interface EntradaDoContacto {
  tipo: TipoDeContacto;
  nome: string;
  telefone: string;
  email?: string | null;
  mensagem?: string | null;
  /**
   * O campo-armadilha: escondido no formulário, e nenhuma pessoa o preenche.
   * Os robôs preenchem tudo o que encontram, e é assim que se distinguem.
   */
  website?: string;
}

export interface PlanoPublico {
  id: string;
  nome: string;
  preco: string;
  duracaoDias: number;
  inclui: { codigo: string; nome: string }[];
}

export const leadsService = {
  registar(entrada: EntradaDoContacto): Promise<{ ok: boolean }> {
    return apiClient.post('/leads', entrada);
  },

  planos(): Promise<{ planos: PlanoPublico[] }> {
    return apiClient.get('/publico/planos');
  },
};
