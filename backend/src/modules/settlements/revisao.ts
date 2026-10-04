// src/modules/settlements/revisao.ts
//
// O que mudou num fecho, e como se conta isso ao motorista.
//
// ─── PORQUE É QUE ISTO É UM FICHEIRO À PARTE ────────────────────────────────
//
// Porque é a parte que vai ser lida por uma pessoa cujo dinheiro acabou de
// mudar, e a parte que fica escrita para sempre. As duas decisões difíceis
// aqui — que campos contam como alteração, e como se descreve uma alteração em
// português — não precisam de base de dados nenhuma para estarem certas ou
// erradas. Então testam-se a sério, sem Postgres.
//
// ─── O QUE NÃO ENTRA ────────────────────────────────────────────────────────
//
// Os totais calculados (bruto, comissão, a receber) NÃO são comparados campo a
// campo como os outros. São consequência: mexer no combustível move o lucro, a
// comissão e o líquido de uma vez, e listar os quatro faria uma correção de um
// cêntimo parecer uma reescrita do fecho.
//
// O que ele recebe aparece à parte, no fim, porque é a única consequência que
// lhe interessa de facto.

import type { SettlementStatus } from '@prisma/client';

/** Um campo que mudou, com o valor de antes e o de depois. */
export interface Alteracao {
  campo: string;
  /** O nome do campo como aparece no ecrã, já em português. */
  rotulo: string;
  antes: number | string | null;
  depois: number | string | null;
  /** Para o ecrã saber se formata como dinheiro, data ou texto. */
  tipo: 'dinheiro' | 'data' | 'texto' | 'numero';
}

/**
 * Os campos que uma correção pode tocar, pela ordem em que aparecem no fecho.
 *
 * A ordem não é decorativa: a notificação lista-os por esta ordem, e um
 * motorista que leia "combustível, portagens, Uber" tem de parar para perceber
 * se isso é tudo. Pela ordem do ecrã, lê-se de uma vez.
 */
const CAMPOS: Array<{ campo: string; rotulo: string; tipo: Alteracao['tipo'] }> = [
  { campo: 'weekStart', rotulo: 'Início da semana', tipo: 'data' },
  { campo: 'weekEnd', rotulo: 'Fim da semana', tipo: 'data' },
  { campo: 'uberAmount', rotulo: 'Uber', tipo: 'dinheiro' },
  { campo: 'boltAmount', rotulo: 'Bolt', tipo: 'dinheiro' },
  { campo: 'otherRevenue', rotulo: 'Outras receitas', tipo: 'dinheiro' },
  { campo: 'tollsAmount', rotulo: 'Portagens', tipo: 'dinheiro' },
  { campo: 'fuelAmount', rotulo: 'Combustível', tipo: 'dinheiro' },
  { campo: 'chargeAmount', rotulo: 'Carregamento', tipo: 'dinheiro' },
  { campo: 'vehicleFee', rotulo: 'Aluguer da viatura', tipo: 'dinheiro' },
  { campo: 'otherDeductions', rotulo: 'Outras deduções', tipo: 'dinheiro' },
  { campo: 'commissionRate', rotulo: 'Percentagem de comissão', tipo: 'numero' },
  { campo: 'taxRate', rotulo: 'Taxa de imposto', tipo: 'numero' },
  { campo: 'odometerStart', rotulo: 'Km no início', tipo: 'numero' },
  { campo: 'odometerEnd', rotulo: 'Km no fim', tipo: 'numero' },
  { campo: 'notes', rotulo: 'Observações', tipo: 'texto' },
  { campo: 'vehicleId', rotulo: 'Viatura', tipo: 'texto' },
];

/**
 * `netToDriver` é tratado à parte: não é um campo que se edite, é o resultado.
 * Mas é o número que interessa a quem recebe a notificação, por isso viaja com
 * as alterações em vez de se perder entre elas.
 */
export const CAMPO_LIQUIDO = 'netToDriver';

const dinheiro = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

/** "2026-08-17" a partir de uma data ou de uma string já nesse formato. */
function dia(valor: unknown): string | null {
  if (valor == null) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const texto = String(valor);
  return texto.length >= 10 ? texto.slice(0, 10) : texto;
}

/** "17/08/2026" para ler, a partir de "2026-08-17". */
function diaCurto(valor: string | null): string {
  if (!valor) return '—';
  const [a, m, d] = valor.split('-');
  return d && m && a ? `${d}/${m}/${a}` : valor;
}

/**
 * Dois valores são o mesmo?
 *
 * O dinheiro é comparado ao CÊNTIMO e não com `===`. Os valores vêm da base de
 * dados como Decimal e do formulário como número, e `45.2 === 45.20` é
 * verdade mas `"45.20" === 45.2` não é — sem arredondar, uma edição que não
 * mudou nada gerava uma revisão a dizer que mudou tudo.
 */
