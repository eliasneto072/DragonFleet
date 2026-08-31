// src/modules/earnings/import/csv-parser.test.ts
//
// Testes do leitor de CSV dos portais da Uber e da Bolt.
//
// ─── A TRANCA DE REGRESSÃO ───────────────────────────────────────────────────
//
// Este ficheiro existe sobretudo por causa de um bug já corrigido: a lista de
// nomes de coluna era percorrida pela ordem das COLUNAS do ficheiro em vez da
// ordem de PRIORIDADE dos nomes, e um extrato com "Rendimentos brutos" antes de
// "Rendimentos líquidos" importava o valor errado — o bruto, antes da comissão
// da plataforma, que é sempre maior do que o motorista recebeu.
//
// A correção está feita. Os testes abaixo garantem que fica feita. É a prática
// que mais rende num projeto com anos pela frente: cada bug encontrado ganha
// primeiro um teste que o reproduz, e só depois a correção. Sem isso, a mesma
// falha volta na terceira vez que alguém mexer no ficheiro.
//
// ─── SOBRE OS DADOS DE EXEMPLO ───────────────────────────────────────────────
//
// São CSV escritos à mão, inspirados nos formatos dos portais. Ainda não temos
// exportações reais — estão pedidas ao cliente e sem resposta. Quando chegarem,
// os cabeçalhos verdadeiros entram aqui e é provável que apareçam variantes que
// estes testes não cobrem.

import { describe, it, expect } from 'vitest';
import { parseEarningsCsv, parseAmount, parseDate } from './csv-parser';
import { EarningPlatform } from '../../../shared/types/enums';

describe('parseAmount — formatos de numero', () => {
  it('le o formato portugues com ponto de milhares e virgula decimal', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
  });

  it('le o formato ingles com virgula de milhares e ponto decimal', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
  });

  it('le um numero simples com virgula decimal', () => {
    expect(parseAmount('1234,56')).toBe(1234.56);
  });

  it('ignora o simbolo de moeda e os espacos', () => {
    expect(parseAmount('€ 1.234,56')).toBe(1234.56);
    expect(parseAmount('  450,00 EUR ')).toBe(450);
  });

  it('devolve nulo em vez de NaN quando nao ha numero nenhum', () => {
    // Devolver NaN faria a soma da importacao inteira virar NaN, e o
    // administrador via "NaN €" sem pista de qual linha tinha o problema.
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('n/d')).toBeNull();
  });

  it('aceita valores negativos', () => {
    // Os portais lançam estornos e ajustes com sinal negativo.
    expect(parseAmount('-45,20')).toBe(-45.2);
  });
});

