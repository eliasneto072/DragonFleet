// src/modules/personal/creditos.ts
//
// As contas dos créditos: prestação, quadro de amortização, quanto já foi
// pago, e quanto disso foram juros.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  PORQUE É QUE ISTO É UM FICHEIRO À PARTE, TESTADO LINHA A LINHA          ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Porque é a conta mais fácil de fazer quase bem. Uma amortização francesa
// escrita de cabeça dá sempre um número plausível — e um número plausível que
// esteja 2% errado leva alguém a decidir consolidar (ou a não consolidar) um
// crédito de setenta e cinco mil euros.
//
// Os casos que partem isto não se encontram a clicar: uma taxa a zero (divisão
// por zero na fórmula), um crédito que ainda não começou, um que já acabou,
// uma última prestação que tem de deixar o saldo exactamente a zero e não a
// três cêntimos.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  TAN, TAEG E MTIC NÃO SÃO A MESMA COISA, E SÓ UMA ENTRA NAS CONTAS       ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// · TAN  — a taxa que corre sobre o capital em dívida. É a ÚNICA que entra no
//          quadro de amortização, porque é a única que descreve como a dívida
//          é consumida mês a mês.
//
// · TAEG — inclui comissões, seguros e imposto de selo. Serve para comparar
//          propostas de bancos diferentes, e é por isso que se guarda. Usá-la
//          no quadro atribuía ao CAPITAL encargos que não são juro do capital,
//          e dava uma dívida que nunca chegava a zero.
//
// · MTIC — o total que se acaba por entregar ao banco, do contrato. Não se
//          calcula aqui: lê-se do papel. Guardado para se poder confrontar
//          com o que as nossas contas dizem — e se os dois não baterem, é
//          sinal de que falta encargo nenhuma destas contas conhece.
//
// Todas as contas em cêntimos inteiros, como o resto do dinheiro no projeto.

export interface Credito {
  /** Capital emprestado, em euros. */
  capital: number;
  /** TAN anual, em pontos percentuais (5.4 = 5,4%). */
  tan: number;
  /** Número total de prestações. */
  prestacoes: number;
  /** A data da primeira prestação. */
  inicio: Date;
}

export interface LinhaDoQuadro {
  /** 1 é a primeira prestação. */
  n: number;
  /** O mês desta prestação. */
  quando: Date;
  prestacao: number;
  juro: number;
  capital: number;
  /** O que fica em dívida DEPOIS desta prestação. */
  saldo: number;
}

function cent(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}

function euros(c: number): number {
  return c / 100;
}

/** O mês `n` depois de `inicio`, no mesmo dia. */
function maisMeses(inicio: Date, n: number): Date {
  const d = new Date(Date.UTC(
    inicio.getUTCFullYear(), inicio.getUTCMonth() + n, inicio.getUTCDate(),
  ));
  return d;
}

/**
 * A prestação de uma amortização francesa, em euros.
 *
 * ─── O CASO DA TAXA A ZERO ──────────────────────────────────────────────────
 *
 * Com TAN a 0, o `(1 - (1+i)^-n)` do denominador é zero e a fórmula dá
 * infinito. Acontece a sério: créditos de família, acordos sem juro, e a
 * dívida ao Mário. É capital a dividir por prestações, e mais nada.
 */
export function prestacaoMensal(capital: number, tanAnual: number, prestacoes: number): number {
  if (!Number.isFinite(capital) || capital <= 0) return 0;
  if (!Number.isFinite(prestacoes) || prestacoes <= 0) return 0;

  const i = (Number.isFinite(tanAnual) ? tanAnual : 0) / 100 / 12;
  if (i <= 0) return euros(Math.round(cent(capital) / prestacoes));

  const p = capital * i / (1 - (1 + i) ** -prestacoes);
  return euros(Math.round(cent(p)));
}