function igual(a: unknown, b: unknown, tipo: Alteracao['tipo']): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  if (tipo === 'dinheiro' || tipo === 'numero') {
    const x = Number(a);
    const y = Number(b);
    if (Number.isNaN(x) || Number.isNaN(y)) return String(a) === String(b);
    return Math.round(x * 100) === Math.round(y * 100);
  }
  if (tipo === 'data') return dia(a) === dia(b);
  return String(a).trim() === String(b).trim();
}

/** Prepara um valor para ser guardado no JSON da revisão. */
function paraGuardar(valor: unknown, tipo: Alteracao['tipo']): number | string | null {
  if (valor == null) return null;
  if (tipo === 'dinheiro' || tipo === 'numero') {
    const n = Number(valor);
    return Number.isNaN(n) ? String(valor) : n;
  }
  if (tipo === 'data') return dia(valor);
  return String(valor);
}

/**
 * O que mudou entre o fecho que está gravado e o que se vai gravar.
 *
 * Devolve lista vazia quando nada mudou — e quem chama deve recusar a edição
 * nesse caso, em vez de escrever uma revisão vazia e notificar o motorista
 * sobre coisa nenhuma.
 */
export function compararFecho(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): Alteracao[] {
  const alteracoes: Alteracao[] = [];

  for (const { campo, rotulo, tipo } of CAMPOS) {
    // Um campo que não vem no pedido não foi tocado. É diferente de vir a
    // null, que é apagá-lo de propósito.
    if (!(campo in depois)) continue;
    if (igual(antes[campo], depois[campo], tipo)) continue;

    alteracoes.push({
      campo,
      rotulo,
      tipo,
      antes: paraGuardar(antes[campo], tipo),
      depois: paraGuardar(depois[campo], tipo),
    });
  }

  return alteracoes;
}

/** Um valor já formatado para aparecer numa frase. */
export function mostrar(a: Pick<Alteracao, 'tipo'>, valor: number | string | null): string {
  if (valor == null || valor === '') return '—';
  if (a.tipo === 'dinheiro') return dinheiro(Number(valor));
  if (a.tipo === 'data') return diaCurto(String(valor));
  return String(valor);
}

/**
 * A notificação que o motorista recebe.
 *
 * ─── PORQUE É QUE O MOTIVO VEM PRIMEIRO ────────────────────────────────────
 *
 * Porque é a pergunta que ele faz ao ver o saldo mexer. Pôr a lista de números
 * à frente obriga-o a ler tudo para chegar à única coisa que quer saber, e a
 * maior parte das pessoas não lê tudo — responde a perguntar.
 *
 * ─── E PORQUE É QUE O QUE ELE RECEBE VEM NO FIM ────────────────────────────
 *
 * Porque é a conclusão, e uma conclusão lê-se depois das razões. Aparece
 * sempre que mude, mesmo que nenhum campo o explique sozinho: é a linha que
 * ele vai comparar com o banco.
 */
export function mensagemParaMotorista(entrada: {
  semanaInicio: Date | string;
  semanaFim: Date | string;
  motivo: string;
  alteracoes: Alteracao[];
  liquidoAntes: number;
  liquidoDepois: number;
}): { titulo: string; mensagem: string } {
  const de = diaCurto(dia(entrada.semanaInicio));
  const ate = diaCurto(dia(entrada.semanaFim));

  const linhas: string[] = [`Motivo: ${entrada.motivo.trim()}`];

  const detalhe = entrada.alteracoes
    // O líquido tem a sua própria linha no fim; aqui seria repetição.
    .filter((a) => a.campo !== CAMPO_LIQUIDO)
    .map((a) => `${a.rotulo}: ${mostrar(a, a.antes)} → ${mostrar(a, a.depois)}`);

  if (detalhe.length > 0) linhas.push('', ...detalhe);

  if (Math.round(entrada.liquidoAntes * 100) !== Math.round(entrada.liquidoDepois * 100)) {
    linhas.push(
      '',
      `A receber: ${dinheiro(entrada.liquidoAntes)} → ${dinheiro(entrada.liquidoDepois)}`,
    );
  }

  return {
    titulo: `O fecho de ${de} a ${ate} foi corrigido`,
    mensagem: linhas.join('\n'),
  };
}

/** O que fica gravado na revisão. */
export interface RevisaoParaGravar {
  settlementId: string;
  editedById: string;
  reason: string;
  statusAtEdit: SettlementStatus;
  changes: Alteracao[];
}
