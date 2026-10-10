// src/modules/invites/convite.ts
//
// O código de um convite, e quando é que ele ainda vale.
//
// ─── PORQUE É QUE ISTO ESTÁ FORA DO SERVIÇO ─────────────────────────────────
//
// Porque é a trave que decide quem entra numa frota. Um convite que devia estar
// esgotado e aceita mais uma pessoa, ou um que expira um dia antes do que diz,
// não dá erro nenhum — dá um motorista dentro da conta de um cliente sem
// ninguém o ter convidado. Aqui cada caso testa-se em duas linhas.
//
// ─── O ALFABETO NÃO TEM I, O, 0 NEM 1 ──────────────────────────────────────
//
// O código viaja num link, mas é ditado ao telefone mais vezes do que se pensa.
// Um "I" que o outro escreve "1", ou um "O" que escreve "0", dá "convite
// inválido" e uma chamada para perceber porquê. Fora do alfabeto, não há
// confusão possível: só letras, e nenhum par parecido.
//
// Vinte e quatro letras em dez posições são 6,3 × 10¹³ códigos. Não se adivinha
// um, e é por isso que o código sozinho basta para entrar — não há aqui mais
// nenhum segredo a guardar.

import { randomInt } from 'node:crypto';

/** Vinte e quatro letras: o alfabeto sem I nem O. Ver a nota acima. */
export const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const COMPRIMENTO = 10;

/**
 * Um código novo.
 *
 * `randomInt` do módulo `crypto` e não `Math.random`: o segundo é previsível a
 * partir de alguns resultados, e aqui o código É a chave da porta.
 */
export function gerarCodigo(comprimento: number = COMPRIMENTO): string {
  let fora = '';
  for (let i = 0; i < comprimento; i += 1) {
    fora += ALFABETO[randomInt(ALFABETO.length)];
  }
  return fora;
}

/**
 * Limpa o que alguém escreveu à mão: maiúsculas, sem espaços nem hífenes.
 *
 * ─── E RECUSA O RESTO, EM VEZ DE O DEITAR FORA ──────────────────────────────
 *
 * Um "0" escrito por engano no lugar de um "O" não é apagado: se fosse, o
 * código ficava com nove letras e a resposta era "convite não encontrado" —
 * verdade, mas inútil. Recusado, quem escreveu sabe que foi o que escreveu.
 *
 * Devolve `null` quando não é um código.
 */
export function normalizarCodigo(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const limpo = texto.trim().toUpperCase().replace(/[\s-]/g, '');
  if (limpo.length !== COMPRIMENTO) return null;
  for (const c of limpo) if (!ALFABETO.includes(c)) return null;
  return limpo;
}

export type EstadoDoConvite = 'valido' | 'revogado' | 'expirado' | 'esgotado';

/** O que a base de dados guarda de um convite, na parte que decide. */
export interface DadosDoConvite {
  /** Último dia em que vale, inclusive. Nulo = sem validade. */
  expiresOn: Date | null;
  /** Quantas pessoas ainda pode inscrever. Nulo = sem limite. */
  remaining: number | null;
  /** Quando foi desligado à mão. Nulo = está de pé. */
  revokedAt: Date | null;
}

/** Um dia, sem horas, em UTC — tal como nas assinaturas. */
function soDia(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Em que pé está o convite.
 *
 * ─── A ORDEM DAS PERGUNTAS É A ORDEM DA RESPOSTA ────────────────────────────
 *
 * Revogado primeiro, porque é a única das três que é uma decisão de alguém: a
 * quem o revogou interessa ler "revogado" e não "esgotado", mesmo que as duas
 * coisas sejam verdade. Depois a validade, e por fim o limite.
 *
 * ─── O ÚLTIMO DIA CONTA ─────────────────────────────────────────────────────
 *
 * Um convite que acaba hoje vale hoje — a mesma regra das assinaturas. Dar um
 * dia a menos do que o que está escrito no ecrã é o género de detalhe que
 * ninguém discute e todos notam.
 */
export function estadoDoConvite(
  c: DadosDoConvite,
  hoje: Date = new Date(),
): EstadoDoConvite {
  if (c.revokedAt) return 'revogado';
  if (c.expiresOn && soDia(c.expiresOn) < soDia(hoje)) return 'expirado';
  if (c.remaining !== null && c.remaining <= 0) return 'esgotado';
  return 'valido';
}

/** O que se diz a quem abriu o link. Sem dizer mais do que o necessário. */
export const TEXTO_DO_ESTADO: Record<Exclude<EstadoDoConvite, 'valido'>, string> = {
  revogado: 'Este convite foi cancelado. Peça um novo à frota.',
  expirado: 'Este convite expirou. Peça um novo à frota.',
  esgotado: 'Este convite já foi usado o número de vezes permitido. Peça um novo à frota.',
};

/** As validades que o ecrã sugere. `null` é "sem validade". */
export const VALIDADES = [
  { dias: 7, nome: '7 dias' },
  { dias: 30, nome: '30 dias' },
  { dias: 90, nome: '90 dias' },
  { dias: null, nome: 'Sem validade' },
] as const;

/** O último dia de um convite criado hoje com `dias` de validade. */
export function validoAte(dias: number | null, hoje: Date = new Date()): Date | null {
  if (dias === null) return null;
  if (!Number.isFinite(dias) || dias < 1) {
    throw new Error('[convite] a validade tem de ser pelo menos um dia');
  }
  const d = soDia(hoje);
  d.setUTCDate(d.getUTCDate() + Math.floor(dias));
  return d;
}