/**
 * O quadro de amortização, prestação a prestação.
 *
 * ─── A ÚLTIMA PRESTAÇÃO É DIFERENTE, E TEM DE SER ───────────────────────────
 *
 * Arredondar a prestação a cêntimos faz a dívida acabar alguns cêntimos acima
 * ou abaixo de zero. Num quadro de 84 meses, esse resto chega a dar um euro —
 * e um crédito que no fim diz «faltam 0,87 €» é um crédito que parece avariado.
 *
 * Então a última prestação é o que SOBRA: o saldo que resta mais o juro desse
 * mês. É também o que os bancos fazem, e é por isso que a última prestação de
 * um crédito nunca é exactamente igual às outras.
 */
export function quadroDeAmortizacao(c: Credito): LinhaDoQuadro[] {
  const capitalCent = cent(c.capital);
  const n = Math.max(0, Math.floor(c.prestacoes));
  if (capitalCent <= 0 || n === 0) return [];

  const i = (Number.isFinite(c.tan) ? c.tan : 0) / 100 / 12;
  const prestacaoCent = cent(prestacaoMensal(c.capital, c.tan, n));

  const linhas: LinhaDoQuadro[] = [];
  let saldo = capitalCent;

  for (let k = 1; k <= n; k += 1) {
    const juro = i > 0 ? Math.round(saldo * i) : 0;

    // A última leva o que sobrar. Ver a nota acima.
    const ultima = k === n;
    const amortizado = ultima ? saldo : Math.min(prestacaoCent - juro, saldo);
    const paga = amortizado + juro;

    saldo -= amortizado;

    linhas.push({
      n: k,
      quando: maisMeses(c.inicio, k - 1),
      prestacao: euros(paga),
      juro: euros(juro),
      capital: euros(amortizado),
      saldo: euros(saldo),
    });
  }

  return linhas;
}

export interface EstadoDoCredito {
  /** Prestações já vencidas à data de referência. */
  pagas: number;
  prestacoes: number;
  /** De 0 a 100, com uma casa. É a barra. */
  percentagemPaga: number;
  /** Capital já amortizado. */
  capitalPago: number;
  /** O que ainda se deve de capital. */
  emDivida: number;
  /** Juros já pagos, desde o início. */
  jurosPagos: number;
  /** Juros que faltam pagar até à última prestação. */
  jurosPorPagar: number;
  /** Juros do crédito inteiro: `jurosPagos + jurosPorPagar`. */
  jurosTotais: number;
  /** O que se entrega ao banco ao todo: capital mais juros. */
  totalAPagar: number;
  /** A última prestação que já venceu. `null` se ainda não começou. */
  ultimoPagamento: { n: number; quando: Date; prestacao: number } | null;
  /** A próxima a vencer. `null` se já acabou. */
  proximoPagamento: { n: number; quando: Date; prestacao: number } | null;
  /** A data da última prestação. */
  fim: Date | null;
  /** Já acabou de pagar. */
  terminado: boolean;
}

/**
 * Onde é que o crédito está, à data de hoje.
 *
 * ─── O QUE CONTA COMO «PAGA» ────────────────────────────────────────────────
 *
 * Uma prestação conta como paga quando a data dela já passou. É uma suposição,
 * e é a suposição certa para um crédito ao consumo com débito direto — mas é
 * uma suposição, e por isso está escrita aqui e não escondida numa linha.
 *
 * Se um dia se registarem os pagamentos a sério (ou amortizações antecipadas),
 * é esta função que muda, e só esta.
 */
