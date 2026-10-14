// src/modules/extratos/numeros.ts
//
// Ler números e datas escritos por cinco bancos diferentes.
//
// ─── PORQUE É QUE NÃO SERVE O `numeroPt` QUE JÁ EXISTE ──────────────────────
//
// Serve para quase tudo, e é reaproveitado aqui: a regra dele — manda o
// separador mais à direita — resolve de uma vez o «1.234,56» do Abanca e o
// «23 219.95» do Millennium.
//
// O que ele não conhece são duas convenções que só aparecem em extratos:
//
//   23 489.56-      o Millennium põe o menos À DIREITA do número
//   (1 234,00)      alguns extratos marcam o negativo com parênteses
//
// Lidos pelo `numeroPt`, o primeiro dá 23 489,56 POSITIVO. Um saldo devedor
// que entra na contabilidade como dinheiro a haver é o pior engano possível
// nisto, e não rebenta nada: é um número plausível no sítio certo.

import { numeroPt } from '../fleet-import/parsers/numeros';

export const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * Um valor de extrato, com as duas convenções de negativo.
 *
 * Devolve `null` em vez de `NaN`: um `NaN` propaga-se por somas inteiras e só
 * aparece no fim, já sem se saber de onde veio.
 */
export function valorDeExtrato(bruto: string): number | null {
  let s = (bruto ?? '').trim();
  if (!s) return null;

  // O euro pode vir antes ou depois: «€1 000.00» e «170,20€».
  s = s.replace(/€|EUR/gi, '').trim();

  let negativo = false;

  // Parênteses: «(1 234,00)».
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1).trim();
  }

  // Menos à direita: «23 489.56-». Antes de chamar o `numeroPt`, que recusa
  // uma cadeia com o sinal no fim.
  if (/-$/.test(s)) {
    negativo = true;
    s = s.slice(0, -1).trim();
  }

  if (/^-/.test(s)) {
    negativo = true;
    s = s.slice(1).trim();
  }

  const n = numeroPt(s);
  if (n === null) return null;
  return cent(negativo ? -Math.abs(n) : n);
}

// ─────────────────────────────────────────────────────────────────── datas ──

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const DIAS_NO_MES = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

