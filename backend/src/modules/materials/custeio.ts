// src/modules/materials/custeio.ts
//
// A aritmética do stock: quanto fica, e a quanto fica.
//
// ─── PORQUE É QUE ISTO ESTÁ FORA DO SERVIÇO ─────────────────────────────────
//
// Porque é a única parte do inventário onde um erro não dá erro. Um `where`
// mal escrito mostra a lista errada e nota-se; uma média ponderada mal feita
// mostra um número plausível que está errado, e o sintoma é descobrir, meses
// depois, que o custo por carro nunca bateu com as facturas. Aqui estas contas
// testam-se com três linhas cada.
//
// ─── CUSTO MÉDIO PONDERADO ──────────────────────────────────────────────────
//
// A pergunta a que isto serve é "quanto me custou o material que gastei neste
// carro". Comprando o mesmo óleo a 4,10 € e depois a 4,60 €, nenhum dos dois
// preços responde: o que responde é a média pesada pelas quantidades. É a
// conta que a contabilidade portuguesa aceita (CMP) e a única que não depende
// da ordem em que o material se gasta.
//
//   novo custo médio = (valor do que havia + valor do que entrou)
//                      ────────────────────────────────────────────
//                               quantidade total
//
// As saídas NÃO mexem na média: tirar metade da prateleira não muda quanto
// custou cada unidade do que lá ficou.

/** Quantidades a três casas (meio litro de óleo é 0,5; um parafuso é 1). */
export const CASAS_DA_QUANTIDADE = 3;
/** Custos unitários a quatro casas — ver a nota na migração sobre o parafuso. */
export const CASAS_DO_CUSTO = 4;
/** Dinheiro ao cêntimo, como no resto do projeto. */
export const CASAS_DO_DINHEIRO = 2;

/**
 * Arredonda meio para longe do zero, sem o erro do binário.
 *
 * ─── OS DOIS PROBLEMAS QUE ISTO RESOLVE ─────────────────────────────────────
 *
 * 1. `0.615` não existe exactamente em ponto flutuante: vale
 *    61,49999999999999 quando multiplicado por 100, e por isso
 *    `(0.615).toFixed(2)` dá "0.61". O `toPrecision(15)` corta o lixo que vem
 *    depois da décima quinta casa significativa — que é onde o erro vive — sem
 *    mexer em nada que já esteja certo.
 *
 * 2. O `Math.round` arredonda SEMPRE para cima no sentido do eixo, e por isso
 *    trata −2,175 e 2,175 de maneira diferente: 2,18 e −2,17. Num inventário
 *    isso aparece como uma falta a valer menos do que a sobra da mesma
 *    quantidade — e um ajuste que se desfaz a si mesmo deixa dinheiro pelo
 *    caminho. Arredondar o valor absoluto e repor o sinal trata os dois lados
 *    por igual, que é o arredondamento comercial de sempre.
 */
export function arredondar(valor: number, casas: number): number {
  if (!Number.isFinite(valor)) return 0;
  const f = 10 ** casas;
  const corrigido = Number((valor * f).toPrecision(15));
  const sinal = corrigido < 0 ? -1 : 1;
  return (sinal * Math.round(Math.abs(corrigido))) / f;
}

export const emQuantidade = (n: number) => arredondar(n, CASAS_DA_QUANTIDADE);
export const emCusto      = (n: number) => arredondar(n, CASAS_DO_CUSTO);
export const emDinheiro   = (n: number) => arredondar(n, CASAS_DO_DINHEIRO);

/** O estado de um material antes do movimento. */
export interface Estado {
  qty: number;
  avgCost: number;
}

/** O que o movimento deixa escrito, e como fica o material. */
export interface Resultado {
  /** O material depois do movimento. */
  estado: Estado;
  /** O custo por unidade a gravar NO movimento. */
  unitCost: number;
  /** O valor total do movimento, ao cêntimo. */
  totalCost: number;
}

export class ErroDeStock extends Error {
  /// O `codigo` é declarado e atribuído à mão em vez de ser um parâmetro de
  /// propriedade (`constructor(public codigo: string)`): essa forma é açúcar do
  /// TypeScript que precisa de transpilação a sério, e o `node
  /// --experimental-strip-types` — que é como estes testes correm — recusa-a.
  /// Duas linhas a mais para as regras poderem ser testadas sem build.
  readonly codigo: string;

  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeStock';
    this.codigo = codigo;
  }
}

function exigirQuantidade(qty: number): number {
  const q = emQuantidade(qty);
  if (!Number.isFinite(q) || q <= 0) {
    throw new ErroDeStock('QTY_INVALIDA', 'A quantidade tem de ser maior do que zero.');
  }
  return q;
}

/**
 * Uma compra.
 *
 * `unitCost` zero é válido e não é um descuido: material de garantia, uma
 * amostra, um brinde do fornecedor. O que é inválido é negativo — isso é uma
 * devolução, e uma devolução é uma saída.
 */
