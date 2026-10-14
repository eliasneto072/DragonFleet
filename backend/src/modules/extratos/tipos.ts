// src/modules/extratos/tipos.ts
//
// A forma que todos os leitores de extratos bancários devolvem.
//
// ─── CINCO BANCOS, CINCO DIALECTOS ──────────────────────────────────────────
//
// Os extratos dele não se parecem em nada uns com os outros:
//
//   Abanca            montante com sinal numa coluna só, vírgula decimal
//   Novo Banco        débito e crédito em colunas separadas, datas dd.mm.aa
//   Millennium        PONTO decimal, menos à DIREITA do número, datas m.dd
//   Revolut Business  «€1 000.00», ponto decimal, datas «27 set. 2026»
//   Revolut pessoal   «170,20€», VÍRGULA decimal, e linhas de câmbio pelo meio
//
// Dois deles escrevem o decimal com ponto e dois com vírgula. Um põe o euro
// antes do número e outro depois. Um escreve o negativo com o sinal no fim.
// Tratar isto com uma expressão regular genérica era pedir para ler 1.234,56
// como 1,23 € — e esse engano entra na contabilidade sem rebentar nada.
//
// Ao obrigar os cinco a responder na mesma forma, quem classifica e quem grava
// não precisa de saber de onde veio nada.
//
// ─── A VERIFICAÇÃO É O QUE TORNA ISTO SEGURO DE USAR ────────────────────────
//
// Um extrato bancário tem uma propriedade que os PDFs da Via Verde e da Prio
// não têm: a COLUNA DO SALDO. Cada linha diz com quanto a conta ficou.
//
// Isso dá uma verificação linha a linha, e não só do total: o saldo de cada
// movimento tem de ser o saldo do anterior mais o valor daquele movimento. Um
// único valor lido a mais ou a menos parte a cadeia e é apanhado na hora.
//
// É muito mais forte do que conferir uma soma. Uma soma fecha por acaso quando
// dois enganos se cancelam; uma cadeia de saldos não.
//
// Quando a cadeia não fecha, `confere` é falso e NÃO SE IMPORTA NADA. Metade
// de um extrato importado como se estivesse completo é pior do que nenhum.

export type Banco =
  | 'ABANCA'
  | 'NOVO_BANCO'
  | 'MILLENNIUM'
  | 'REVOLUT'
  | 'REVOLUT_BUSINESS';

export const NOMES_DOS_BANCOS: Record<Banco, string> = {
  ABANCA: 'ABANCA',
  NOVO_BANCO: 'Novo Banco',
  MILLENNIUM: 'Millennium BCP',
  REVOLUT: 'Revolut',
  REVOLUT_BUSINESS: 'Revolut Business',
};

export interface Movimento {
  /** A data valor, em "AAAA-MM-DD". É a que conta para o mês. */
  data: string;
  /**
   * A data de lançamento, quando o banco a distingue da data valor.
   *
   * Guarda-se porque as duas caem em meses diferentes na viragem: o Novo
   * Banco tem lançamentos a 01.10 com data valor 30.09. Para saber em que mês
   * a despesa entra manda a data VALOR — mas para encontrar o movimento no
   * homebanking manda a de lançamento, e sem ela não há como o localizar.
   */
  dataLancamento: string | null;

  descricao: string;

  /** Negativo saiu, positivo entrou. Sempre, em todos os bancos. */
  valor: number;

  /** O saldo depois deste movimento, como o banco o imprime. */
  saldo: number | null;

  /** A referência do banco, quando existe. Serve para não importar duas vezes. */
  referencia: string | null;
}

export interface LeituraDeExtrato {
  banco: Banco;

  /**
   * Os últimos quatro dígitos do IBAN, e mais nada.
   *
   * ─── PORQUE É QUE O IBAN NÃO É GUARDADO INTEIRO ─────────────────────────
   *
   * Porque não é preciso para nada do que isto faz. Serve para a pessoa
   * reconhecer de que conta é o extrato e para o sistema não misturar duas
   * contas do mesmo banco. Os quatro últimos dígitos bastam para as duas
   * coisas, e um IBAN completo guardado numa base de dados é um risco que não
   * se paga a troco de nenhuma funcionalidade.
   */
  contaTerminadaEm: string | null;

  periodo: { de: string | null; ate: string | null };

  movimentos: Movimento[];

  /** O saldo antes do primeiro movimento, quando o extrato o declara. */
  saldoInicial: number | null;
  /** O saldo depois do último, quando o extrato o declara. */
  saldoFinal: number | null;

  /**
   * Passou a verificação da cadeia de saldos.
   *
   * Falso quer dizer: NÃO IMPORTAR NADA. Não quer dizer "importar com
   * cuidado" nem "importar o que der".
   */
  confere: boolean;

  /** Em português, para aparecerem no ecrã tal como estão. */
  avisos: string[];
}

/** O que um leitor devolve antes de a cadeia de saldos ser conferida. */
export interface LeituraCrua {
  banco: Banco;
  contaTerminadaEm: string | null;
  periodo: { de: string | null; ate: string | null };
  movimentos: Movimento[];
  saldoInicial: number | null;
  saldoFinal: number | null;
  avisos: string[];

  /**
   * O leitor já sabe que isto não pode ser importado, e porquê.
   *
   * ─── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────
   *
   * Nos bancos que escrevem o débito e o crédito em colunas separadas, o
   * sinal é deduzido da diferença de saldos (ver `assinar.ts`). Isso faz a
   * cadeia de saldos fechar SEMPRE — não porque os valores estejam certos,
   * mas porque foram construídos a partir dela.
   *
   * Nesses casos a verificação verdadeira é feita dentro do leitor — a
   * grandeza lida tem de coincidir com a diferença — e o resultado vem por
   * aqui. Sem este campo, `conferir()` dava um «confere» que não verificava
   * nada, que é muito pior do que não verificar.
   */
  recusa: string | null;
}
