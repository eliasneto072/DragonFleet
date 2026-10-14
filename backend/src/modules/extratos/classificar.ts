// src/modules/extratos/classificar.ts
//
// O que é despesa, o que é receita, e o que é dinheiro a mudar de bolso.
//
// ─── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
//
// No extrato da Revolut Business de Setembro estão estas duas linhas:
//
//     23 set.  Dinheiro adicionado a partir de CHROMATIC DRAGON    +1 000,00
//     27 set.  Para Diogo Rafael Leal Isaias • Devolução Suprimentos  −900,00
//
// Nenhuma das duas é receita ou despesa. A primeira é dinheiro que saiu de uma
// conta da empresa para outra conta da empresa; a segunda é a devolução de
// dinheiro que o sócio tinha emprestado. Contadas como receita e despesa,
// acrescentam 1.900 € de movimento a um mês que teve 36 € de resultado — e o
// lucro passa a ser ficção.
//
// E não é um caso isolado: o extrato do Millennium tem «TRF. P/O Diogo Rafael
// Leal Isaias» e o do Novo Banco tem «Trf Imediata Sepa+ De Diogo Rafael Leal
// Isaias». É a mesma pessoa a mover o seu próprio dinheiro entre as suas
// próprias contas, quatro bancos diferentes, quatro descritivos diferentes.
//
// ─── PORQUE É QUE OS NOMES NÃO ESTÃO ESCRITOS AQUI ──────────────────────────
//
// Porque um nome dentro do código é uma funcionalidade que só serve a uma
// pessoa. Esta função RECEBE a lista de nomes e contas próprias; quem a chama
// vai buscá-la à base de dados — o nome do utilizador, o nome da empresa, e os
// que ele acrescentar. No dia em que uma segunda frota usar isto, funciona sem
// se tocar numa linha.
//
// É a mesma regra que já vale no resto do projeto: a identificação faz-se por
// marca na conta e nunca por um nome ou um email escrito à mão.
//
// ─── A CLASSIFICAÇÃO É UM PALPITE, E ASSUME-SE COMO TAL ─────────────────────
//
// Cada movimento sai daqui com um `motivo`: a frase que explica porque foi
// classificado assim. No ecrã de revisão ela aparece ao lado, e qualquer linha
// pode ser mudada à mão antes de gravar — foi o que ele escolheu («marcar como
// transferência e não contar», com correcção possível).
//
// Um palpite que se explica e se corrige é útil. Um palpite silencioso é uma
// avaria à espera de acontecer.

export type Classe = 'DESPESA' | 'RECEITA' | 'TRANSFERENCIA';

export interface Identidades {
  /**
   * Os nomes próprios e da empresa, como aparecem nos descritivos.
   *
   * Vêm da base de dados. Comparam-se sem acentos e sem maiúsculas, porque
   * cada banco os escreve à sua maneira: «ISAIAS», «Isaías», «Isaias».
   */
  nomes: string[];
  /** Os últimos quatro dígitos das contas dele, para reconhecer o destino. */
  contas?: string[];
}

export interface Classificacao {
  classe: Classe;
  /** A frase que explica a decisão, para aparecer no ecrã de revisão. */
  motivo: string;
  /**
   * A confiança da decisão.
   *
   * 'certa'   — um marcador explícito do banco. Não vale a pena duvidar.
   * 'provavel'— o nome dele no descritivo, ou uma palavra conhecida.
   * 'pelo-sinal' — nada reconhecido: é despesa se saiu e receita se entrou.
   *
   * O ecrã mostra as 'pelo-sinal' sem destaque e as outras com o motivo. Sem
   * esta distinção, a pessoa tinha de reler as duzentas linhas para saber
   * quais é que o sistema tinha realmente reconhecido.
   */
  confianca: 'certa' | 'provavel' | 'pelo-sinal';
}