describe('parseDate — formatos de data', () => {
  it('aceita ISO sem mexer', () => {
    expect(parseDate('2026-03-15')).toBe('2026-03-15');
  });

  it('le o formato portugues dia/mes/ano', () => {
    // A distincao que interessa: 03/04 em Portugal e 3 de abril, nao 4 de marco.
    expect(parseDate('03/04/2026')).toBe('2026-04-03');
  });

  it('completa o ano com dois digitos', () => {
    expect(parseDate('15-03-26')).toBe('2026-03-15');
  });

  it('descarta a parte da hora', () => {
    expect(parseDate('2026-03-15 14:30:00')).toBe('2026-03-15');
    expect(parseDate('2026-03-15T14:30:00Z')).toBe('2026-03-15');
  });

  it('devolve nulo para texto que nao e data', () => {
    expect(parseDate('semana 12')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('parseEarningsCsv — escolha da coluna de valor', () => {
  it('prefere o liquido quando o ficheiro tem bruto E liquido', () => {
    // ESTE É O TESTE DA REGRESSÃO.
    //
    // O bruto vem PRIMEIRO no ficheiro, como vem nos extratos reais. A versão
    // com o bug apanhava-o por estar numa coluna anterior e importava 250,00 €
    // onde o motorista recebeu 187,50 € — 33% a mais, semana após semana.
    const csv = [
      'Data,Rendimentos brutos,Rendimentos líquidos',
      '2026-03-15,250.00,187.50',
    ].join('\n');

    const r = parseEarningsCsv(csv, EarningPlatform.UBER);

    expect(r.errors).toHaveLength(0);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].amount).toBe(187.50);
    expect(r.totalAmount).toBe(187.50);
  });

  it('prefere o liquido tambem em ingles, com o Fare antes', () => {
    const csv = [
      'Date,Fare,Net Earnings',
      '2026-03-15,250.00,187.50',
    ].join('\n');

    const r = parseEarningsCsv(csv, EarningPlatform.UBER);
    expect(r.rows[0].amount).toBe(187.50);
  });

  it('desempata por marcas de bruto em cabecalhos que nao conhecemos', () => {
    // O desempate nao depende de a coluna estar listada nos aliases: qualquer
    // cabecalho com "bruto", "gross", "fare" ou "tarifa" perde para o que nao
    // as tem. E o que cobre as variantes que os portais ainda nao nos mostraram.
    const csv = [
      'Data,Ganhos brutos da semana,Ganhos da semana',
      '2026-03-15,250.00,187.50',
    ].join('\n');

    const r = parseEarningsCsv(csv, EarningPlatform.BOLT);
    expect(r.rows[0].amount).toBe(187.50);
  });

  it('usa o bruto quando o ficheiro so tem essa coluna', () => {
    // Sem alternativa, o bruto e o melhor disponivel — o que nao se quer e
    // preferi-lo quando ha liquido.
    const csv = ['Data,Valor', '2026-03-15,250.00'].join('\n');

    const r = parseEarningsCsv(csv, EarningPlatform.BOLT);
    expect(r.rows[0].amount).toBe(250);
  });
});

describe('parseEarningsCsv — tolerancia', () => {
  it('aceita ponto e virgula como separador', () => {
    // O Excel em Portugal exporta com ponto e virgula, porque a virgula ja e o
    // separador decimal.
    const csv = ['Data;Rendimentos líquidos', '15/03/2026;187,50'].join('\n');

    const r = parseEarningsCsv(csv, EarningPlatform.UBER);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].amount).toBe(187.50);
    expect(r.rows[0].date).toBe('2026-03-15');
  });

  it('aceita campos entre aspas com virgulas dentro', () => {
    const csv = [
      'Data,Descrição,Valor',
      '2026-03-15,"Viagem Lisboa, Cascais",187.50',
    ].join('\n');

    const r = parseEarningsCsv(csv, EarningPlatform.UBER);
    expect(r.rows[0].amount).toBe(187.50);
  });

  it('nao para na primeira linha ma — junta o erro e continua', () => {
    // Um extrato com uma linha estragada nao pode fazer perder as outras
    // cinquenta. O administrador ve o que entrou e o que falhou.
    const csv = [
      'Data,Rendimentos líquidos',
      '2026-03-15,100.00',
      'lixo,sem numero',
      '2026-03-17,200.00',
    ].join('\n');

    const r = parseEarningsCsv(csv, EarningPlatform.UBER);

    expect(r.rows).toHaveLength(2);
    expect(r.errors).toHaveLength(1);
    expect(r.totalAmount).toBe(300);
  });

  it('reporta a linha exata do erro', () => {
    // Sem o numero da linha, quem recebe "1 erro" num ficheiro de 200 linhas
    // nao tem como o encontrar.
    const csv = [
      'Data,Rendimentos líquidos',
      '2026-03-15,100.00',
      'lixo,sem numero',
    ].join('\n');

    const r = parseEarningsCsv(csv, EarningPlatform.UBER);
    expect(r.errors[0].line).toBe(3);
  });

  it('ignora um ficheiro so com cabecalho sem rebentar', () => {
    const r = parseEarningsCsv('Data,Rendimentos líquidos', EarningPlatform.UBER);

    expect(r.rows).toHaveLength(0);
    expect(r.totalAmount).toBe(0);
  });

  it('ignora um ficheiro vazio sem rebentar', () => {
    const r = parseEarningsCsv('', EarningPlatform.UBER);
    expect(r.rows).toHaveLength(0);
  });
});
