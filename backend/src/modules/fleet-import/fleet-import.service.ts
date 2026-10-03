// src/modules/fleet-import/fleet-import.service.ts
//
// Três PDFs entram, rascunhos de fecho saem.
//
// ─── O TRABALHO QUE ISTO SUBSTITUI ──────────────────────────────────────────
//
// Abrir o extrato da Via Verde, somar por matrícula à mão, abrir o MyPrio do
// combustível, somar, abrir o dos carregamentos, somar, e depois escrever
// tudo à mão num fecho por motorista. Uma hora por semana, e os erros de conta
// só aparecem quando alguém reclama.
//
// ─── DUAS FASES, E A PRIMEIRA NÃO ESCREVE NADA ──────────────────────────────
//
// `analisar()` lê e devolve o plano: o que vai ser criado, em quem, e todos os
// avisos. Não toca na base de dados.
// `importar()` faz o mesmo e depois cria.
//
// Existem separadas para a tela poder mostrar a pré-visualização antes de
// alguém confirmar. Ninguém devia ter de criar catorze rascunhos para descobrir
// que exportou a semana errada.
//
// ─── O QUE NUNCA ACONTECE AQUI ──────────────────────────────────────────────
//
// Nada é CREDITADO. Todos os fechos nascem em DRAFT, e o crédito continua a ser
// um clique humano no painel, como sempre foi. Foi o pedido do cliente e é
// também a única forma sensata de o fazer: um importador que credita sozinho
// transforma um PDF com um formato novo num pagamento errado.

import { AppError } from '../../shared/errors/AppError';
import { extrairTextoPdf } from './pdf/extrair-texto';
import { lerViaVerde } from './parsers/via-verde';
import { lerPrioFrota } from './parsers/prio-frota';
import { lerPrioElectric } from './parsers/prio-electric';
import { planear, type Plano, type RascunhoPlaneado } from './planear';
import { fleetImportRepository } from './fleet-import.repository';
import { settlementsService } from '../settlements/settlements.service';
import { matchDriver } from '../earnings/import/name-matching';
import type { Actor } from '../settlements/settlements.types';
import type { Leitura } from './parsers/tipos';

/** Ganhos que a extensão já leu da Uber e da Bolt, por motorista. */
export interface GanhosDoMotorista {
  userId: string;
  uberAmount?: number;
  boltAmount?: number;
}

/** O mesmo, identificado pelo nome que o portal mostra. */
export interface GanhosPorNome {
  driverName: string;
  uberAmount?: number;
  boltAmount?: number;
}

export interface EntradaImportacao {
  /** "YYYY-MM-DD" — a semana do FECHO, não a que se exportou da Via Verde. */
  semanaInicio: string;
  semanaFim: string;
  /** Conteúdo dos PDFs em base64. Qualquer um pode faltar. */
  viaVerdePdf?: string | null;
  prioFrotaPdf?: string | null;
  prioElectricPdf?: string | null;
  ganhos?: GanhosDoMotorista[];
  ganhosPorNome?: GanhosPorNome[];
  /** Avançar apesar de uma leitura não conferir. Deixa rasto no fecho. */
  forcar?: boolean;
}

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
  /** Quando preenchido, este motorista NÃO vai ser criado — e diz porquê. */
  bloqueio?: string;
}

export interface ResultadoAnalise {
  semanaInicio: string;
  semanaFim: string;
  linhas: LinhaPrevista[];
  avisos: string[];
  porAtribuir: number;
  /** Por fonte: o que foi lido e se fechou a conta. */
  fontes: Array<{
    nome: string;
    presente: boolean;
    totalLido: number | null;
    totalDeclarado: number | null;
    confere: boolean;
  }>;
}

export interface ResultadoImportacao extends ResultadoAnalise {
  criados: number;
  ignorados: number;
  /** Erros por motorista. Um falhar não impede os outros. */
  falhas: Array<{ userName: string; motivo: string }>;
}

