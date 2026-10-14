// src/modules/extratos/conferir.ts
//
// A cadeia de saldos: a verificação que decide se um extrato entra ou não.
//
// ─── A IDEIA ────────────────────────────────────────────────────────────────
//
// Num extrato bancário, cada linha traz o saldo depois daquele movimento. Isso
// significa que o próprio documento contém a sua prova:
//
//   saldo da linha n  =  saldo da linha n−1  +  valor da linha n
//
// Se um valor foi lido a mais, a menos, com o sinal trocado ou na coluna
// errada, a igualdade falha naquela linha. E falha na LINHA, o que diz logo
// onde está o problema em vez de dizer só «os totais não batem».
//
// ─── PORQUE É QUE ISTO É MELHOR DO QUE CONFERIR O TOTAL ─────────────────────
//
// Porque um total fecha por acaso. Dois enganos de sinais contrários
// cancelam-se e a soma dá certo — e a importação avança com duas linhas
// erradas. Uma cadeia de saldos não se deixa enganar assim: cada elo é
// conferido contra o anterior.
//
// ─── E A TOLERÂNCIA? ────────────────────────────────────────────────────────
//
// Um cêntimo, e por uma razão muito concreta: os extratos estão em euros com
// duas casas, e somar em vírgula flutuante deixa resíduo de milésimos. Dois
// cêntimos já não é resíduo, é um valor lido mal.
//
// A tolerância NÃO acumula: cada elo é conferido contra o saldo IMPRESSO do
// anterior e não contra um saldo que fomos somando. Assim um desvio de meio
// cêntimo por linha não se junta ao longo de duzentas linhas até passar a
// euros.

import type { LeituraCrua, LeituraDeExtrato, Movimento } from './tipos';

/** Um cêntimo. Acima disto não é arredondamento, é engano. */
export const TOLERANCIA = 0.011;

const cent = (n: number) => Math.round(n * 100) / 100;

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

export interface Elo {
  /** O índice do movimento, a começar em 1 para aparecer no ecrã. */
  linha: number;
  esperado: number;
  impresso: number;
}

/**
 * Os elos da cadeia que não fecham.
 *
 * Vazio quer dizer que o extrato se conferiu a si próprio do princípio ao fim.
 */
export function elosQueFalham(
  movimentos: Movimento[],
  saldoInicial: number | null,
): Elo[] {
  const falhas: Elo[] = [];
  let anterior = saldoInicial;

  for (let i = 0; i < movimentos.length; i++) {
    const m = movimentos[i];
    if (m.saldo === null) {
      // Sem saldo impresso não há elo a conferir, e a cadeia parte-se aqui:
      // o saldo do seguinte não se pode comparar com um saldo que não existe.
      anterior = null;
      continue;
    }
    if (anterior !== null) {
      const esperado = cent(anterior + m.valor);
      if (Math.abs(esperado - m.saldo) > TOLERANCIA) {
        falhas.push({ linha: i + 1, esperado, impresso: m.saldo });
      }
    }
    anterior = m.saldo;
  }

  return falhas;
}

/**
 * Fecha a leitura: confere a cadeia e escreve os avisos.
 *
 * ─── QUANDO É QUE UM EXTRATO SEM SALDOS PASSA ─────────────────────────────
 *
 * Nunca por omissão. Se nenhum movimento traz saldo, não há verificação
 * possível, e um extrato que não se pode verificar não se importa — é
 * exactamente a regra que os leitores da Via Verde e da Prio já seguem.
 *
 * ─── E UM EXTRATO SEM MOVIMENTOS? ─────────────────────────────────────────
 *
 * Esse passa, com um aviso. Um mês sem movimentos existe (o extrato pessoal do
 * Abanca que ele mandou é uma folha de posições e não tem nenhum), e recusá-lo
 * obrigava a pessoa a adivinhar se o problema era o ficheiro ou o leitor.
 */
export function conferir(crua: LeituraCrua): LeituraDeExtrato {
  const avisos = [...crua.avisos];
  const { movimentos, saldoInicial, saldoFinal } = crua;

  // O leitor já decidiu. Acontece quando o sinal foi deduzido do saldo e a
  // grandeza lida não coincidiu — ver a nota em `assinar.ts`.
  if (crua.recusa) {
    return { ...crua, movimentos, confere: false, avisos: [...avisos, crua.recusa] };
  }

  if (movimentos.length === 0) {
    avisos.push('Este ficheiro não traz movimentos. Confirme que exportou o extrato de movimentos e não a folha de posições.');
    return { ...crua, movimentos, confere: true, avisos };
  }

  const comSaldo = movimentos.filter((m) => m.saldo !== null).length;
  if (comSaldo === 0) {
    avisos.push('Não foi possível ler a coluna do saldo, por isso não há como confirmar os valores. Nada foi importado.');
    return { ...crua, movimentos, confere: false, avisos };
  }

  const falhas = elosQueFalham(movimentos, saldoInicial);
  if (falhas.length > 0) {
    const p = falhas[0];
    avisos.push(
      `Os valores não fecham com o saldo do banco: na linha ${p.linha} o saldo devia ser `
      + `${eur(p.esperado)} e o extrato diz ${eur(p.impresso)}`
      + (falhas.length > 1 ? ` (e mais ${falhas.length - 1} linha(s))` : '')
      + '. Nada foi importado.',
    );
    return { ...crua, movimentos, confere: false, avisos };
  }

  // ─── A SEGUNDA PROVA: o saldo final declarado ─────────────────────────────
  //
  // A cadeia prova que as linhas são coerentes ENTRE SI. Isto prova que não
  // falta nenhuma: se o extrato declara com quanto a conta ficou e o último
  // saldo lido não é esse, há movimentos que não foram lidos — numa página
  // que o extrator não abriu, por exemplo.
  const ultimo = [...movimentos].reverse().find((m) => m.saldo !== null)?.saldo ?? null;
  if (saldoFinal !== null && ultimo !== null
      && Math.abs(cent(saldoFinal) - cent(ultimo)) > TOLERANCIA) {
    avisos.push(
      `O extrato declara um saldo final de ${eur(saldoFinal)} mas o último movimento `
      + `lido deixa a conta em ${eur(ultimo)}. Devem faltar movimentos. Nada foi importado.`,
    );
    return { ...crua, movimentos, confere: false, avisos };
  }

  if (comSaldo < movimentos.length) {
    avisos.push(
      `${movimentos.length - comSaldo} movimento(s) ficaram sem saldo lido. `
      + 'Os valores conferem, mas vale a pena olhar para esses.',
    );
  }

  return { ...crua, movimentos, confere: true, avisos };
}
