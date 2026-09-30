// src/modules/fleet-import/parsers/parsers.test.ts
//
// Os três leitores de despesas, contra DOCUMENTOS REAIS.
//
// ─── PORQUE É QUE AS FIXTURES SÃO TEXTO E NÃO PDF ───────────────────────────
//
// Porque os leitores recebem texto. A passagem de PDF para texto são cinco
// linhas que chamam uma biblioteca; toda a lógica — encontrar matrículas,
// somar, conferir — está a partir daí, e é essa que se parte.
//
// As fixtures em `__fixtures__` são o texto extraído dos PDFs que o cliente
// exportou dos portais, sem uma vírgula alterada. Os totais nas asserções são
// os que os próprios portais mostram no ecrã:
//
//   Via Verde      63,99 €   (o PDF declara-o na primeira página)
//   Prio Frota    527,86 €   (o ecrã do MyPrio, 12 registos)
//   Prio Electric 198,53 €   (o ecrã do MyPrio, 20 registos)
//
// Não são números que eu tenha calculado: são a resposta que o fornecedor dá.
// Se um leitor deixar de lhes bater, está errado — mesmo que pareça bem.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lerViaVerde } from './via-verde';
import { lerPrioFrota } from './prio-frota';
import { lerPrioElectric } from './prio-electric';
import { numeroPt } from './numeros';

const fixture = (nome: string) =>
  readFileSync(join(__dirname, '__fixtures__', `${nome}.txt`), 'utf-8');

