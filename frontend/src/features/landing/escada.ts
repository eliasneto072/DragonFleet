// src/features/landing/escada.ts
//
// A escada dos planos: o que cada degrau ACRESCENTA ao anterior.
//
// ─── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
//
// A tabela de preços mostrava os três planos com a lista completa de cada um:
// 12, 15 e 19 marcas de visto, quase todas iguais. Quem olha não encontra a
// diferença — e um comprador que não vê a diferença entre o que paga 10 e o
// que paga 28 não escolhe o de 28: fica no primeiro, ou vai-se embora.
//
// Dito como escada, a mesma informação cabe em três linhas:
//
//   Essencial — Tudo o do Básico, mais: Oficina · Equipa · Importar despesas
//
// ─── E PORQUE É QUE ISTO NÃO É UM `slice()` ─────────────────────────────────
//
// Porque «tudo o do plano anterior» é uma AFIRMAÇÃO, e numa página de preços
// uma afirmação falsa custa um cliente e a credibilidade toda.
//
// Os planos são montados à mão no painel do dono, caixa a caixa. Nada obriga
// o plano caro a conter o barato: basta uma caixa por marcar para o Completo
// ficar sem uma coisa que o Essencial tem. Nesse caso, dizer «tudo o do
// Essencial, mais…» é mentira — e é a pior espécie, porque só se descobre
// depois de pagar.
//
// Então verifica-se. Se o anterior couber mesmo todo dentro deste, diz-se a
// frase e mostra-se só o que acrescenta. Se não couber, mostra-se a lista
// completa desse plano, como antes. Vale sempre, mesmo que um dia alguém
// monte os planos de uma maneira que ninguém previu.

export interface FuncionalidadeDoPlano {
  codigo: string;
  nome: string;
}

export interface PlanoPublico {
  id: string;
  nome: string;
  preco: string;
  duracaoDias: number;
  inclui: FuncionalidadeDoPlano[];
}

export interface Degrau<P extends PlanoPublico = PlanoPublico> {
  plano: P;
  /**
   * O nome do plano anterior, quando este o contém todo. `null` quando não
   * contém — e aí a tela mostra a lista completa.
   */
  herdaDe: string | null;
  /** O que mostrar: só o que acrescenta, ou a lista toda. Nunca vazio. */
  mostrar: FuncionalidadeDoPlano[];
}

/** O preço como número, para ordenar. Lixo vai para o fim, não para o início. */
function precoDe(p: PlanoPublico): number {
  const n = Number(p.preco);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/**
 * Os planos por ordem de preço, cada um com o que acrescenta ao anterior.
 *
 * A ordem é a do preço e não a que vier do servidor: uma escada só se lê como
 * escada se os degraus estiverem por ordem, e «tudo o do anterior» só faz
 * sentido se o anterior for mesmo o mais barato dos de cima.
 */
export function escadaDePlanos<P extends PlanoPublico>(planos: readonly P[]): Degrau<P>[] {
  const ordenados = [...planos].sort((a, b) => precoDe(a) - precoDe(b));

  return ordenados.map((plano, i) => {
    const anterior = i > 0 ? ordenados[i - 1] : null;

    if (!anterior) {
      return { plano, herdaDe: null, mostrar: plano.inclui };
    }

    const codigos = new Set(plano.inclui.map((f) => f.codigo));
    const contemOAnterior = anterior.inclui.every((f) => codigos.has(f.codigo));
    const novas = plano.inclui.filter(
      (f) => !anterior.inclui.some((a) => a.codigo === f.codigo),
    );

    // Contém o anterior E acrescenta alguma coisa: é um degrau a sério.
    //
    // Se não acrescentar nada, são dois planos com a mesma lista a preços
    // diferentes. Dizer «tudo o do anterior, mais: (nada)» era sublinhar isso
    // na cara de quem está a decidir; a lista completa pelo menos não chama a
    // atenção para o problema — que é de quem montou os planos, não da tela.
    if (contemOAnterior && novas.length > 0) {
      return { plano, herdaDe: anterior.nome, mostrar: novas };
    }

    return { plano, herdaDe: null, mostrar: plano.inclui };
  });
}
