// src/modules/system/capacidade.ts
//
// O que uma frota pode fazer agora: que menus comprou, e se ainda pode
// escrever.
//
// ─── PORQUE É QUE ISTO ESTÁ FORA DO SERVIÇO ─────────────────────────────────
//
// Porque é a regra que tranca pessoas fora do trabalho delas, e um erro aqui
// não dá erro nenhum — dá um cliente que pagou e não consegue registar o fecho
// da semana, ou um que não pagou e continua a usar tudo. Nenhum dos dois
// aparece num log. Aqui testam-se em três linhas cada.
//
// ─── AS DUAS PERGUNTAS SÃO INDEPENDENTES ────────────────────────────────────
//
// "Que menus é que esta frota tem?" vem do PLANO.
// "Pode escrever?" vem da ASSINATURA.
//
// Separadas de propósito: uma frota com o plano completo e a assinatura
// expirada vê tudo e não mexe em nada; uma com o plano mínimo e a assinatura
// em dia mexe à vontade no pouco que comprou. Misturá-las dava uma terceira
// coisa que ninguém sabe explicar ao telefone.
//
// ─── SEM PLANO É TUDO, E NÃO NADA ───────────────────────────────────────────
//
// Uma frota sem plano atribuído tem acesso a tudo. Parece ao contrário do que
// se esperaria num sistema que se vende, e é deliberado:
//
//   - a frota da casa não tem plano nem assinatura, e "sem plano = nada"
//     trancava o dono fora do próprio sistema;
//   - uma frota cliente criada antes de se decidir o plano ficava com um
//     painel vazio, e o primeiro contacto do cliente com o produto era um ecrã
//     a dizer que não pode fazer nada.
//
// Quem decide o plano é o painel do dono, e atribuir um é um clique. O risco
// de dar a mais por distração é uma conversa; o de trancar um cliente que
// pagou é um cliente a menos.

import { situacao, type Situacao } from './assinatura';
import { normalizarFuncionalidades, areasDasFuncionalidades, FUNCIONALIDADES } from './funcionalidades';

/** Todos os códigos do catálogo. É o que vale quando não há plano. */
const TUDO: string[] = FUNCIONALIDADES.map((f) => f.codigo);

export interface Capacidade {
  /** Os códigos das funcionalidades que esta frota tem. */
  funcionalidades: string[];
  /** As áreas de permissões que essas funcionalidades abrem. */
  areas: string[];
  /**
   * Pode criar e alterar? `false` com a assinatura expirada.
   *
   * Ler continua SEMPRE a poder: os dados são do cliente, e os motoristas dele
   * não têm nada que ver com o pagamento. Ver a nota em `podeEscrever`.
   */
  podeEscrever: boolean;
  assinatura: Situacao;
}

/**
 * Pode escrever?
 *
 * ─── PORQUE É QUE EXPIRADA NÃO FECHA A PORTA ────────────────────────────────
 *
 * Porque os dados lá dentro são do cliente — os fechos dele, os documentos dos
 * motoristas dele, os recibos. Trancá-los é ficar com a contabilidade de
 * alguém como refém de uma fatura, e isso não é uma política de cobrança: é
 * uma queixa à espera de acontecer, e um motorista sem culpa nenhuma a ficar
 * sem ver o saldo dele.
 *
 * O que para é o trabalho NOVO. Não se regista um fecho, não se aprova uma
 * retirada, não se cria nada. É suficientemente incómodo para se pagar, e não
 * tira a ninguém o que já é dele.
 */
export function podeEscrever(endsOn: Date | null | undefined, hoje?: Date): boolean {
  return situacao(endsOn, hoje).estado !== 'expirada';
}

/**
 * O que esta frota pode, agora.
 *
 * `features` é o que o plano inclui; `null` ou vazio quer dizer "sem plano",
 * que é tudo — ver a nota no topo.
 */
export function capacidadeDaFrota(
  entrada: {
    features?: readonly string[] | null;
    subscriptionEndsOn?: Date | null;
  },
  hoje?: Date,
): Capacidade {
  const temPlano = !!entrada.features && entrada.features.length > 0;
  const funcionalidades = temPlano
    ? normalizarFuncionalidades(entrada.features!)
    : TUDO;

  return {
    funcionalidades,
    areas: areasDasFuncionalidades(funcionalidades),
    podeEscrever: podeEscrever(entrada.subscriptionEndsOn ?? null, hoje),
    assinatura: situacao(entrada.subscriptionEndsOn ?? null, hoje),
  };
}

/** Esta frota tem esta funcionalidade? */
export function temFuncionalidade(c: Capacidade, codigo: string): boolean {
  return c.funcionalidades.includes(codigo);
}

/**
 * Os métodos HTTP que só leem.
 *
 * É por aqui que a assinatura expirada tranca: tudo o que não está nesta lista
 * é trabalho novo. Lista BRANCA e não negra — uma rota com um método que
 * ninguém se lembrou de classificar fica do lado seguro.
 */
const SO_LEEM = new Set(['GET', 'HEAD', 'OPTIONS']);

export function metodoSoLe(metodo: string): boolean {
  return SO_LEEM.has(metodo.toUpperCase());
}