// ═══════════════════════════════════════════════════════════════════════════
describe('numeroPt — onde estes importadores falham em silêncio', () => {
  it('lê as três convenções que os portais usam', () => {
    expect(numeroPt('63.99')).toBe(63.99);      // Via Verde
    expect(numeroPt('99,9100')).toBe(99.91);    // Prio Frota
    expect(numeroPt('6.79')).toBe(6.79);        // Prio Electric
  });

  it('o separador mais à DIREITA é o decimal', () => {
    // O caso que parte tudo sem rebentar nada: lido como 1,23 € em vez de
    // 1234,56 €, entra no fecho e ninguém liga uma coisa à outra.
    expect(numeroPt('1.234,56')).toBe(1234.56);
    expect(numeroPt('1,234.56')).toBe(1234.56);
  });

  it('devolve null em vez de NaN quando não consegue', () => {
    // NaN propaga-se por somas inteiras e só aparece no fim, já sem se saber
    // de onde veio.
    expect(numeroPt('')).toBe(null);
    expect(numeroPt('A aguardar fatura')).toBe(null);
    expect(numeroPt('—')).toBe(null);
  });

  it('aguenta o símbolo e os espaços', () => {
    expect(numeroPt(' 33,39 € ')).toBe(33.39);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Via Verde', () => {
  const r = lerViaVerde(fixture('via-verde'));

  it('encontra as duas matrículas do extrato', () => {
    expect(r.porMatricula.map((p) => p.matricula)).toEqual(['BG-49-GP', 'BT-63-NU']);
  });

  it('soma cada uma ao cêntimo', () => {
    expect(r.porMatricula[0].total).toBe(33.39);
    expect(r.porMatricula[1].total).toBe(30.60);
  });

  it('a soma bate com o total que o PDF declara', () => {
    // A garantia toda: 33,39 + 30,60 = 63,99, e a primeira página diz 63,99.
    expect(r.totalDeclarado).toBe(63.99);
    expect(r.totalLido).toBe(63.99);
    expect(r.confere).toBe(true);
  });

  it('apanha o total GERAL e não o do primeiro operador', () => {
    // "Total em Euros" aparece uma vez por operador na página 1. A primeira é
    // a geral (63,99); a seguinte é a da Via Verde Portugal (1,49).
    expect(r.totalDeclarado).not.toBe(1.49);
  });

  it('recusa quando a soma não bate', () => {
    const adulterado = fixture('via-verde').replace('Total Identificador 33.39',
                                                    'Total Identificador 99.99');
    const mau = lerViaVerde(adulterado);
    expect(mau.confere).toBe(false);
    expect(mau.avisos.join(' ')).toContain('não bate');
  });

  it('um identificador sem matrícula não se perde', () => {
    const semMat = fixture('via-verde')
      .replace('Identificador: 601073989480 Matrícula: BG-49-GP', 'Identificador: 601073989480');
    const r2 = lerViaVerde(semMat);
    // O valor continua a contar para o total — senão a conferência falhava
    // por engano nosso — mas fica de fora das matrículas, e avisa.
    expect(r2.semMatricula.ocorrencias).toBe(1);
    expect(r2.semMatricula.total).toBe(33.39);
    expect(r2.totalLido).toBe(63.99);
    expect(r2.confere).toBe(true);
    expect(r2.avisos.join(' ')).toContain('sem matrícula');
  });

  it('um PDF vazio não passa por engano', () => {
    const vazio = lerViaVerde('');
    expect(vazio.confere).toBe(false);
    expect(vazio.porMatricula).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Prio Frota (combustível)', () => {
  const r = lerPrioFrota(fixture('prio-frota'));

  it('lê os dois carros a gasóleo', () => {
    expect(r.porMatricula.map((p) => p.matricula)).toEqual(['AX-89-SG', 'BG-49-GP']);
  });

  it('a soma bate com o total do ecrã do MyPrio', () => {
    // 527,86 € é o que o portal mostra para 01/07 a 30/09, em 12 registos.
    expect(r.totalLido).toBe(527.86);
    expect(r.confere).toBe(true);
  });

  it('cada linha fecha a conta do IVA', () => {
    // A verificação que substitui o total, que este PDF não traz:
    // Val. Liq + IVA = Total(c/iva), nas doze.
    expect(r.avisos.join(' ')).not.toContain('não fecham a conta');
  });

  it('usa o total COM IVA', () => {
    // 99,91 € é o valor com IVA do primeiro abastecimento; 81,23 € é o
    // líquido. Somar os líquidos dava 429,15 € e ninguém reparava.
    expect(r.totalLido).toBeGreaterThan(500);
  });

  it('recusa quando uma linha deixa de fechar', () => {
    const adulterado = fixture('prio-frota').replace('IVA: 18,68', 'IVA: 1,11');
    const mau = lerPrioFrota(adulterado);
    expect(mau.confere).toBe(false);
  });

  it('um PDF vazio não passa por engano', () => {
    expect(lerPrioFrota('').confere).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Prio Electric (carregamentos)', () => {
  const r = lerPrioElectric(fixture('prio-electric'));

  it('lê o carro elétrico', () => {
    expect(r.porMatricula.map((p) => p.matricula)).toEqual(['BT-63-NU']);
  });

  it('a soma bate com o total do ecrã do MyPrio', () => {
    // 198,53 € para 01/06 a 30/09, em 20 registos.
    expect(r.totalLido).toBe(198.53);
    expect(r.confere).toBe(true);
  });

  it('usa a coluna COM IVA, e não a que se chama só "Total"', () => {
    // A armadilha: aqui "Total" é SEM IVA, ao contrário do ficheiro do
    // combustível. Lida a errada, dava 161,41 € — 23% a menos, todas as
    // semanas, e a diferença passava a lucro.
    expect(r.totalLido).toBe(198.53);
    expect(r.totalLido).not.toBeCloseTo(198.53 / 1.23, 1);
  });

  it('as colunas contam-se do FIM, porque o nome do cartão tem espaços', () => {
    // "DIOGO TESLA MODEL 3" e "Diogo steam VirtualCard" têm contagens de
    // palavras diferentes. A contar do princípio, metade das linhas saía
    // trocada — e as duas aparecem nesta fixture.
    expect(r.porMatricula[0].total).toBe(198.53);
  });

  it('recusa quando a razão do IVA se perde', () => {
    const adulterado = fixture('prio-electric').replace(' 5.52 6.79 ', ' 5.52 99.99 ');
    const mau = lerPrioElectric(adulterado);
    expect(mau.confere).toBe(false);
  });

  it('um PDF vazio não passa por engano', () => {
    expect(lerPrioElectric('').confere).toBe(false);
  });
});
