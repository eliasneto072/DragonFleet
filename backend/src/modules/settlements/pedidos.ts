// src/modules/settlements/pedidos.ts
//
// As regras dos pedidos de esclarecimento sobre uma linha do fecho.
//
// ─── PORQUE É QUE ISTO ESTÁ FORA DO SERVIÇO ─────────────────────────────────
//
// São três decisões pequenas e todas com uma forma de falhar em silêncio:
//
//   · que linhas é que fazem sentido questionar naquela semana — mostrar uma
//     linha a zero convida a perguntar sobre nada;
//   · se já há um pedido aberto sobre aquela linha — e aqui a base de dados
//     também tem a guarda, mas o erro dela é um 500 e não uma frase;
//   · o que é que o motorista lê quando não pode perguntar.
//
// Nenhuma destas dá erro quando está mal. Dá um botão a mais, ou um botão a
// menos, e ninguém desconfia. Aqui testam-se em três linhas cada.
//
// ─── PORQUE É QUE O CATÁLOGO ESTÁ AQUI E NÃO NO FRONTEND ────────────────────
//
// Porque é o servidor que sabe que valor é que cada linha tem naquela semana,
// e é por esse valor que se decide se a linha aparece. Com o catálogo do outro
// lado, o browser recebia os dez nomes e tinha de adivinhar os valores — e no
// dia em que o fecho ganhasse uma linha nova, ficava um nome sem valor.

// `import type` e não um import normal: assim este ficheiro não arrasta o
// cliente do Prisma, e os testes correm sem base de dados nenhuma.
import type { SettlementLine } from '@prisma/client';

/** Quantos pedidos abertos uma pessoa pode ter no mesmo fecho. */
export const MAXIMO_DE_ABERTOS_POR_FECHO = 4;

/**
 * As linhas do fecho que se podem questionar, com o nome que o motorista lê e
 * o campo do fecho onde o valor está.
 *
 * A ORDEM É A DA TELA: a Via Verde primeiro porque é a dúvida que ele trouxe
 * («as vezes a motoristas que acham estranho os valores»), e o resto na ordem
 * em que aparece no fecho.
 */
export const LINHAS: {
  linha: SettlementLine;
  etiqueta: string;
  /** O campo do fecho. `null` na OUTRA, que não tem valor próprio. */
  campo: string | null;
}[] = [
  { linha: 'VIA_VERDE',       etiqueta: 'Via Verde (portagens)', campo: 'tollsAmount' },
  { linha: 'COMBUSTIVEL',     etiqueta: 'Combustível',           campo: 'fuelAmount' },
  { linha: 'CARREGAMENTO',    etiqueta: 'Carregamento elétrico', campo: 'chargeAmount' },
  { linha: 'VIATURA',         etiqueta: 'Viatura',               campo: 'vehicleFee' },
  { linha: 'OUTRAS_DEDUCOES', etiqueta: 'Outras deduções',       campo: 'otherDeductions' },
  { linha: 'IMPOSTO',         etiqueta: 'Imposto',               campo: 'taxAmount' },
  { linha: 'COMISSAO',        etiqueta: 'Comissão',              campo: 'commissionAmount' },
  { linha: 'UBER',            etiqueta: 'Uber',                  campo: 'uberAmount' },
  { linha: 'BOLT',            etiqueta: 'Bolt',                  campo: 'boltAmount' },
  // Sempre disponível, e de propósito a última: é a saída para a dúvida que
  // não cabe em nenhuma linha. Sem ela, quem não encontrasse a sua linha
  // voltava ao WhatsApp — que é o que isto existe para evitar.
  { linha: 'OUTRA',           etiqueta: 'Outra dúvida',          campo: null },
];

const POR_LINHA = new Map(LINHAS.map((l) => [l.linha, l]));

/** A etiqueta de uma linha. Uma linha desconhecida devolve o próprio código. */
export function etiquetaDaLinha(linha: SettlementLine | string): string {
  return POR_LINHA.get(linha as SettlementLine)?.etiqueta ?? String(linha);
}

export function linhaConhecida(linha: string): linha is SettlementLine {
  return POR_LINHA.has(linha as SettlementLine);
}

/** Os valores do fecho de que esta decisão precisa. Nulos contam como zero. */
export type ValoresDoFecho = Record<string, number | null | undefined>;

export interface LinhaQuestionavel {
  linha: SettlementLine;
  etiqueta: string;
  /** O valor daquela linha naquela semana. Zero na OUTRA. */
  valor: number;
  /** Já há um pedido ABERTO sobre esta linha. */
  pedidoAberto: boolean;
  /** Já houve um pedido RESPONDIDO sobre esta linha. */
  jaRespondido: boolean;
  /** Pode pedir agora. */
  disponivel: boolean;
  /** Porque não, quando não pode. Nulo quando pode. */
  motivo: string | null;
}

export interface PedidoExistente {
  line: SettlementLine | string;
  status: 'ABERTO' | 'RESPONDIDO' | string;
}