export function entrada(estado: Estado, qty: number, unitCost: number): Resultado {
  const q = exigirQuantidade(qty);
  const custo = emCusto(unitCost);
  if (!Number.isFinite(custo) || custo < 0) {
    throw new ErroDeStock('CUSTO_INVALIDO', 'O preço não pode ser negativo.');
  }

  const qtyAntes = emQuantidade(estado.qty);
  const novaQty = emQuantidade(qtyAntes + q);

  // ─── O stock negativo é tratado, não ignorado ─────────────────────────────
  //
  // Um material pode ter saldo negativo (ver `saida`), e nesse caso o "valor do
  // que havia" é negativo. Somá-lo dava uma média sem sentido — e com a
  // quantidade a passar por zero, uma divisão explosiva. Quando o que havia
  // não é positivo, a média passa a ser simplesmente o preço desta compra: é a
  // única informação de custo fiável que existe naquele momento.
  const novoCusto = qtyAntes > 0
    ? emCusto((qtyAntes * emCusto(estado.avgCost) + q * custo) / novaQty)
    : custo;

  return {
    estado: { qty: novaQty, avgCost: novoCusto },
    unitCost: custo,
    totalCost: emDinheiro(q * custo),
  };
}

/**
 * Um consumo.
 *
 * ─── PORQUE É QUE ISTO DEIXA O STOCK FICAR NEGATIVO ──────────────────────────
 *
 * Porque recusar é pior. O material saiu da prateleira — isso já aconteceu, e
 * o que falta é a entrada que ninguém lançou. Recusar o consumo obriga a
 * inventar uma compra para o poder registar, e aí a contagem passa a estar
 * errada em dois sítios em vez de um. Deixa-se passar, o saldo fica negativo, e
 * o negativo é o próprio aviso de que falta lançar uma factura.
 *
 * Quem quiser impedir isto impede-o na tela, com a confirmação à frente dos
 * olhos — não aqui, onde o utilizador já não está para responder.
 *
 * A média NÃO muda: ver a nota no topo.
 */
export function saida(estado: Estado, qty: number): Resultado {
  const q = exigirQuantidade(qty);
  const custo = emCusto(estado.avgCost);

  return {
    estado: { qty: emQuantidade(emQuantidade(estado.qty) - q), avgCost: custo },
    unitCost: custo,
    totalCost: emDinheiro(q * custo),
  };
}

/**
 * Uma contagem: o stock é ESTE, e não o que estava escrito.
 *
 * Recebe a quantidade CONTADA e não a diferença, porque é isso que a pessoa
 * tem à frente — contou dezassete, escreve dezassete. A diferença é a conta
 * que o sistema faz, e é ela que fica no movimento com o sinal certo.
 *
 * Uma contagem para cima com stock a zero não tem custo de onde sair: nesse
 * caso aceita-se um `unitCost` escrito à mão, e sem ele a média fica como
 * estava. É melhor um ajuste sem custo do que um ajuste recusado — a
 * quantidade é a parte que interessa à prateleira.
 */
export function ajuste(
  estado: Estado,
  quantidadeContada: number,
  unitCost?: number,
): Resultado & { diferenca: number } {
  const contada = emQuantidade(quantidadeContada);
  if (!Number.isFinite(contada) || contada < 0) {
    throw new ErroDeStock('QTY_INVALIDA', 'A quantidade contada não pode ser negativa.');
  }

  const antes = emQuantidade(estado.qty);
  const diferenca = emQuantidade(contada - antes);
  if (diferenca === 0) {
    throw new ErroDeStock('SEM_DIFERENCA', 'A contagem é igual ao stock — não há nada a ajustar.');
  }

  const mediaAntes = emCusto(estado.avgCost);
  const custoDado = unitCost === undefined ? null : emCusto(unitCost);
  if (custoDado !== null && (!Number.isFinite(custoDado) || custoDado < 0)) {
    throw new ErroDeStock('CUSTO_INVALIDO', 'O preço não pode ser negativo.');
  }

  // A sobra entra a um preço: o que foi escrito, ou a média que já havia.
  const custo = custoDado ?? mediaAntes;

  // Uma sobra com o stock a zero é a única altura em que um ajuste pode fixar a
  // média — não havia média nenhuma para preservar.
  const novaMedia = diferenca > 0 && antes <= 0 && custo > 0 ? custo : mediaAntes;

  return {
    estado: { qty: contada, avgCost: novaMedia },
    unitCost: custo,
    // O valor acompanha o sinal da diferença: uma falta é um prejuízo.
    totalCost: emDinheiro(diferenca * custo),
    diferenca,
  };
}

/** O que está em stock vale isto. É o número do inventário no fim do ano. */
export function valorDoStock(linhas: Estado[]): number {
  return emDinheiro(
    linhas.reduce((soma, l) => soma + emQuantidade(l.qty) * emCusto(l.avgCost), 0),
  );
}

/** Abaixo do mínimo. `null` no mínimo quer dizer "não assinalar nunca". */
export function stockBaixo(qty: number, minQty: number | null | undefined): boolean {
  if (minQty === null || minQty === undefined) return false;
  return emQuantidade(qty) <= emQuantidade(minQty);
}
