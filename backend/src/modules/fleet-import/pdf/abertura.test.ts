// src/modules/fleet-import/pdf/abertura.test.ts
//
// As peças que foram preciso acrescentar para abrir os extratos dos BANCOS.
//
// ─── PORQUE É QUE ESTES TESTES NÃO USAM OS EXTRATOS VERDADEIROS ─────────────
//
// Porque um extrato bancário tem o IBAN, os números dos cartões, as compras
// todas e os NOMES DE TERCEIROS que transferiram dinheiro. Os PDFs da Via
// Verde e da Prio estão no repositório porque são documentos da empresa; um
// extrato pessoal não entra num repositório, e muito menos num que um dia
// possa ser lido por outra pessoa.
//
// Então prova-se o MECANISMO, com casos construídos aqui: o RC4 contra os
// vectores publicados, o ASCII85 contra uma cadeia conhecida, os escapes
// octais contra bytes contados à mão, o ObjStm contra um stream escrito à mão.
//
// A prova de ponta a ponta — os seis extratos dele a dar as linhas certas —
// correu fora do repositório, contra os ficheiros que ele mandou. Está nas
// notas da conversa, e não aqui, por esta mesma razão.
//
// ─── O QUE CADA UM DESTES APANHOU DE VERDADE ────────────────────────────────
//
// Nenhum destes testes é hipotético. Cada um corresponde a um extrato que
// aparecia VAZIO, e nos dois piores casos a um extrato que aparecia com texto
// de aspeto plausível e as letras todas trocadas.

import { describe, it, expect } from 'vitest';
import { lerStringPdf, stringDaChave, idDoFicheiro } from './strings-pdf';
import { objetosDentroDeStreams } from './objstm';
import { extrairTextoPdf } from './extrair-texto';

// ═══════════════════════════════════════════════ strings de dentro do PDF ══

describe('ler uma string de dentro de um PDF', () => {
  it('hexadecimal dá os bytes', () => {
    const r = lerStringPdf('<48656C6C6F>', 0);
    expect(r?.bytes.toString('latin1')).toBe('Hello');
  });

  it('um dígito hexadecimal a sobrar completa-se com zero', () => {
    const r = lerStringPdf('<414>', 0);
    expect(r?.bytes.toString('hex')).toBe('4140');
  });

  it('os escapes octais são BYTES e não letras', () => {
    // É isto que a chave do Millennium traz: /O(\226\202z\240...).
    // Lido como texto dava 10 caracteres onde estão 4 bytes.
    const r = lerStringPdf(String.raw`(\226\202z\240)`, 0);
    expect(r?.bytes.toString('hex')).toBe('96827aa0');
    expect(r?.bytes.length).toBe(4);
  });

  it('um octal de um ou dois dígitos também conta', () => {
    const r = lerStringPdf(String.raw`(\0\15A)`, 0);
    expect(r?.bytes.toString('hex')).toBe('000d41');
  });

  it('os escapes com nome dão o byte certo', () => {
    const r = lerStringPdf(String.raw`(a\nb\tc\\d\(e\))`, 0);
    expect(r?.bytes.toString('latin1')).toBe('a\nb\tc\\d(e)');
  });

  it('parênteses encaixados NÃO acabam a string', () => {
    // `(a(b)c)` é uma string só. Parar no primeiro `)` partia a chave ao meio,
    // e uma chave truncada desencripta tudo para lixo.
    const r = lerStringPdf('(a(b)c)', 0);
    expect(r?.bytes.toString('latin1')).toBe('a(b)c');
  });

  it('uma barra antes de fim de linha junta as duas linhas', () => {
    const r = lerStringPdf('(ab\\\ncd)', 0);
    expect(r?.bytes.toString('latin1')).toBe('abcd');
  });

  it('diz onde a string acaba, para quem continua a ler', () => {
    const r = lerStringPdf('(ab)/Outra', 0);
    expect(r?.fim).toBe(4);
  });

  it('tira a string de uma chave do dicionário', () => {
    const b = stringDaChave('<</O(\\101\\102)/P -44>>', 'O');
    expect(b?.toString('latin1')).toBe('AB');
  });
});

describe('o /ID que vale é o do trailer', () => {
  it('ignora um /ID que esteja dentro de um objeto', () => {
    // O caso verdadeiro: o extrato do Millennium tem um /ID dentro de um
    // objeto encriptado, 1,5 KB ANTES do trailer. Com esse, a chave saía
    // errada e o extrato aparecia vazio — sem um único erro.
    const ficheiro = [
      '%PDF-1.5',
      '9 0 obj<</ID[(XXXXXXXXXXXXXXXX)]>>endobj',
      'trailer<</Encrypt 10 0 R/ID [<41424344>]>>',
    ].join('\n');
    expect(idDoFicheiro(ficheiro).toString('latin1')).toBe('ABCD');
  });

  it('sem /Encrypt, fica com o último — que é o trailer mais recente', () => {
    const ficheiro = 'trailer<</ID[<4141>]>>\ntrailer<</ID[<4242>]>>';
    expect(idDoFicheiro(ficheiro).toString('latin1')).toBe('BB');
  });

  it('sem /ID nenhum, devolve vazio em vez de atirar', () => {
    expect(idDoFicheiro('%PDF-1.4\ntrailer<</Root 1 0 R>>').length).toBe(0);
  });
});