export function estadoDoCredito(c: Credito, hoje: Date = new Date()): EstadoDoCredito {
  const quadro = quadroDeAmortizacao(c);

  if (quadro.length === 0) {
    return {
      pagas: 0, prestacoes: 0, percentagemPaga: 0,
      capitalPago: 0, emDivida: 0,
      jurosPagos: 0, jurosPorPagar: 0, jurosTotais: 0, totalAPagar: 0,
      ultimoPagamento: null, proximoPagamento: null, fim: null, terminado: false,
    };
  }

  const vencidas = quadro.filter((l) => l.quando.getTime() <= hoje.getTime());
  const pagas = vencidas.length;

  const soma = (ls: LinhaDoQuadro[], campo: 'juro' | 'capital' | 'prestacao') =>
    euros(ls.reduce((s, l) => s + cent(l[campo]), 0));

  const porVencer = quadro.slice(pagas);
  const jurosPagos = soma(vencidas, 'juro');
  const jurosPorPagar = soma(porVencer, 'juro');

  const ultima = vencidas[vencidas.length - 1] ?? null;
  const proxima = porVencer[0] ?? null;

  return {
    pagas,
    prestacoes: quadro.length,
    // Sobre o número de prestações e não sobre o capital: é assim que se
    // responde a «quanto falta», e é o que a barra mostra. A percentagem de
    // CAPITAL amortizado é sempre mais baixa no início — os primeiros anos
    // são quase só juro — e seria uma barra desanimadora e difícil de
    // explicar.
    percentagemPaga: Math.round((pagas / quadro.length) * 1000) / 10,
    capitalPago: soma(vencidas, 'capital'),
    emDivida: ultima ? ultima.saldo : c.capital,
    jurosPagos,
    jurosPorPagar,
    jurosTotais: euros(cent(jurosPagos) + cent(jurosPorPagar)),
    totalAPagar: soma(quadro, 'prestacao'),
    ultimoPagamento: ultima
      ? { n: ultima.n, quando: ultima.quando, prestacao: ultima.prestacao }
      : null,
    proximoPagamento: proxima
      ? { n: proxima.n, quando: proxima.quando, prestacao: proxima.prestacao }
      : null,
    fim: quadro[quadro.length - 1].quando,
    terminado: pagas >= quadro.length,
  };
}

export interface AnoDeJuros {
  ano: number;
  pago: number;
  juro: number;
  capital: number;
  /** Que percentagem do que se pagou nesse ano foi juro. */
  percentagemEmJuros: number;
}

/**
 * Quanto do que se pagou em cada ano foi juro.
 *
 * É a conta que responde a «quanto é que isto me custa por ano» — e a que
 * mostra porque é que amortizar cedo vale tanto mais do que amortizar tarde:
 * nos primeiros anos, metade ou mais de cada prestação é juro.
 *
 * Só os anos que já têm prestações vencidas, quando `so Ate` é dado.
 */
export function jurosPorAno(c: Credito, ate?: Date): AnoDeJuros[] {
  const quadro = quadroDeAmortizacao(c)
    .filter((l) => !ate || l.quando.getTime() <= ate.getTime());

  const mapa = new Map<number, { pago: number; juro: number; capital: number }>();

  for (const l of quadro) {
    const ano = l.quando.getUTCFullYear();
    const v = mapa.get(ano) ?? { pago: 0, juro: 0, capital: 0 };
    v.pago += cent(l.prestacao);
    v.juro += cent(l.juro);
    v.capital += cent(l.capital);
    mapa.set(ano, v);
  }

  return [...mapa.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ano, v]) => ({
      ano,
      pago: euros(v.pago),
      juro: euros(v.juro),
      capital: euros(v.capital),
      percentagemEmJuros: v.pago > 0
        ? Math.round((v.juro / v.pago) * 1000) / 10
        : 0,
    }));
}

/**
 * A prestação que escreveu bate certo com as contas?
 *
 * ─── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
 *
 * Porque os quatro números vêm de um papel e são copiados à mão. Um dígito
 * trocado no capital, na taxa ou no prazo dá um quadro inteiro errado — e
 * nada no ecrã o denuncia, porque o quadro continua bonito e coerente consigo
 * próprio.
 *
 * A prestação é o número que ele CONHECE de cor: é o que lhe sai da conta
 * todos os meses. Se a nossa conta der outra coisa, há um engano algures, e
 * mais vale dizê-lo do que mostrar um gráfico convincente e falso.
 *
 * A tolerância é de 1% (e nunca menos de 1 €): arredondamentos, seguros
 * incluídos na prestação e comissões de processamento fazem diferenças
 * pequenas que são normais. Um dígito trocado faz diferenças grandes.
 */
export function prestacaoBateCerto(
  c: Credito, prestacaoReal: number,
): { bate: boolean; calculada: number; diferenca: number } {
  const calculada = prestacaoMensal(c.capital, c.tan, c.prestacoes);
  const diferenca = euros(Math.abs(cent(prestacaoReal) - cent(calculada)));
  const tolerancia = Math.max(1, calculada * 0.01);
  return { bate: diferenca <= tolerancia, calculada, diferenca };
}