/** "YYYY-MM-DD" para uma data em UTC. Nunca local: veja-se a nota abaixo. */
function dia(texto: string, campo: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw new AppError(`Data inválida em ${campo}: use YYYY-MM-DD.`, 400, 'INVALID_DATE');
  }
  // `new Date('2026-10-12')` já é meia-noite UTC. É de propósito: as semanas
  // são dias de calendário, e construí-las na hora local movia-as um dia para
  // quem estivesse a oeste de Greenwich.
  const d = new Date(`${texto}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(`Data inválida em ${campo}.`, 400, 'INVALID_DATE');
  }
  return d;
}

/**
 * base64 → Buffer, com um limite.
 *
 * O limite existe porque isto entra por uma rota HTTP: sem ele, um pedido com
 * 200 MB de base64 põe o servidor a descomprimir até ficar sem memória.
 */
const LIMITE_PDF = 12 * 1024 * 1024;

function paraBuffer(base64: string | null | undefined, nome: string): Buffer | null {
  if (!base64) return null;
  // Aceita o prefixo `data:application/pdf;base64,` que o navegador produz.
  const limpo = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const buffer = Buffer.from(limpo, 'base64');
  if (buffer.length === 0) {
    throw new AppError(`O ficheiro da ${nome} veio vazio.`, 400, 'EMPTY_FILE');
  }
  if (buffer.length > LIMITE_PDF) {
    throw new AppError(
      `O ficheiro da ${nome} tem ${Math.round(buffer.length / 1024 / 1024)} MB — o limite é 12 MB.`,
      413,
      'FILE_TOO_LARGE',
    );
  }
  return buffer;
}

function ler(
  buffer: Buffer | null,
  leitor: (texto: string) => Leitura,
  nome: string,
): Leitura | null {
  if (!buffer) return null;
  const texto = extrairTextoPdf(buffer);
  if (texto.trim() === '') {
    // Não é uma exceção: é uma leitura que não confere, e o planeador já sabe
    // travar tudo nesse caso. Assim a mensagem chega à tela junto das outras.
    return {
      porMatricula: [],
      semMatricula: { total: 0, ocorrencias: 0 },
      totalLido: 0,
      totalDeclarado: null,
      confere: false,
      avisos: [
        `Não consegui ler texto nenhum do PDF da ${nome}. `
        + 'Confirme que é o ficheiro exportado do portal e não uma digitalização.',
      ],
    };
  }
  return leitor(texto);
}

class FleetImportService {
  private ensureManager(actor: Actor) {
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
      throw new AppError('Sem permissão para importar despesas.', 403, 'FORBIDDEN');
    }
  }

  /** Lê os PDFs e devolve o plano. NÃO escreve nada. */
  async analisar(actor: Actor, entrada: EntradaImportacao): Promise<ResultadoAnalise> {
    this.ensureManager(actor);

    const inicio = dia(entrada.semanaInicio, 'semanaInicio');
    const fim = dia(entrada.semanaFim, 'semanaFim');
    if (inicio > fim) {
      throw new AppError('O início da semana é posterior ao fim.', 400, 'INVALID_RANGE');
    }

    const viaVerde = ler(paraBuffer(entrada.viaVerdePdf, 'Via Verde'), lerViaVerde, 'Via Verde');
    const prioFrota = ler(paraBuffer(entrada.prioFrotaPdf, 'Prio'), lerPrioFrota, 'Prio (combustível)');
    const prioElectric = ler(
      paraBuffer(entrada.prioElectricPdf, 'Prio Electric'), lerPrioElectric, 'Prio (carregamentos)',
    );

    if (!viaVerde && !prioFrota && !prioElectric) {
      throw new AppError('Não enviou nenhum ficheiro.', 400, 'NO_FILES');
    }

    const [veiculos, atribuicoes] = await Promise.all([
      fleetImportRepository.veiculos(),
      fleetImportRepository.atribuicoes(inicio, fim),
    ]);

    const plano = planear({
      semana: { inicio, fim },
      viaVerde,
      prioFrota,
      prioElectric,
      veiculos,
      atribuicoes,
      forcar: entrada.forcar === true,
    });

    const { ganhos, avisos: avisosDeNomes } =
      await this.resolverGanhos(entrada.ganhos ?? [], entrada.ganhosPorNome ?? []);

    const linhas = await this.montarLinhas(plano, veiculos, inicio, fim, ganhos);

    return {
      semanaInicio: entrada.semanaInicio,
      semanaFim: entrada.semanaFim,
      linhas,
      avisos: [...plano.avisos, ...avisosDeNomes],
      porAtribuir: plano.porAtribuir,
      fontes: [
        { nome: 'Via Verde', ...resumo(viaVerde) },
        { nome: 'Prio (combustível)', ...resumo(prioFrota) },
        { nome: 'Prio (carregamentos)', ...resumo(prioElectric) },
      ],
    };
  }

  /**
   * Analisa e cria os rascunhos.
   *
   * Cada fecho é criado pelo `settlementsService`, e não com um insert direto:
   * é ele que resolve a percentagem de comissão em vigor, o imposto, e recusa
   * semanas sobrepostas. Passar-lhe ao lado dava rascunhos com contas que não
   * são as do sistema.
   */
  async importar(actor: Actor, entrada: EntradaImportacao): Promise<ResultadoImportacao> {
    const analise = await this.analisar(actor, entrada);

    let criados = 0;
    let ignorados = 0;
    const falhas: Array<{ userName: string; motivo: string }> = [];

    for (const linha of analise.linhas) {
      if (linha.bloqueio) { ignorados += 1; continue; }
      try {
        await settlementsService.create(actor, {
          userId: linha.userId,
          vehicleId: linha.vehicleId,
          weekStart: analise.semanaInicio,
          weekEnd: analise.semanaFim,
          tollsAmount: linha.tollsAmount,
          fuelAmount: linha.fuelAmount,
          chargeAmount: linha.chargeAmount,
          vehicleFee: linha.vehicleFee,
          uberAmount: linha.uberAmount,
          boltAmount: linha.boltAmount,
          internalNotes:
            `Rascunho criado por importação automática (${analise.semanaInicio} a ${analise.semanaFim}). `
            + (entrada.forcar
              ? 'FORÇADO: uma das leituras não conferia. CONFIRA contra os portais antes de creditar. '
              : 'Confirme os valores antes de creditar.'),
        });
        criados += 1;
      } catch (erro) {
        // Um motorista falhar não pode levar a semana inteira atrás: o resto
        // dos rascunhos é trabalho válido, e quem revê precisa de saber
        // exatamente qual ficou de fora.
        ignorados += 1;
        falhas.push({
          userName: linha.userName,
          motivo: erro instanceof AppError ? erro.message : 'Erro inesperado ao criar o fecho.',
        });
      }
    }

    return { ...analise, criados, ignorados, falhas };
  }

  /**
   * Junta os ganhos vindos por id com os que vêm por nome.
   *
   * O emparelhamento usa a MESMA função da receção de lançamentos — nome
   * completo, e depois primeiro e último. Dois "João Silva" na frota devolvem
   * ambiguidade em vez de escolherem um: um valor lançado à pessoa errada é
   * pior do que um valor em falta, porque o em falta dá nas vistas.
   *
   * Nada do que não emparelhe é adivinhado nem deitado fora: sai em aviso, com
   * o nome e o valor, para quem revê saber onde escrever à mão.
   */
  private async resolverGanhos(
    porId: GanhosDoMotorista[],
    porNome: GanhosPorNome[],
  ): Promise<{ ganhos: GanhosDoMotorista[]; avisos: string[] }> {
    if (porNome.length === 0) return { ganhos: porId, avisos: [] };

    const motoristas = await fleetImportRepository.motoristasParaEmparelhar();
    const avisos: string[] = [];
    const juntos = new Map<string, GanhosDoMotorista>();
    for (const g of porId) juntos.set(g.userId, { ...g });

    for (const linha of porNome) {
      const total = (linha.uberAmount ?? 0) + (linha.boltAmount ?? 0);
      const resultado = matchDriver(linha.driverName, motoristas);

      if (resultado.status !== 'matched') {
        avisos.push(
          `"${linha.driverName}" (${total.toFixed(2)} € de Uber/Bolt) `
          + (resultado.status === 'ambiguous'
            ? `corresponde a mais do que um motorista: ${resultado.candidates.map((c) => c.name).join(', ')}. `
            : 'não corresponde a nenhum motorista da frota. ')
          + 'O valor não foi lançado — escreva-o à mão no rascunho.',
        );
        continue;
      }

      const existente = juntos.get(resultado.userId);
      // Somar e não substituir: o portal pode trazer o mesmo motorista em duas
      // linhas (dois carros, duas contas), e a última a ganhar perdia a
      // primeira sem dizer nada.
      juntos.set(resultado.userId, {
        userId: resultado.userId,
        uberAmount: (existente?.uberAmount ?? 0) + (linha.uberAmount ?? 0),
        boltAmount: (existente?.boltAmount ?? 0) + (linha.boltAmount ?? 0),
      });
    }

    return { ganhos: [...juntos.values()], avisos };
  }

  /** Junta ao plano o nome do motorista, a taxa da viatura e os ganhos. */
  private async montarLinhas(
    plano: Plano,
    veiculos: Array<{ id: string; weeklyFee: number }>,
    inicio: Date,
    fim: Date,
    ganhos: GanhosDoMotorista[],
  ): Promise<LinhaPrevista[]> {
    const ids = [...new Set(plano.rascunhos.map((r) => r.userId))];
    const [nomes, jaComFecho] = await Promise.all([
      fleetImportRepository.nomes(ids),
      fleetImportRepository.jaComFecho(inicio, fim),
    ]);

    const taxaPorVeiculo = new Map(veiculos.map((v) => [v.id, v.weeklyFee]));
    const ganhosPorUser = new Map(ganhos.map((g) => [g.userId, g]));

    return plano.rascunhos.map((r: RascunhoPlaneado) => {
      const g = ganhosPorUser.get(r.userId);
      return {
        userId: r.userId,
        userName: nomes.get(r.userId) ?? r.userId,
        vehicleId: r.vehicleId,
        plate: r.plate,
        tollsAmount: r.tollsAmount,
        fuelAmount: r.fuelAmount,
        chargeAmount: r.chargeAmount,
        // A mesma taxa que o formulário preenche ao escolher o carro. Sem ela
        // o rascunho nascia sem a receita da empresa e o lucro da semana dava
        // menos do que é.
        vehicleFee: taxaPorVeiculo.get(r.vehicleId) ?? 0,
        uberAmount: g?.uberAmount ?? 0,
        boltAmount: g?.boltAmount ?? 0,
        bloqueio: jaComFecho.has(r.userId)
          ? 'Já tem um fecho nesta semana. Não foi criado outro para não duplicar o crédito.'
          : undefined,
      };
    });
  }
}

function resumo(l: Leitura | null) {
  return {
    presente: l !== null,
    totalLido: l ? l.totalLido : null,
    totalDeclarado: l ? l.totalDeclarado : null,
    confere: l ? l.confere : false,
  };
}

export const fleetImportService = new FleetImportService();
