// src/modules/fleet-import/parsers/tipos.ts
//
// A forma que os três leitores de despesas devolvem.
//
// ─── PORQUE É QUE TODOS DEVOLVEM O MESMO ────────────────────────────────────
//
// A Via Verde dá um PDF com um resumo por identificador. A Prio Frota dá um
// PDF com cada abastecimento partido em quatro linhas. A Prio Electric dá uma
// linha por carregamento. Três formatos que não se parecem em nada.
//
// Mas a pergunta é sempre a mesma: quanto gastou cada matrícula nesta semana.
// Ao obrigar os três a responder na mesma forma, quem constrói os rascunhos
// não precisa de saber de onde veio nada — e acrescentar uma quarta fonte
// amanhã não lhe mexe numa linha.
//
// ─── PORQUE É QUE `confere` NÃO É UM DETALHE ────────────────────────────────
//
// Estes ficheiros são lidos por posição de texto dentro de um PDF. No dia em
// que o fornecedor mexer no espaçamento, um leitor distraído lê 3.000 € onde
// estão 30,00 € e ninguém repara — porque um número plausível não levanta
// suspeitas.
//
// Por isso cada leitor tem de encontrar uma maneira de se verificar a si
// próprio, e dizer aqui se ela passou. Quem importa RECUSA tudo se `confere`
// for falso. Um importador que falha alto é útil; um que acerta quase sempre
// é uma armadilha.

/** O que uma matrícula gastou, já somado. */
export interface DespesaPorMatricula {
  matricula: string;
  total: number;
}

export interface Leitura {
  /** Uma entrada por matrícula, somada. */
  porMatricula: DespesaPorMatricula[];

  /**
   * O que foi lido mas não se conseguiu atribuir a um carro.
   *
   * Não se deita fora: entra aqui com o valor, e quem importa avisa a pessoa
   * para ir rever à mão. Descartar em silêncio fazia a soma deixar de fechar
   * — e a importação passava a ser recusada por engano nosso.
   */
  semMatricula: { total: number; ocorrencias: number };

  /** A soma de tudo o que foi lido, atribuído ou não. */
  totalLido: number;

  /**
   * O total que o próprio documento declara, quando o traz.
   *
   * A Via Verde traz. Os PDFs da Prio NÃO — o ecrã mostra-o, o ficheiro não —
   * e por isso ela verifica-se de outra maneira: cada linha traz o valor sem
   * IVA e o IVA, e os dois têm de dar o total da linha.
   */
  totalDeclarado: number | null;

  /** Passou a verificação própria deste leitor. Falso = não importar nada. */
  confere: boolean;

  /** Em português, para aparecerem no ecrã tal como estão. */
  avisos: string[];
}
