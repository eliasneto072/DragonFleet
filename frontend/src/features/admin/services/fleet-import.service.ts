// src/features/admin/services/fleet-import.service.ts
//
// Importar as despesas da semana a partir dos PDFs dos portais.

import { apiClient } from '@/shared/lib/api-client';

export interface LinhaPrevista {
  userId: string;
  userName: string;
  vehicleId: string;
  plate: string;
  tollsAmount: number;
  fuelAmount: number;
  chargeAmount: number;
  vehicleFee: number;
  uberAmount: number;
  boltAmount: number;
  /** Preenchido = este motorista NÃO vai ser criado, e diz porquê. */
  bloqueio?: string;
}

export interface FonteLida {
  nome: string;
  presente: boolean;
  totalLido: number | null;
  /** O total que o próprio documento declara. Só a Via Verde o traz. */
  totalDeclarado: number | null;
  confere: boolean;
}

export interface ResultadoAnalise {
  semanaInicio: string;
  semanaFim: string;
  linhas: LinhaPrevista[];
  avisos: string[];
  /** Somado de tudo o que foi lido e não entrou em rascunho nenhum. */
  porAtribuir: number;
  fontes: FonteLida[];
}

export interface ResultadoImportacao extends ResultadoAnalise {
  criados: number;
  ignorados: number;
  falhas: Array<{ userName: string; motivo: string }>;
}

export interface CorpoImportacao {
  semanaInicio: string;
  semanaFim: string;
  viaVerdePdf?: string | null;
  prioFrotaPdf?: string | null;
  prioElectricPdf?: string | null;
  ganhos?: Array<{ userId: string; uberAmount?: number; boltAmount?: number }>;
}

/**
 * Um ficheiro escolhido no disco, em base64.
 *
 * `readAsDataURL` e não `readAsText`: um PDF são bytes, e lê-lo como texto
 * corrompe-o de forma que só aparece do outro lado, com o extrator a devolver
 * zero linhas e nenhuma pista de porquê. O prefixo `data:` que isto traz é
 * removido no servidor.
 */
export function ficheiroParaBase64(ficheiro: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(new Error(`Não consegui ler o ficheiro ${ficheiro.name}.`));
    leitor.readAsDataURL(ficheiro);
  });
}

export const fleetImportService = {
  /** POST /fleet-import/analisar — pré-visualização. Não grava nada. */
  analisar(corpo: CorpoImportacao): Promise<ResultadoAnalise> {
    return apiClient.post('/fleet-import/analisar', corpo);
  },

  /** POST /fleet-import — cria os rascunhos. */
  importar(corpo: CorpoImportacao): Promise<ResultadoImportacao> {
    return apiClient.post('/fleet-import', corpo);
  },
};
