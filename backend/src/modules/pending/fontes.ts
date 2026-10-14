// src/modules/pending/fontes.ts
//
// O catálogo do que está por fazer, e as regras de quem o vê e do que arde.
//
// ─── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
//
// Cada coisa por fazer vivia dentro do seu menu, e só quem abrisse o menu
// sabia que lá estava. Um ticket de suporte ficava três dias sem resposta não
// por falta de tempo mas porque ninguém tinha motivo para abrir o Suporte
// naquele dia. Com tudo contado num sítio, abrir o painel passa a ser suficiente
// para saber o que falta.
//
// ─── PORQUE É QUE ISTO ESTÁ FORA DO SERVIÇO ─────────────────────────────────
//
// São três regras pequenas e todas com uma forma de falhar silenciosa: um
// contador que aparece a quem não devia ver aquela área, um "informativo" a
// pintar o menu de laranja para sempre, um atraso contado ao contrário. Nada
// disto dá erro — dá um número errado que ninguém desconfia. Aqui testam-se
// em três linhas cada.
//
// ─── E PORQUE É QUE OS CAMINHOS DO MENU NÃO ESTÃO AQUI ──────────────────────
//
// Porque são do browser, e o servidor não tem nada a dizer sobre endereços de
// ecrãs. Cada fonte leva a ÁREA a que pertence; é o painel que decide a que
// menu a área corresponde. Assim um menu pode mudar de endereço sem tocar no
// servidor.

import type { Area } from '../permissions/permissions.catalog';
import { atLeast, type Access } from '../permissions/permissions.catalog';

/**
 * O que fazer com cada fonte.
 *
 *   'resolve' — alguém tem de decidir. Conta para o número do menu.
 *   'open'    — precisa de abrir um ecrã e tratar. Conta para o número.
 *   'inform'  — não há decisão nenhuma; só convém saber. NÃO conta.
 *
 * ─── PORQUE É QUE O 'inform' NÃO CONTA PARA O MENU ──────────────────────────
 *
 * Porque não se esvazia. Um motorista com saldo negativo regulariza-se no
 * próximo fecho, e até lá o número ficava aceso no menu todos os dias. Um
 * contador que nunca chega a zero deixa de ser um aviso e passa a ser
 * decoração — e no dia em que houver mesmo um ticket a arder, já ninguém olha.
 */
export type Nivel = 'resolve' | 'open' | 'inform';

/** As chaves de tudo o que pode estar por fazer. */
export type ChaveDaFonte =
  // Oficina
  | 'bookingsPropostas'        // a oficina contrapôs uma hora: alguém tem de aceitar
  | 'bookingsSemAcompanhante'  // o motorista pediu companhia e ninguém foi designado
  | 'bookingsPorConcluir'      // a hora já passou e a marcação não foi fechada
  | 'bookingsPendentes'        // pedida, à espera de a oficina confirmar
  | 'bookingsAgendadas'        // confirmada, ainda por acontecer
  | 'inspections'              // inspeção a chegar ao fim, ou já fora de prazo
  // Frota
  | 'vehiclesPending'          // carros por ativar
  | 'materialsLow'             // material abaixo do mínimo
  // Dinheiro
  | 'withdrawalsPending'
  | 'bankPending'
  | 'scheduledLate'            // agendamentos com data vencida e não lançados
  | 'negativeDrivers'
  // Faturação
  | 'earningsPending'
  | 'missingSettlements'
  | 'settlementQueries'        // um motorista pediu o extrato de uma linha do fecho
  // Documentos
  | 'documentsPending'
  | 'documentsExpiring'
  // Resto
  | 'supportOpen'
  | 'investorWithdrawals'
  | 'driversBlocked'
  | 'remindersDue';

