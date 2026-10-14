// src/modules/extratos/index.ts
//
// Qual é o banco deste ficheiro, e quem o lê.
//
// ─── PORQUE É QUE O BANCO É RECONHECIDO E NÃO ESCOLHIDO ─────────────────────
//
// Podia-se pedir à pessoa para escolher o banco antes de carregar o ficheiro.
// Seria mais simples de programar e pior de usar: são seis contas em cinco
// bancos, e o engano — escolher «Novo Banco» e carregar o do Millennium —
// dava um extrato vazio ou, pior, um extrato lido com as regras erradas.
//
// Cada banco deixa a sua assinatura no texto: um BIC, um nome, um formato de
// cabeçalho. Reconhecer é fiável e poupa um passo.
//
// ─── A ORDEM DOS TESTES IMPORTA ─────────────────────────────────────────────
//
// A Revolut Business tem «Revolut» no texto e a pessoal também. Por isso
// testa-se primeiro a Business, que tem marcas que só ela tem («Saldo de
// abertura», «Nome da conta»). Ao contrário, todos os extratos da Revolut
// seriam lidos como pessoais — e as convenções dos números são diferentes.

import type { Banco, LeituraCrua, LeituraDeExtrato } from './tipos';
import { conferir } from './conferir';
import { ehAbanca, lerAbanca } from './bancos/abanca';
import { ehNovoBanco, lerNovoBanco } from './bancos/novo-banco';
import { ehMillennium, lerMillennium } from './bancos/millennium';
import { ehRevolut, ehRevolutBusiness, lerRevolutBusiness, lerRevolutPessoal } from './bancos/revolut';

export * from './tipos';
export { conferir } from './conferir';
export * from './classificar';

interface Leitor {
  banco: Banco;
  reconhece: (texto: string) => boolean;
  ler: (texto: string) => LeituraCrua;
}

/** Os leitores, pela ordem em que são testados. */
export const LEITORES: Leitor[] = [
  // A Business antes da pessoal: ver a nota acima.
  { banco: 'REVOLUT_BUSINESS', reconhece: (t) => ehRevolut(t) && ehRevolutBusiness(t), ler: lerRevolutBusiness },
  { banco: 'REVOLUT', reconhece: ehRevolut, ler: lerRevolutPessoal },
  { banco: 'MILLENNIUM', reconhece: ehMillennium, ler: lerMillennium },
  { banco: 'NOVO_BANCO', reconhece: ehNovoBanco, ler: lerNovoBanco },
  // O ABANCA fica no fim: a marca dele é mais fraca (um IBAN que começa por
  // 0170) e um extrato de outro banco que mencione o ABANCA não deve cair cá.
  { banco: 'ABANCA', reconhece: ehAbanca, ler: lerAbanca },
];

export function reconhecerBanco(texto: string): Banco | null {
  for (const l of LEITORES) {
    if (l.reconhece(texto)) return l.banco;
  }
  return null;
}

export type ResultadoDaLeitura =
  | { ok: true; leitura: LeituraDeExtrato }
  | { ok: false; motivo: string };

/**
 * Lê o texto de um extrato, seja ele de que banco for.
 *
 * Um ficheiro que não se reconhece é RECUSADO com uma frase que diz o que
 * fazer. Tentar lê-lo com o leitor «mais parecido» dava números de um banco
 * interpretados com as regras de outro — e isso não dá erro, dá valores.
 */
export function lerExtrato(texto: string): ResultadoDaLeitura {
  if (!texto || texto.trim().length < 40) {
    return {
      ok: false,
      motivo: 'Não foi possível ler texto deste PDF. Pode ser um ficheiro digitalizado '
        + '(uma imagem), e desses não se consegue tirar os movimentos.',
    };
  }

  for (const l of LEITORES) {
    if (!l.reconhece(texto)) continue;
    return { ok: true, leitura: conferir(l.ler(texto)) };
  }

  return {
    ok: false,
    motivo: 'Não reconheci o banco deste extrato. Por agora leio o ABANCA, o Novo Banco, '
      + 'o Millennium BCP, a Revolut e a Revolut Business.',
  };
}
