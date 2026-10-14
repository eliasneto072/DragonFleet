// src/modules/company/lucro.ts
//
// O que a empresa ganha, e o que tem em caixa. São dois números diferentes.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  LUCRO E CAIXA NÃO SÃO A MESMA COISA, E CONFUNDI-LOS É O ERRO CARO       ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Um motorista fatura 1.000 €. Entram 1.000 € na conta da empresa. Fechada a
// semana, 750 € são dele e 250 € ficam para a empresa.
//
//   · O LUCRO da empresa subiu 250 €. Só isso.
//   · A CAIXA tem 1.000 €, mas 750 € são uma dívida ao motorista.
//
// Quando ele levanta os 750 €, saem do banco — e o lucro não muda nada, porque
// aquele dinheiro nunca foi da empresa.
//
// É por isso que o pagamento aos motoristas NÃO é despesa: eles já estão
// descontados, por nunca terem entrado como receita. Descontá-los outra vez
// fazia o lucro aparecer muito mais baixo do que é — e levava a decidir vender
// carros que estão a dar dinheiro.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  QUANDO O MOTORISTA É O DONO, A CONTA MUDA                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// É a regra que o próprio `schema.prisma` já escreve no campo `isCompany`: «o
// aluguer da viatura que lhe é lançado é a empresa a cobrar a si própria e NÃO
// entra no lucro; o que ele fecha na semana entra por inteiro».
//
// Faz sentido: se o dono conduz um carro da empresa, o aluguer que se lança no
// fecho dele é dinheiro a passar do bolso esquerdo para o direito. Contá-lo
// como receita inflacionava o lucro sem um cêntimo ter entrado de fora. E o
// líquido da semana dele não é um custo — é dele, e ele é a empresa.
//
// Todas as contas em cêntimos inteiros, como o resto do dinheiro no projeto.

/** Um fecho semanal, reduzido ao que a conta do lucro precisa. */
export interface FechoParaLucro {
  /** O motorista deste fecho É a empresa (o dono, que também conduz). */
  doDono: boolean;
  /** Aluguer da viatura lançado no fecho. */
  aluguer: number;
  /** Outras deduções. É aqui que vive o slot semanal de quem traz carro próprio. */
  outrasDeducoes: number;
  /** A comissão da empresa sobre o lucro do motorista. */
  comissao: number;
  /** O que foi creditado ao motorista. */
  liquidoDoMotorista: number;
  /** A data que ancora o fecho no tempo. */
  quando: Date;
}

export interface DespesaDaEmpresa {
  valor: number;
  quando: Date;
  categoriaId: string | null;
}

export interface Lucro {
  /** Alugueres de carros da frota, sem os do dono. */
  alugueres: number;
  /** Slots de quem traz carro próprio, e outras deduções. */
  slots: number;
  /** Comissões cobradas aos motoristas. */
  comissoes: number;
  /** O líquido das semanas do dono, que entra por inteiro. */
  doDono: number;
  /** A soma de tudo o que entra. */
  receita: number;
  despesas: number;
  /** `receita − despesas`. Negativo é prejuízo, e diz-se assim. */
  lucro: number;
  /** Lucro a dividir por receita, em percentagem. `null` sem receita. */
  margem: number | null;
}

function cent(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}

const euros = (c: number) => c / 100;

/**
 * O lucro de um período.
 *
 * Os fechos e as despesas já vêm filtrados pelo período — este ficheiro não
 * sabe nada de datas, e é isso que o torna testável com números à mão.
 */