export interface DefinicaoDaFonte {
  area: Area;
  nivel: Nivel;
  /**
   * O acesso mínimo para ver este contador.
   *
   * 'VIEW' na maioria: quem vê a área deve saber que há trabalho lá. Nas que
   * só servem para decidir — aprovar um IBAN, lançar um fecho — exige-se
   * 'MANAGE': mostrar a quem só pode olhar seria mandá-lo a um ecrã onde o
   * botão está desligado.
   */
  minimo: Access;
}

export const FONTES: Record<ChaveDaFonte, DefinicaoDaFonte> = {
  bookingsPropostas:       { area: 'FLEET',          nivel: 'resolve', minimo: 'MANAGE' },
  bookingsSemAcompanhante: { area: 'FLEET',          nivel: 'open',    minimo: 'MANAGE' },
  bookingsPorConcluir:     { area: 'FLEET',          nivel: 'open',    minimo: 'MANAGE' },
  // ─── AS MARCAÇÕES CONTAM, MESMO AS QUE NÃO PEDEM DECISÃO ─────────────────
  //
  // A primeira versão pôs estas duas em 'inform', com o raciocínio de que uma
  // marcação à espera da oficina não é trabalho nosso. O raciocínio estava
  // errado: um carro com ida à oficina marcada é um carro que vai estar parado
  // naquele dia, e quem gere a frota precisa de o ter à frente dos olhos — para
  // telefonar à oficina que não confirma, e para não atribuir o carro nesse dia.
  //
  // E esvaziam-se sozinhas: a marcação acontece e sai da lista. Não é o caso
  // dos saldos negativos, que é o que o 'inform' existe para arrumar.
  bookingsPendentes:       { area: 'FLEET',          nivel: 'open',    minimo: 'VIEW' },
  bookingsAgendadas:       { area: 'FLEET',          nivel: 'open',    minimo: 'VIEW' },
  inspections:             { area: 'FLEET',          nivel: 'open',    minimo: 'VIEW' },
  vehiclesPending:         { area: 'FLEET',          nivel: 'open',    minimo: 'MANAGE' },
  materialsLow:            { area: 'FLEET',          nivel: 'open',    minimo: 'VIEW' },

  withdrawalsPending:      { area: 'FINANCIAL',      nivel: 'open',    minimo: 'MANAGE' },
  bankPending:             { area: 'FINANCIAL',      nivel: 'open',    minimo: 'MANAGE' },
  scheduledLate:           { area: 'FINANCIAL',      nivel: 'inform',  minimo: 'VIEW' },
  negativeDrivers:         { area: 'FINANCIAL',      nivel: 'inform',  minimo: 'VIEW' },

  earningsPending:         { area: 'SETTLEMENTS',    nivel: 'resolve', minimo: 'MANAGE' },
  missingSettlements:      { area: 'SETTLEMENTS',    nivel: 'open',    minimo: 'MANAGE' },
  // ─── 'resolve' E NÃO 'open' ───────────────────────────────────────────────
  //
  // Porque do outro lado está uma pessoa à espera de uma resposta sobre o
  // dinheiro dela. Não é um ecrã a abrir: é uma decisão — ir buscar o extrato
  // e responder. E esvazia-se: respondido, sai da lista.
  //
  // 'VIEW' e não 'MANAGE': responder exige MANAGE (ver `podeResponder`), mas o
  // SUPPORT precisa de SABER que a pergunta existe — é a ele que ela chega
  // primeiro, e esconder-lha punha-o a reencaminhar no escuro.
  settlementQueries:       { area: 'SETTLEMENTS',    nivel: 'resolve', minimo: 'VIEW' },

  documentsPending:        { area: 'DOCUMENTS',      nivel: 'open',    minimo: 'MANAGE' },
  documentsExpiring:       { area: 'DOCUMENTS',      nivel: 'resolve', minimo: 'VIEW' },

  supportOpen:             { area: 'SUPPORT',        nivel: 'resolve', minimo: 'VIEW' },
  investorWithdrawals:     { area: 'INVESTORS',      nivel: 'open',    minimo: 'MANAGE' },
  driversBlocked:          { area: 'DRIVERS',        nivel: 'inform',  minimo: 'VIEW' },
  // Os lembretes são de cada um e vivem no painel. Ver `reminders.routes.ts`.
  remindersDue:            { area: 'DASHBOARD',      nivel: 'resolve', minimo: 'VIEW' },
};