/**
 * Que linhas é que este motorista pode questionar neste fecho.
 *
 * ─── PORQUE É QUE UMA LINHA A ZERO NÃO APARECE ──────────────────────────────
 *
 * Porque não há dúvida possível sobre um zero. Mostrar as dez linhas sempre
 * dava uma lista em que sete não querem dizer nada naquela semana, e a Via
 * Verde — que é a razão de isto existir — ficava perdida no meio delas.
 *
 * A OUTRA é a excepção e aparece sempre: é a linha que não tem valor próprio.
 *
 * ─── PORQUE É QUE UMA LINHA JÁ RESPONDIDA CONTINUA DISPONÍVEL ───────────────
 *
 * Porque o extrato pode chegar e continuar a não bater certo. Fechar a porta
 * depois de uma resposta transformava «já respondi» em «não voltas a
 * perguntar», o que é exactamente a conversa que se queria evitar.
 */
export function linhasQuestionaveis(
  fecho: ValoresDoFecho,
  existentes: PedidoExistente[] = [],
  maximoDeAbertos: number = MAXIMO_DE_ABERTOS_POR_FECHO,
): LinhaQuestionavel[] {
  const abertos = new Set(
    existentes.filter((p) => p.status === 'ABERTO').map((p) => p.line),
  );
  const respondidos = new Set(
    existentes.filter((p) => p.status === 'RESPONDIDO').map((p) => p.line),
  );

  const cheio = abertos.size >= maximoDeAbertos;

  const out: LinhaQuestionavel[] = [];
  for (const def of LINHAS) {
    const bruto = def.campo === null ? 0 : Number(fecho[def.campo] ?? 0);
    // Em valor absoluto: um fecho pode guardar uma dedução com sinal negativo,
    // e −14,45 € é tão questionável como 14,45 €.
    const valor = Number.isFinite(bruto) ? Math.abs(bruto) : 0;

    // Fora as linhas sem valor, menos a OUTRA. Mas uma linha a zero com um
    // pedido já feito FICA na lista: senão, o pedido que ele fez desaparecia
    // do ecrã no dia em que alguém corrigisse o fecho para zero.
    const temHistorico = abertos.has(def.linha) || respondidos.has(def.linha);
    if (def.campo !== null && valor === 0 && !temHistorico) continue;

    const pedidoAberto = abertos.has(def.linha);
    const motivo = pedidoAberto
      ? 'Já pediste esclarecimento sobre esta linha. Está à espera de resposta.'
      : cheio
        ? `Tens ${abertos.size} pedidos à espera de resposta nesta semana. Aguarda uma resposta antes de pedir mais.`
        : null;

    out.push({
      linha: def.linha,
      etiqueta: def.etiqueta,
      valor,
      pedidoAberto,
      jaRespondido: respondidos.has(def.linha),
      disponivel: motivo === null,
      motivo,
    });
  }
  return out;
}

/**
 * Pode pedir sobre esta linha?
 *
 * A base de dados tem a mesma guarda num índice único parcial, e é ela que
 * manda: duas pessoas a carregar no botão ao mesmo tempo passam as duas por
 * aqui. Esta função existe para o motorista ler uma frase em vez de um erro.
 */
export function podePedir(
  fecho: ValoresDoFecho,
  linha: string,
  existentes: PedidoExistente[] = [],
  maximoDeAbertos: number = MAXIMO_DE_ABERTOS_POR_FECHO,
): { pode: boolean; motivo: string | null } {
  if (!linhaConhecida(linha)) {
    return { pode: false, motivo: 'Essa linha do fecho não existe.' };
  }
  const achada = linhasQuestionaveis(fecho, existentes, maximoDeAbertos)
    .find((l) => l.linha === linha);

  if (!achada) {
    return {
      pode: false,
      motivo: 'Essa linha não tem valor nesta semana, por isso não há nada a esclarecer.',
    };
  }
  return { pode: achada.disponivel, motivo: achada.motivo };
}

/** Uma resposta sem texto nem ficheiro não é uma resposta. */
export function respostaCompleta(
  resposta: { answer?: string | null; fileUrl?: string | null },
): boolean {
  const texto = (resposta.answer ?? '').trim();
  const ficheiro = (resposta.fileUrl ?? '').trim();
  return texto.length > 0 || ficheiro.length > 0;
}

export interface PedidoParaResumo {
  line: SettlementLine | string;
  status: string;
  createdAt: Date | string;
}

export interface ResumoDosPedidos {
  abertos: number;
  /** A data do pedido aberto mais antigo. Nula quando não há abertos. */
  maisAntigo: string | null;
  /** Quantos abertos por linha, da linha com mais para a com menos. */
  porLinha: { linha: string; etiqueta: string; abertos: number }[];
}

/**
 * O resumo que alimenta o contador do menu.
 *
 * Conta só os ABERTOS: um pedido respondido já não é trabalho, e contá-lo
 * deixava o número do menu aceso para sempre — o problema que a nota do
 * `fontes.ts` descreve com o nível 'inform'.
 */
export function resumirPedidos(pedidos: PedidoParaResumo[]): ResumoDosPedidos {
  const abertos = pedidos.filter((p) => p.status === 'ABERTO');

  const datas = abertos
    .map((p) => new Date(p.createdAt).getTime())
    .filter((t) => !Number.isNaN(t));

  const contagem = new Map<string, number>();
  for (const p of abertos) {
    const k = String(p.line);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }

  return {
    abertos: abertos.length,
    maisAntigo: datas.length ? new Date(Math.min(...datas)).toISOString() : null,
    porLinha: [...contagem.entries()]
      .map(([linha, n]) => ({ linha, etiqueta: etiquetaDaLinha(linha), abertos: n }))
      .sort((a, b) => b.abertos - a.abertos || a.etiqueta.localeCompare(b.etiqueta, 'pt')),
  };
}