function iso(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12) return null;
  if (dia < 1 || dia > DIAS_NO_MES(ano, mes)) return null;
  const mm = String(mes).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${ano}-${mm}-${dd}`;
}

/**
 * Um ano de dois dígitos.
 *
 * ─── PORQUE É QUE 26 É 2026 E NÃO 1926 ────────────────────────────────────
 *
 * Porque isto lê extratos bancários, e um extrato de 1926 não existe. A
 * fronteira fica em 70: «69» é 2069 e «70» é 1970, que é a convenção do POSIX
 * e a que qualquer pessoa espera. Escolher mal aqui dava datas a cem anos de
 * distância, e o movimento caía num mês que não aparece em nenhum filtro.
 */
export function anoCompleto(dois: number): number {
  return dois < 70 ? 2000 + dois : 1900 + dois;
}

/** "03/08/2026" ou "03-08-2026" ou "3.8.2026" → "2026-08-03". */
export function dataDiaMesAno(bruto: string): string | null {
  const m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(bruto ?? '');
  if (!m) return null;
  const ano = m[3].length <= 2 ? anoCompleto(Number(m[3])) : Number(m[3]);
  return iso(ano, Number(m[2]), Number(m[1]));
}

/** "27 set. 2026" e "27 de setembro de 2026" → "2026-09-27". */
export function dataComMesEmPalavra(bruto: string): string | null {
  const m = /(\d{1,2})\s+(?:de\s+)?([a-zç]+)\.?\s*(?:de\s+)?(\d{4})/i.exec(bruto ?? '');
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  return iso(Number(m[3]), mes, Number(m[1]));
}

/**
 * O Millennium escreve "8.03" — MÊS.DIA, e sem ano nenhum.
 *
 * ─── PORQUE É QUE ISTO PRECISA DO ANO DE FORA ─────────────────────────────
 *
 * Porque o ano não está na linha: está no cabeçalho do extrato. Adivinhá-lo
 * pelo ano corrente parecia inofensivo até se importar em Janeiro um extrato
 * de Dezembro — e aí todos os movimentos saltavam um ano.
 *
 * ─── E PORQUE É QUE É MÊS.DIA E NÃO DIA.MÊS ───────────────────────────────
 *
 * Porque o extrato dele traz «8.03 8.04» na mesma linha: data de lançamento e
 * data valor, a 3 e a 4 de Agosto. Lido como dia.mês dava 8 de Março e 8 de
 * Abril — duas datas erradas, em meses errados, e nenhuma delas impossível.
 *
 * Quando o primeiro número não pode ser um mês (13 ou mais), assume-se
 * dia.mês: um extrato que mude de convenção é melhor ser lido do que recusado,
 * e a cadeia de saldos não depende das datas.
 */
export function dataMesDia(bruto: string, ano: number): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})$/.exec((bruto ?? '').trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a <= 12 ? iso(ano, a, b) : iso(ano, b, a);
}

/**
 * Os últimos quatro dígitos de um IBAN, e nada mais. Ver a nota em `tipos.ts`.
 *
 * ─── PORQUE É QUE NÃO SE LIMPAM OS ESPAÇOS PRIMEIRO ───────────────────────
 *
 * Porque colar o texto todo apaga as fronteiras das palavras, e aí uma
 * expressão que aceita «duas letras, dois dígitos e mais trinta caracteres»
 * come o que vem depois do IBAN: num extrato deu «…1703» onde o IBAN acaba em
 * «…9680». Um número errado, com o aspeto certo.
 *
 * Então procura-se no texto como ele está, aceitando os espaços DENTRO do
 * IBAN (que é como os bancos o escrevem), e limpa-se só o que foi apanhado.
 * O comprimento é limitado ao que um IBAN pode ter: 15 a 34 caracteres.
 */
export function fimDoIban(bruto: string): string | null {
  const re = /\b([A-Z]{2})(\d{2})((?:[ ]?[A-Z0-9]){11,30})/g;

  for (const m of (bruto ?? '').matchAll(re)) {
    const limpo = (m[1] + m[2] + m[3]).replace(/\s/g, '');
    const esperado = COMPRIMENTO_DO_IBAN[m[1]];

    // ─── PORQUE É QUE O COMPRIMENTO DO PAÍS IMPORTA ───────────────────────
    //
    // Um IBAN escrito em grupos — «PT50 0170 3302 0304 0053 3919 4» — acaba
    // num grupo de UM dígito, e logo depois vem a coluna do saldo: «… 3919 4
    // 0,00». A expressão, que aceita espaços dentro do IBAN, come o «0» do
    // saldo e o IBAN passa a acabar em «1940» em vez de «9194».
    //
    // Quatro dígitos errados identificam a conta errada, e isso mistura dois
    // extratos. Cortar ao comprimento do país resolve-o de vez: em Portugal o
    // IBAN tem 25 caracteres, na Lituânia (a Revolut) tem 20.
    if (esperado) {
      if (limpo.length < esperado) continue;
      return limpo.slice(0, esperado).slice(-4);
    }

    if (limpo.length >= 15 && limpo.length <= 34) return limpo.slice(-4);
  }

  return null;
}

/**
 * O comprimento do IBAN por país, para os que aparecem nestes extratos.
 *
 * Não é a lista toda de propósito: um país que não esteja aqui cai na regra
 * genérica, e acrescentar um é uma linha. Uma tabela com 70 países que
 * ninguém confere é pior do que cinco que estão certos.
 */
const COMPRIMENTO_DO_IBAN: Record<string, number> = {
  PT: 25, // Portugal — Abanca, Novo Banco, Millennium
  LT: 20, // Lituânia — Revolut
  ES: 24,
  GB: 22,
  DE: 22,
  FR: 27,
};
