// src/modules/fleet-import/pdf/extrair-texto.test.ts
//
// O extrator de PDF, contra os TRÊS PDFs verdadeiros que saíram dos portais.
//
// ─── O QUE ESTE FICHEIRO GARANTE QUE O OUTRO NÃO GARANTE ────────────────────
//
// `parsers.test.ts` prova os leitores contra texto. Este prova a cadeia
// inteira: PDF em bytes → texto → leitor → total. É a diferença entre saber
// que a conta está certa e saber que a conta está certa a partir do ficheiro
// que o fornecedor deu.
//
// Os números não são meus. São os que os portais mostram no ecrã:
//
//   Via Verde       63,99 €   (o próprio PDF declara-o)
//   Prio Frota     527,86 €   (ecrã do MyPrio, 12 registos)
//   Prio Electric  198,53 €   (ecrã do MyPrio, 20 registos)
//
// ─── PORQUE É QUE OS PDFs ESTÃO NO REPOSITÓRIO ──────────────────────────────
//
// Porque sem eles este teste não existe, e sem este teste o extrator é uma
// promessa. São os documentos que o cliente exportou, e os dados que trazem
// (NIF da empresa, matrículas) já estavam nas fixtures de texto ao lado.
//
// Se um dia um portal mudar o gerador de PDF, é aqui que se sabe — antes de
// uma semana fechar com despesas a menos.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extrairTextoPdf } from './extrair-texto';
import { lerViaVerde } from '../parsers/via-verde';
import { lerPrioFrota } from '../parsers/prio-frota';
import { lerPrioElectric } from '../parsers/prio-electric';

const pdf = (nome: string) =>
  readFileSync(join(__dirname, '..', 'parsers', '__fixtures__', `${nome}.pdf`));

const texto = (nome: string) => extrairTextoPdf(pdf(nome));

// ═══════════════════════════════════════════════════════════════════════════
describe('o extrator dá linhas, não sopa de letras', () => {
  it('a Via Verde sai com as linhas que o leitor precisa', () => {
    const t = texto('via-verde');
    expect(t.split('\n').length).toBeGreaterThan(50);
    // O total e cada subtotal têm de ficar na MESMA linha que o seu número:
    // é isso que o leitor procura, e é o que se perde se o agrupamento por
    // altura correr mal.
    expect(t).toContain('Total em Euros 63.99');
    expect(t).toContain('Total Identificador 33.39');
    expect(t).toContain('Matrícula: BG-49-GP');
  });

  it('a Prio escreve em hexadecimal e sai legível', () => {
    // Estes PDFs não trazem letras: trazem índices de glifos de uma fonte
    // recortada. Sem ler a tabela /ToUnicode do próprio ficheiro, o extrator
    // devolvia zero linhas — foi exatamente o que aconteceu à primeira.
    const t = texto('prio-frota');
    expect(t).toContain('Transações');
    expect(t).toContain('BG-49-GP');
    expect(t).toContain('Val. Liq: 81,23');
  });

  it('as matrículas NÃO vêm partidas ao meio', () => {
    // O erro que passava sem rebentar: `BT -63-NU`. A expressão que procura
    // matrículas não casava, a despesa daquele carro caía toda no monte do
    // "por atribuir", e ninguém percebia porquê.
    const t = texto('prio-electric');
    expect(t).toContain('BT-63-NU');
    expect(t).not.toContain('BT -63-NU');
    // E os números também não: `9.1 1` em vez de `9.11` estragava a conta.
    expect(t).not.toContain('71 17235550');
  });

  it('um ficheiro que não é PDF devolve vazio em vez de atirar', () => {
    // Quem chama é uma rota de upload. Um atiro aqui era um 500 sem explicação;
    // vazio faz o leitor recusar com uma mensagem que se entende.
    expect(extrairTextoPdf(Buffer.from('isto é um txt qualquer'))).toBe('');
    expect(extrairTextoPdf(Buffer.alloc(0))).toBe('');
  });

  it('um PDF truncado devolve o que conseguir, sem atirar', () => {
    const meio = pdf('prio-frota').subarray(0, 4000);
    expect(() => extrairTextoPdf(meio)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('do PDF ao total, sem passos manuais', () => {
  it('Via Verde: 63,99 € a partir do ficheiro', () => {
    const r = lerViaVerde(texto('via-verde'));
    expect(r.confere).toBe(true);
    expect(r.totalDeclarado).toBe(63.99);
    expect(r.totalLido).toBe(63.99);
    expect(r.porMatricula).toEqual([
      { matricula: 'BG-49-GP', total: 33.39 },
      { matricula: 'BT-63-NU', total: 30.60 },
    ]);
  });

  it('Prio Frota: 527,86 € a partir do ficheiro', () => {
    const r = lerPrioFrota(texto('prio-frota'));
    expect(r.confere).toBe(true);
    expect(r.totalLido).toBe(527.86);
    expect(r.porMatricula).toEqual([
      { matricula: 'AX-89-SG', total: 213.89 },
      { matricula: 'BG-49-GP', total: 313.97 },
    ]);
  });

  it('Prio Electric: 198,53 € a partir do ficheiro', () => {
    const r = lerPrioElectric(texto('prio-electric'));
    expect(r.confere).toBe(true);
    expect(r.totalLido).toBe(198.53);
    expect(r.porMatricula).toEqual([{ matricula: 'BT-63-NU', total: 198.53 }]);
  });

  it('nenhum dos três traz movimentos sem matrícula', () => {
    // Se um dia trouxer, é porque o formato mudou — e aí o valor tem de
    // aparecer em "por atribuir" e não desaparecer.
    for (const [nome, ler] of [
      ['via-verde', lerViaVerde],
      ['prio-frota', lerPrioFrota],
      ['prio-electric', lerPrioElectric],
    ] as const) {
      expect(ler(texto(nome)).semMatricula.ocorrencias).toBe(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('o extrator não é a última defesa, e é por isso que se pode ter', () => {
  it('texto estragado faz o leitor RECUSAR, não aceitar a menos', () => {
    // A garantia que torna este extrator seguro: ele não precisa de estar
    // sempre certo. Se der texto a menos, a conferência do leitor não fecha e
    // a importação não avança.
    const meio = lerPrioElectric(extrairTextoPdf(pdf('prio-electric').subarray(0, 40000)));
    expect(meio.totalLido).not.toBe(198.53);
    expect(meio.confere).toBe(false);
  });
});