/** Sem acentos, sem maiúsculas, com os espaços normalizados. */
export function achatar(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Marcadores que os bancos escrevem e que não deixam dúvida.
 *
 * ─── PORQUE É QUE «SUPRIMENTOS» ENTRA AQUI ────────────────────────────────
 *
 * Porque suprimentos são empréstimos do sócio à empresa. O dinheiro que entra
 * não é venda e o que sai não é custo: é a devolução de um empréstimo. Tratá-lo
 * como receita inflava o lucro no mês em que ele põe dinheiro na empresa, e
 * como despesa deflacionava-o no mês em que o tira — e nenhum dos dois meses
 * teve nada a ver com o negócio.
 */
const MARCADORES_DE_TRANSFERENCIA = [
  'movimento entre contas',
  'suprimentos',
  'devolucao suprimentos',
  'transferencia entre contas',
  'transf entre contas',
  'dinheiro adicionado a partir de',
  'top up',
  'carregamento de conta',
];

/**
 * Palavras que indicam uma transferência para alguém, sem dizer quem.
 *
 * Não bastam por si: uma transferência para um fornecedor também começa por
 * «Trf». Só contam quando acompanhadas de um nome próprio — ver abaixo.
 */
const PALAVRAS_DE_TRANSFERENCIA = [
  'trf', 'transferencia', 'transf', 'sepa', 'mbway', 'para', 'de',
];

function temNomeProprio(texto: string, identidades: Identidades): string | null {
  for (const nome of identidades.nomes) {
    const achatado = achatar(nome);
    if (!achatado || achatado.length < 4) continue;

    if (texto.includes(achatado)) return nome;

    // Um banco abrevia o nome do meio e outro corta-o: «Diogo Rafael Leal
    // Isaias» aparece como «Diogo Rafael L Isaias» e como «DIOGO RAFAEL LEAL
    // ISAIA». Exigir o nome inteiro falhava nos dois.
    //
    // Então: o primeiro e o último nome, os dois presentes, bastam. Só o
    // primeiro não basta — há demasiados Diogos — e só o último também não.
    const partes = achatado.split(' ').filter((p) => p.length >= 3);
    if (partes.length >= 2) {
      const primeiro = partes[0];
      const ultimo = partes[partes.length - 1];
      if (texto.includes(primeiro) && texto.includes(ultimo)) return nome;
    }
  }
  return null;
}

/**
 * Classifica um movimento.
 *
 * O sinal do valor decide entre despesa e receita; o descritivo decide se é
 * uma transferência, que não é nem uma coisa nem outra.
 */
export function classificar(
  movimento: { descricao: string; valor: number },
  identidades: Identidades = { nomes: [] },
): Classificacao {
  const texto = achatar(movimento.descricao);

  // ── 1. Um marcador explícito do banco ────────────────────────────────────
  for (const marcador of MARCADORES_DE_TRANSFERENCIA) {
    if (texto.includes(marcador)) {
      return {
        classe: 'TRANSFERENCIA',
        motivo: `O banco escreveu «${marcador}»: é dinheiro a mudar de conta, não receita nem despesa.`,
        confianca: 'certa',
      };
    }
  }

  // ── 2. O número de uma conta dele no descritivo ──────────────────────────
  for (const conta of identidades.contas ?? []) {
    if (conta && conta.length >= 4 && texto.includes(achatar(conta))) {
      return {
        classe: 'TRANSFERENCIA',
        motivo: `O destino acaba em ${conta}, que é uma conta sua.`,
        confianca: 'certa',
      };
    }
  }

  // ── 3. O nome dele ou da empresa, com uma palavra de transferência ───────
  const nome = temNomeProprio(texto, identidades);
  if (nome) {
    const pareceTransferencia = PALAVRAS_DE_TRANSFERENCIA.some((p) =>
      new RegExp(`\\b${p}\\b`).test(texto));

    if (pareceTransferencia) {
      return {
        classe: 'TRANSFERENCIA',
        motivo: `Transferência de ou para «${nome}», que é você ou a sua empresa.`,
        confianca: 'provavel',
      };
    }

    // O nome dele sem palavra de transferência: por exemplo um ordenado pago
    // a ele próprio pela empresa, que É uma despesa da empresa. Não se decide
    // aqui — segue pelo sinal, com o motivo a dizer o que foi visto.
    return {
      classe: movimento.valor < 0 ? 'DESPESA' : 'RECEITA',
      motivo: `O descritivo tem o nome «${nome}» mas não parece uma transferência entre contas. Confirme.`,
      confianca: 'provavel',
    };
  }

  // ── 4. Nada reconhecido: manda o sinal ───────────────────────────────────
  return {
    classe: movimento.valor < 0 ? 'DESPESA' : 'RECEITA',
    motivo: movimento.valor < 0 ? 'Saiu dinheiro da conta.' : 'Entrou dinheiro na conta.',
    confianca: 'pelo-sinal',
  };
}

/** Quantas de cada, para o resumo do ecrã de revisão. */
export function contarClasses(
  classificados: { classe: Classe }[],
): Record<Classe, number> {
  const out: Record<Classe, number> = { DESPESA: 0, RECEITA: 0, TRANSFERENCIA: 0 };
  for (const c of classificados) out[c.classe]++;
  return out;
}