/** Acima disto, está atrasado. O mesmo número que o painel usa para destacar. */
export const DIAS_PARA_ATRASO = 3;

export interface Fonte {
  key: ChaveDaFonte;
  area: Area;
  nivel: Nivel;
  count: number;
  /** A data do mais antigo que espera. Nula quando não se aplica. */
  oldestAt: string | null;
  /** Já passou do prazo, ou espera há demasiado tempo. */
  late: boolean;
  /** O que esta fonte precise de acrescentar — nomes, semanas, dias. */
  extra?: Record<string, unknown>;
}

/** Dias inteiros desde uma data. Negativo nunca: hoje é zero. */
export function diasDesde(iso: string | null, agora: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((agora - t) / 86_400_000));
}

/**
 * Está atrasado?
 *
 * Por omissão, pela idade de quem espera há mais tempo. Uma fonte pode forçar
 * o atraso (`forcado`) quando o atraso dela não é idade mas prazo: uma inspeção
 * fora de validade está atrasada no primeiro dia, não ao quarto.
 */
export function estaAtrasado(
  oldestAt: string | null,
  agora: number,
  forcado = false,
): boolean {
  if (forcado) return true;
  const d = diasDesde(oldestAt, agora);
  return d !== null && d > DIAS_PARA_ATRASO;
}

/** O que esta pessoa pode ver, pelas permissões que tem. */
export function fontesVisiveis(
  fontes: Fonte[],
  acessos: Partial<Record<Area, Access>>,
): Fonte[] {
  return fontes.filter((f) => {
    const def = FONTES[f.key];
    if (!def) return false;
    return atLeast(acessos[def.area] ?? 'NONE', def.minimo);
  });
}

export interface ResumoDaArea {
  /** Quantos itens pedem ação. Os informativos não entram — ver a nota acima. */
  count: number;
  /** Algum deles está atrasado. É o que pinta o número de vermelho. */
  late: boolean;
}

/**
 * O número a mostrar em cada menu.
 *
 * Soma por área e deixa de fora os informativos. Uma área sem nada por fazer
 * NÃO aparece no resultado — um `{ count: 0 }` obrigava quem desenha o menu a
 * tratar o zero como ausência, que é a forma mais fácil de acabar com um
 * círculo cinzento com um zero lá dentro em metade das entradas.
 */
export function resumoPorArea(fontes: Fonte[]): Partial<Record<Area, ResumoDaArea>> {
  const out: Partial<Record<Area, ResumoDaArea>> = {};
  for (const f of fontes) {
    if (f.nivel === 'inform') continue;
    if (f.count <= 0) continue;
    const atual = out[f.area] ?? { count: 0, late: false };
    out[f.area] = {
      count: atual.count + f.count,
      late: atual.late || f.late,
    };
  }
  return out;
}

/**
 * Quem espera há mais tempo primeiro; quem não tem idade vai para o fim.
 *
 * Dentro de cada nível, e não globalmente: o nível já separou "decide" de
 * "abre" de "só saber", e um ticket de há uma semana não deve empurrar um
 * fecho por fazer para baixo.
 */
export function ordenar(fontes: Fonte[], agora: number): Fonte[] {
  return [...fontes].sort(
    (a, b) => (diasDesde(b.oldestAt, agora) ?? -1) - (diasDesde(a.oldestAt, agora) ?? -1),
  );
}

/** Quantos itens pedem ação, ao todo. Para o ponto no menu do telemóvel. */
export function totalPorFazer(fontes: Fonte[]): number {
  return fontes.reduce((s, f) => s + (f.nivel === 'inform' ? 0 : f.count), 0);
}