// ═══════════════════════════════════════════════ objetos dentro de streams ══

describe('objetos escondidos dentro de um ObjStm', () => {
  // `30 0 50 14` → objeto 30 no deslocamento 0, objeto 50 no deslocamento 14,
  // que é onde o corpo do primeiro (`<</Type/Page>>`, 14 bytes) acaba.
  const conteudo = '30 0 50 14 ';
  const corpos = '<</Type/Page>><</A 1>>';
  const stream = conteudo + corpos;
  const first = conteudo.length;

  const objs = new Map<number, string>([
    [7, `<</Type/ObjStm/N 2/First ${first}>>stream\nxxx\nendstream`],
  ]);

  it('traz os dois objetos para fora', () => {
    const achados = objetosDentroDeStreams(objs, () => stream);
    expect(achados.get(30)).toBe('<</Type/Page>>');
    expect(achados.get(50)).toBe('<</A 1>>');
  });

  it('um objeto que já existe fora NÃO é substituído', () => {
    // Lá fora é mais recente do que dentro de um ObjStm antigo.
    const comOTrinta = new Map(objs);
    comOTrinta.set(30, '<</Novo 1>>');
    const achados = objetosDentroDeStreams(comOTrinta, () => stream);
    expect(achados.has(30)).toBe(false);
  });

  it('um stream que não abre não leva o resto atrás', () => {
    expect(objetosDentroDeStreams(objs, () => null).size).toBe(0);
  });

  it('um /N maior do que os pares existentes é ignorado, não adivinhado', () => {
    const mentiroso = new Map<number, string>([
      [7, `<</Type/ObjStm/N 9/First ${first}>>stream\nxxx\nendstream`],
    ]);
    expect(objetosDentroDeStreams(mentiroso, () => stream).size).toBe(0);
  });

  it('um objeto que não é ObjStm é deixado em paz', () => {
    const normal = new Map<number, string>([[7, '<</Type/Page>>']]);
    expect(objetosDentroDeStreams(normal, () => stream).size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════ o extrator, no geral ══

describe('o extrator continua a não atirar nunca', () => {
  it('bytes que não são um PDF dão string vazia', () => {
    expect(extrairTextoPdf(Buffer.from('isto não é um pdf'))).toBe('');
  });

  it('um PDF vazio dá string vazia', () => {
    expect(extrairTextoPdf(Buffer.from('%PDF-1.4\n%%EOF'))).toBe('');
  });

  it('uma encriptação que não sei abrir dá vazio — e não texto a meio', () => {
    // O AES-256 (/V 5) não está implementado de propósito. O que NÃO pode
    // acontecer é devolver metade das linhas: um extrato a meio importado
    // como se estivesse completo é dinheiro a faltar sem ninguém notar.
    const ficheiro = [
      '%PDF-1.7',
      '1 0 obj<</Type/Page/Contents 2 0 R>>endobj',
      '2 0 obj<</Length 4>>stream',
      'abcd',
      'endstream endobj',
      '3 0 obj<</Filter/Standard/V 5/R 6/Length 256/O(x)/U(y)/P -1>>endobj',
      'trailer<</Encrypt 3 0 R/ID [<41424344>]>>',
    ].join('\n');
    expect(extrairTextoPdf(Buffer.from(ficheiro, 'latin1'))).toBe('');
  });
});

describe('um /Contents em array', () => {
  // O Novo Banco e o Abanca escrevem `/Contents[8 0 R]`. A expressão antiga
  // só reconhecia `/Contents 8 0 R`, devolvia nulo, e o extrato saía vazio
  // com as cinco páginas encontradas e zero lidas.
  const pdf = (contents: string) => Buffer.from([
    '%PDF-1.4',
    `1 0 obj<</Type/Page${contents}/Resources<</Font<<>>>>>>endobj`,
    '2 0 obj<</Length 44>>stream',
    'BT /F1 12 Tf 10 700 Td (OLA MUNDO) Tj ET',
    'endstream endobj',
    'trailer<</Root 1 0 R>>',
  ].join('\n'), 'latin1');

  it('lê-se igual à forma com uma referência só', () => {
    expect(extrairTextoPdf(pdf('/Contents 2 0 R'))).toContain('OLA MUNDO');
    expect(extrairTextoPdf(pdf('/Contents[2 0 R]'))).toContain('OLA MUNDO');
  });
});