export function calcularLucro(
  fechos: readonly FechoParaLucro[],
  despesas: readonly DespesaDaEmpresa[],
): Lucro {
  let alugueres = 0;
  let slots = 0;
  let comissoes = 0;
  let doDono = 0;

  for (const f of fechos) {
    if (f.doDono) {
      // O aluguer lançado ao dono é a empresa a cobrar a si própria: fica de
      // fora. O que ele fechou na semana entra por inteiro.
      doDono += cent(f.liquidoDoMotorista);
      comissoes += cent(f.comissao);
      continue;
    }
    alugueres += cent(f.aluguer);
    slots += cent(f.outrasDeducoes);
    comissoes += cent(f.comissao);
  }

  const receita = alugueres + slots + comissoes + doDono;
  // Valor absoluto: uma despesa é uma saída, venha com o sinal que vier. Um
  // menos escrito à mão num campo de despesa passaria a somar ao lucro.
  const gasto = despesas.reduce((s, d) => s + Math.abs(cent(d.valor)), 0);
  const lucro = receita - gasto;

  return {
    alugueres: euros(alugueres),
    slots: euros(slots),
    comissoes: euros(comissoes),
    doDono: euros(doDono),
    receita: euros(receita),
    despesas: euros(gasto),
    lucro: euros(lucro),
    // Sobre a receita e não sobre o lucro. Sem receita é `null` e não zero:
    // zero lia-se como «margem nula», e o que se passa é «ainda não há nada
    // para medir».
    margem: receita > 0 ? Math.round((lucro / receita) * 1000) / 10 : null,
  };
}

export interface LinhaDeMes {
  mes: string;
  receita: number;
  despesas: number;
  lucro: number;
}

/** "2026-10", em UTC. */
function chaveDoMes(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Receita, despesa e lucro mês a mês.
 *
 * Os meses aparecem se tiverem receita OU despesa. Um mês só com despesas tem
 * de aparecer — é precisamente o mês que interessa ver — e saltá-lo dava um
 * gráfico que escondia os meses maus.
 */
export function lucroPorMes(
  fechos: readonly FechoParaLucro[],
  despesas: readonly DespesaDaEmpresa[],
): LinhaDeMes[] {
  const meses = new Map<string, { fechos: FechoParaLucro[]; despesas: DespesaDaEmpresa[] }>();

  const balde = (chave: string) => {
    const b = meses.get(chave) ?? { fechos: [], despesas: [] };
    meses.set(chave, b);
    return b;
  };

  for (const f of fechos) balde(chaveDoMes(f.quando)).fechos.push(f);
  for (const d of despesas) balde(chaveDoMes(d.quando)).despesas.push(d);

  return [...meses.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, b]) => {
      const l = calcularLucro(b.fechos, b.despesas);
      return { mes, receita: l.receita, despesas: l.despesas, lucro: l.lucro };
    });
}

export interface Caixa {
  /** O saldo que ele declarou, do banco. */
  declarado: number;
  declaradoEm: Date | null;
  /** O que se deve aos motoristas, HOJE. Calculado, exacto. */
  dosMotoristas: number;
  /** `declarado − dosMotoristas`. Pode ser negativo, e aí é um aviso. */
  livre: number;
  /** Há quantos dias o saldo foi declarado. `null` se nunca foi. */
  diasDesdeADeclaracao: number | null;
}

/**
 * A caixa: o que está na conta, e quanto disso já é dos motoristas.
 *
 * ─── PORQUE É QUE O «NA CONTA» NÃO É CALCULADO ──────────────────────────────
 *
 * Porque a aplicação não vê o banco. As prestações dos créditos saem por
 * débito direto, as despesas pagas com o cartão pessoal entram por outro lado,
 * e nada disso passa por aqui. Um saldo calculado só com o que a aplicação
 * conhece estaria sempre errado — e errado para MAIS, que é o pior lado: dava
 * a ideia de haver dinheiro que não há.
 *
 * Então declara-se, com data. O que é calculado — e é exacto — é a parte que
 * já é dos motoristas. A subtração dos dois é o número que interessa: o que
 * sobra para a empresa gastar.
 *
 * Quanto mais antiga a declaração, menos vale o «livre». Por isso conta-se os
 * dias e a tela avisa.
 */
export function calcularCaixa(
  declarado: { valor: number; quando: Date } | null,
  dosMotoristas: number,
  hoje: Date = new Date(),
): Caixa {
  const valor = declarado ? cent(declarado.valor) : 0;
  const devido = Math.abs(cent(dosMotoristas));

  const dias = declarado
    ? Math.max(0, Math.floor(
      (hoje.getTime() - declarado.quando.getTime()) / 86_400_000,
    ))
    : null;

  return {
    declarado: euros(valor),
    declaradoEm: declarado?.quando ?? null,
    dosMotoristas: euros(devido),
    livre: euros(valor - devido),
    diasDesdeADeclaracao: dias,
  };
}
