// src/features/system/services/system.service.ts
//
// O painel do dono da plataforma: as frotas clientes e os planos.
//
// Vive em `features/system` e não em `features/admin` de propósito: é outro
// painel, com outra guarda e outro âmbito. Misturar os dois convidava a que uma
// tela de administração de frota chamasse por distração uma rota que atravessa
// todas as frotas.

import { apiClient } from '@/shared/lib/api-client';

export type EstadoDaAssinatura =
  | 'sem_assinatura' | 'activa' | 'termina_em_breve' | 'expirada';

export interface Assinatura {
  estado: EstadoDaAssinatura;
  /** Dias até ao fim. Negativo quando já passou. Nulo sem assinatura. */
  dias: number | null;
}

export interface FrotaNaLista {
  id: string;
  nome: string;
  slug: string;
  activa: boolean;
  nif: string | null;
  telefone: string | null;
  email: string | null;
  notas: string | null;
  criadaEm: string;
  plano: { id: string; nome: string; preco: string; duracaoDias: number } | null;
  terminaEm: string | null;
  assinatura: Assinatura;
  /** É a frota da casa. Não se desliga. */
  daCasa: boolean;
  contagens: { motoristas: number; equipa: number; veiculos: number };
}

export interface ResumoDoSistema {
  frotas: number;
  activas: number;
  aExpirar: number;
  expiradas: number;
}

export interface Plano {
  id: string;
  nome: string;
  duracaoDias: number;
  preco: string;
  funcionalidades: string[];
  notas: string | null;
  activo: boolean;
  /** Quantas frotas estão neste plano. */
  frotas: number;
}

export interface Funcionalidade {
  codigo: string;
  nome: string;
  grupo: string;
  area: string | null;
  descricao: string;
  obrigatoria?: true;
}

export interface EntradaDaFrota {
  nome: string;
  nif?: string | null;
  telefone?: string | null;
  email?: string | null;
  notas?: string | null;
  planoId?: string | null;
  dias?: number;
  gestor: { nome: string; email: string; password: string; telefone?: string | null };
}

export interface EntradaDoPlano {
  nome: string;
  duracaoDias: number;
  preco: number;
  funcionalidades: string[];
  notas?: string | null;
  activo?: boolean;
}

export interface ContaDaFrota {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

export const systemService = {
  /** GET /system/painel — os números do topo e a lista, num pedido só. */
  painel(): Promise<{ resumo: ResumoDoSistema; frotas: FrotaNaLista[] }> {
    return apiClient.get('/system/painel');
  },

  criarFrota(entrada: EntradaDaFrota): Promise<{
    frota: FrotaNaLista; gestor: { id: string; name: string; email: string };
  }> {
    return apiClient.post('/system/frotas', entrada);
  },

  actualizarFrota(
    id: string,
    entrada: Partial<Omit<EntradaDaFrota, 'gestor' | 'dias'>> & { activa?: boolean },
  ): Promise<{ frota: FrotaNaLista }> {
    return apiClient.patch(`/system/frotas/${id}`, entrada);
  },

  /** Sem `dias`, vale a duração do plano da frota. */
  renovar(id: string, dias?: number): Promise<{ frota: FrotaNaLista }> {
    return apiClient.post(`/system/frotas/${id}/renovar`, dias ? { dias } : {});
  },

  contas(id: string): Promise<{ contas: ContaDaFrota[] }> {
    return apiClient.get(`/system/frotas/${id}/contas`);
  },

  planos(): Promise<{ planos: Plano[] }> {
    return apiClient.get('/system/planos');
  },

  criarPlano(entrada: EntradaDoPlano): Promise<{ plano: Plano }> {
    return apiClient.post('/system/planos', entrada);
  },

  actualizarPlano(id: string, entrada: Partial<EntradaDoPlano>): Promise<{ plano: Plano }> {
    return apiClient.patch(`/system/planos/${id}`, entrada);
  },

  arquivarPlano(id: string): Promise<{ plano: Plano }> {
    return apiClient.post(`/system/planos/${id}/arquivar`, {});
  },

  /** As caixas do editor de planos. Vem do servidor para não haver duas listas. */
  catalogo(): Promise<{
    funcionalidades: Funcionalidade[]; grupos: string[]; obrigatorias: string[];
  }> {
    return apiClient.get('/system/catalogo');
  },
};

/** As durações que o editor sugere. À medida escreve-se o número. */
export const DURACOES = [
  { dias: 30, nome: 'Mensal' },
  { dias: 90, nome: 'Trimestral' },
  { dias: 180, nome: 'Semestral' },
  { dias: 365, nome: 'Anual' },
] as const;

/** O texto e a cor de uma assinatura. A mesma regra em toda a interface. */
export function textoDaAssinatura(a: Assinatura): { texto: string; tom: 'ok' | 'aviso' | 'mau' | 'neutro' } {
  switch (a.estado) {
    case 'sem_assinatura':
      return { texto: 'Sem assinatura', tom: 'neutro' };
    case 'expirada':
      return {
        texto: a.dias === -1 ? 'Expirou ontem' : `Expirou há ${Math.abs(a.dias ?? 0)} dias`,
        tom: 'mau',
      };
    case 'termina_em_breve':
      return {
        texto: a.dias === 0 ? 'Acaba hoje' : `Acaba em ${a.dias} dia${a.dias === 1 ? '' : 's'}`,
        tom: 'aviso',
      };
    default:
      return { texto: `${a.dias} dias`, tom: 'ok' };
  }
}
