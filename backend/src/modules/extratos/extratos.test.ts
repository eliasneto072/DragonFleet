// src/modules/extratos/extratos.test.ts
//
// Os leitores de extratos bancários.
//
// ─── PORQUE É QUE OS DADOS AQUI SÃO INVENTADOS ──────────────────────────────
//
// Um extrato bancário traz o IBAN, os números dos cartões, as compras todas e
// os NOMES DAS PESSOAS que transferiram dinheiro. Nada disso entra num
// repositório — nem o dele, nem o de terceiros que nunca deram autorização
// para nada.
//
// Então os casos aqui são escritos à mão, com a MESMA FORMA dos verdadeiros e
// valores inventados: IBANs a zeros, nomes que não existem, números redondos.
// A forma é o que se está a testar; os valores são só combustível.
//
// Cada caso abaixo corresponde a um engano que aconteceu de verdade a ler os
// extratos dele. Nenhum é hipotético, e é por isso que estão todos aqui:
//
//   · o separador de milhares que é um espaço SEM QUEBRA
//   · a linha de movimento sem descrição, que era saltada
//   · o rodapé «Processado por Computador» à frente de um movimento
//   · dois números colados: «504.287.62»
//   · o número de contrato a ser lido como parte do valor
//   · «A16» lido como 16,00 €
//   · «-€31.51» lido como positivo
//   · o IBAN em grupos a comer o dígito seguinte
//
// ─── A PROVA DE PONTA A PONTA NÃO ESTÁ AQUI ─────────────────────────────────
//
// Os seis extratos verdadeiros foram lidos fora do repositório, e os totais
// que saíram batem com os que os próprios bancos declaram no resumo. Essa
// prova está nas notas da conversa, pela mesma razão de privacidade.

import { describe, it, expect } from 'vitest';
import {
  valorDeExtrato, dataDiaMesAno, dataComMesEmPalavra, dataMesDia,
  anoCompleto, fimDoIban,
} from './numeros';
import { assinarPeloSaldo } from './assinar';
import { conferir, elosQueFalham } from './conferir';
import { classificar, contarClasses, achatar } from './classificar';
import { lerAbanca } from './bancos/abanca';
import { lerNovoBanco } from './bancos/novo-banco';
import { lerMillennium } from './bancos/millennium';
import { lerRevolutBusiness, lerRevolutPessoal } from './bancos/revolut';
import { lerExtrato, reconhecerBanco } from './index';
import type { LeituraCrua, Movimento } from './tipos';

/** O espaço SEM QUEBRA que os bancos usam nos milhares. Não é um espaço. */
const NB = ' ';

// ═════════════════════════════════════════════════════════════════ números ══

describe('ler um valor de extrato', () => {
  it('vírgula decimal e espaço sem quebra nos milhares', () => {
    expect(valorDeExtrato(`3${NB}533,14`)).toBe(3533.14);
  });

  it('ponto decimal e espaço nos milhares', () => {
    expect(valorDeExtrato('23 219.95')).toBe(23219.95);
  });

  it('o menos à DIREITA é um negativo', () => {
    // O Millennium escreve assim os saldos devedores. Lido como positivo, uma
    // dívida de 23.489,56 € entrava na contabilidade como dinheiro a haver.
    expect(valorDeExtrato('23 489.56-')).toBe(-23489.56);
  });

  it('os parênteses também são um negativo', () => {
    expect(valorDeExtrato('(1 234,00)')).toBe(-1234);
  });

  it('o euro antes ou depois do número não muda nada', () => {
    expect(valorDeExtrato('€1 000.00')).toBe(1000);
    expect(valorDeExtrato('12 042,75€')).toBe(12042.75);
    expect(valorDeExtrato('-€31.51')).toBe(-31.51);
    expect(valorDeExtrato('- €3 109.51')).toBe(-3109.51);
  });

  it('o que não é número devolve nulo, e não NaN', () => {
    // Um NaN propaga-se por somas inteiras e só aparece no fim.
    expect(valorDeExtrato('EUR')).toBeNull();
    expect(valorDeExtrato('')).toBeNull();
    expect(valorDeExtrato('   ')).toBeNull();
  });

  it('1.234,56 não é 1,23 — manda o separador mais à direita', () => {
    expect(valorDeExtrato('1.234,56')).toBe(1234.56);
    expect(valorDeExtrato('1,234.56')).toBe(1234.56);
  });
});

describe('ler datas', () => {
  it('dd/mm/aaaa', () => {
    expect(dataDiaMesAno('03/08/2026')).toBe('2026-08-03');
  });

  it('dd.mm.aa, com o ano de dois dígitos', () => {
    expect(dataDiaMesAno('06.09.26')).toBe('2026-09-06');
  });

  it('o ano de dois dígitos é deste século até 69', () => {
    // Um extrato de 1926 não existe; um de 2026 é o que está em cima da mesa.
    expect(anoCompleto(26)).toBe(2026);
    expect(anoCompleto(69)).toBe(2069);
    expect(anoCompleto(70)).toBe(1970);
  });

  it('mês em palavra, como a Revolut Business escreve', () => {
    expect(dataComMesEmPalavra('27 set. 2026')).toBe('2026-09-27');
    expect(dataComMesEmPalavra('1 de setembro de 2026')).toBe('2026-09-01');
    expect(dataComMesEmPalavra('14 de março de 2026')).toBe('2026-03-14');
  });

  it('o Millennium escreve MÊS.DIA, e o ano vem de fora', () => {
    // «8.03» é 3 de Agosto. Lido como dia.mês dava 8 de Março — um mês errado
    // e uma data que nada denuncia como errada.
    expect(dataMesDia('8.03', 2026)).toBe('2026-08-03');
    expect(dataMesDia('7.31', 2026)).toBe('2026-07-31');
  });

  it('quando o primeiro número não pode ser um mês, assume dia.mês', () => {
    expect(dataMesDia('31.07', 2026)).toBe('2026-07-31');
  });

  it('uma data impossível devolve nulo em vez de rodar para o mês seguinte', () => {
    expect(dataDiaMesAno('31/02/2026')).toBeNull();
    expect(dataMesDia('2.30', 2026)).toBeNull();
  });
});

describe('o fim do IBAN', () => {
  it('do IBAN compacto', () => {
    expect(fimDoIban('PT50000000000000000009680')).toBe('9680');
  });

  it('do IBAN em grupos, sem comer o que vem a seguir', () => {
    // O caso verdadeiro: um IBAN português acaba num grupo de UM dígito, e
    // logo depois vem a coluna do saldo — «… 0919 4 0,00 0,00». A expressão,
    // que aceita espaços dentro do IBAN, comia o «0» do saldo e o IBAN passava
    // a acabar em «1940» em vez de «9194». Quatro dígitos errados identificam
    // a conta errada, e isso mistura dois extratos.
    //
    // Um IBAN português tem 25 caracteres: PT, dois de controlo e 21. Cortar a
    // esse comprimento resolve-o de vez.
    expect(fimDoIban('PT50 0000 0000 0000 0000 0919 4 0,00 0,00')).toBe('9194');
  });

  it('um candidato mais curto do que o país permite é ignorado', () => {
    // Senão, completava-se com os dígitos da coluna seguinte — que é
    // exactamente o engano de cima, visto do outro lado.
    expect(fimDoIban('PT50 0000 0000')).toBeNull();
  });

  it('o IBAN da Lituânia tem outro comprimento', () => {
    expect(fimDoIban('LT23 0000 0000 0000 7354')).toBe('7354');
  });

  it('sem IBAN devolve nulo', () => {
    expect(fimDoIban('Extrato de conta')).toBeNull();
  });
});

// ════════════════════════════════════════════════════ o sinal pelo saldo ══

describe('dar o sinal a uma grandeza pelo saldo', () => {
  it('o saldo a descer faz dela uma saída', () => {
    expect(assinarPeloSaldo(40, 244.71, 204.71)).toEqual({ valor: -40, bate: true });
  });

  it('o saldo a subir faz dela uma entrada', () => {
    expect(assinarPeloSaldo(20, 199.67, 219.67)).toEqual({ valor: 20, bate: true });
  });

  it('a grandeza que não coincide com a diferença NÃO passa', () => {
    // É esta a verificação de verdade: o sinal vem do saldo, mas a grandeza
    // vem do texto, e as duas têm de dar a mesma coisa.
    const r = assinarPeloSaldo(35, 84.88, 110.23);
    expect(r.bate).toBe(false);
  });

  it('sem saldo anterior não há nada a conferir, e não passa', () => {
    expect(assinarPeloSaldo(10, null, 90).bate).toBe(false);
  });

  it('um cêntimo de arredondamento passa; dois não', () => {
    expect(assinarPeloSaldo(10, 100, 90.01).bate).toBe(true);
    expect(assinarPeloSaldo(10, 100, 89.98).bate).toBe(false);
  });

  it('um movimento de zero euros é um movimento', () => {
    expect(assinarPeloSaldo(0, 50, 50)).toEqual({ valor: 0, bate: true });
  });
});

// ══════════════════════════════════════════════════ a cadeia de saldos ══

const mov = (valor: number, saldo: number | null): Movimento => ({
  data: '2026-09-01', dataLancamento: null, descricao: 'x', valor, saldo, referencia: null,
});

const crua = (p: Partial<LeituraCrua>): LeituraCrua => ({
  banco: 'ABANCA', contaTerminadaEm: null, periodo: { de: null, ate: null },
  movimentos: [], saldoInicial: null, saldoFinal: null, avisos: [], recusa: null, ...p,
});

describe('a cadeia de saldos', () => {
  it('uma cadeia que fecha não tem elos a falhar', () => {
    expect(elosQueFalham([mov(-40, 60), mov(20, 80)], 100)).toEqual([]);
  });

  it('diz QUAL é a linha que não fecha', () => {
    // «os totais não batem» manda a pessoa reler duzentas linhas. Dizer a
    // linha manda-a olhar para uma.
    const falhas = elosQueFalham([mov(-40, 60), mov(20, 85)], 100);
    expect(falhas).toHaveLength(1);
    expect(falhas[0].linha).toBe(2);
    expect(falhas[0].esperado).toBe(80);
    expect(falhas[0].impresso).toBe(85);
  });

  it('dois enganos que se cancelam são apanhados — um total fechava', () => {
    // 100 −40 +40 = 100 e o total fecha. A cadeia não se deixa enganar: o
    // saldo do meio não é 70.
    const falhas = elosQueFalham([mov(-40, 70), mov(40, 100)], 100);
    expect(falhas.length).toBeGreaterThan(0);
  });

  it('um extrato sem saldos é recusado, não aceite', () => {
    const r = conferir(crua({ movimentos: [mov(-10, null)], saldoInicial: 100 }));
    expect(r.confere).toBe(false);
    expect(r.avisos.join(' ')).toMatch(/não há como confirmar/i);
  });

  it('um saldo final declarado que não bate quer dizer movimentos a faltar', () => {
    const r = conferir(crua({
      movimentos: [mov(-40, 60)], saldoInicial: 100, saldoFinal: 50,
    }));
    expect(r.confere).toBe(false);
    expect(r.avisos.join(' ')).toMatch(/devem faltar movimentos/i);
  });

  it('um extrato sem movimentos passa, com um aviso a dizer o que fazer', () => {
    const r = conferir(crua({ movimentos: [] }));
    expect(r.confere).toBe(true);
    expect(r.avisos.join(' ')).toMatch(/não traz movimentos/i);
  });

  it('a recusa do próprio leitor manda sobre tudo o resto', () => {
    // Nos bancos em que o sinal é deduzido do saldo, a cadeia fecha sempre.
    // Sem este caminho, dava um «confere» que não verificava nada.
    const r = conferir(crua({
      movimentos: [mov(-40, 60)], saldoInicial: 100, recusa: 'não bate',
    }));
    expect(r.confere).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════ ABANCA ══

describe('o extrato de movimentos do ABANCA', () => {
  const extrato = [
    '13/10/26, 20:19 MOVIMENTOS_PT50000000000000000009680',
    'PT50000000000000000009680',
    'Filtros aplicados:',
    'PERÍODO: 2026-08-01 - 2026-08-31',
    'D. VALOR DESCRIÇÃO REFERÊNCIA MONTANTE SALDO MOEDA',
    'Ordem',
    `03/08/2026 03/08/2026 03/08/2026 Plataforma Alfa 440,43 3${NB}533,14 EUR`,
    'estrangeiro',
    'Ordem',
    `03/08/2026 03/08/2026 03/08/2026 Plataforma Beta 100000001 1${NB}630,57 5${NB}163,71 EUR`,
    'estrangeiro',
    'Comissão',
    `05/08/2026 05/08/2026 05/08/2026 -5,00 5${NB}158,71 EUR`,
    'TPA',
  ].join('\n');

  const r = conferir(lerAbanca(extrato));

  it('lê os três movimentos e a cadeia fecha', () => {
    expect(r.movimentos).toHaveLength(3);
    expect(r.confere).toBe(true);
  });

  it('o separador de milhares sem quebra não parte os valores', () => {
    // Com um espaço normal na expressão, este extrato dava ZERO movimentos.
    expect(r.movimentos[1].valor).toBe(1630.57);
    expect(r.movimentos[1].saldo).toBe(5163.71);
  });

  it('a linha SEM descrição também é um movimento', () => {
    // Foi a que faltava: a comissão do TPA, cuja descrição está toda nas
    // linhas de cima e de baixo. Saltá-la partia a cadeia de saldos.
    expect(r.movimentos[2].valor).toBe(-5);
    expect(r.movimentos[2].descricao).toContain('Comissão');
  });

  it('o saldo inicial é deduzido do primeiro movimento', () => {
    // O ABANCA não o imprime. Sem o deduzir, o primeiro elo da cadeia não
    // tinha nada com que ser comparado.
    expect(r.saldoInicial).toBe(3092.71);
  });

  it('o montante traz o sinal, por isso não há sinal a adivinhar', () => {
    expect(r.movimentos[0].valor).toBeGreaterThan(0);
    expect(r.movimentos[2].valor).toBeLessThan(0);
  });

  it('guarda a referência do banco, e tira-a da descrição', () => {
    expect(r.movimentos[1].referencia).toBe('100000001');
    expect(r.movimentos[1].descricao).not.toContain('100000001');
  });

  it('só os quatro últimos dígitos do IBAN, e nunca o IBAN', () => {
    expect(r.contaTerminadaEm).toBe('9680');
  });

  it('o período vem dos filtros do próprio ficheiro', () => {
    expect(r.periodo).toEqual({ de: '2026-08-01', ate: '2026-08-31' });
  });

  it('a folha de posições é reconhecida e diz qual é a exportação certa', () => {
    // Foi o que ele mandou da conta pessoal: saldos e cartões, zero
    // movimentos. «Não encontrei nada» mandava-o desconfiar do importador.
    const posicoes = [
      'EXTRATO INTEGRADO',
      'Posições no ABANCA Data da informação: 30-09-2026',
      'Contas à Ordem Saldo Descoberto autorizado',
      'CONTA NEW LIFE PT50 0000 0000 0000 0000 9194 0,00 0,00',
    ].join('\n');
    const p = conferir(lerAbanca(posicoes));
    expect(p.movimentos).toHaveLength(0);
    expect(p.avisos.join(' ')).toMatch(/folha de posições/i);
    expect(p.avisos.join(' ')).toMatch(/MOVIMENTOS_PT50/);
  });
});

// ═══════════════════════════════════════════════════════════ NOVO BANCO ══

describe('o EXTRATO INTEGRADO do Novo Banco', () => {
  const extrato = [
    'EXTRATO INTEGRADO nº 10/2026',
    'IBAN PT50 0000 0000 0010 0000 0004 7',
    'End. SWIFT/BIC BESCPTPL',
    'MOVIMENTOS DE CONTA',
    'CONTA 26.31 DO nº 0000 0000 0000 de 05.09.2026 a 05.10.2026',
    'Data Valor Descritivo Débito Crédito Saldo (Euros)',
    '05.09.26 SALDO ANTERIOR 244,71',
    '06.09.26 06.09.26 Compra Mb Cartão **** 000* Loja Um 40,00 204,71',
    'Rua Qualquer',
    'Processado por Computador 08.09.26 08.09.26 Trf Recebida De Alguem 20,00 224,71',
    '09.09.26 09.09.26 Compra Mb Cartão **** 000* Loja Dois 4,71 220,00',
    '05.10.26 SALDO CONTABILÍSTICO 220,00',
  ].join('\n');

  const r = conferir(lerNovoBanco(extrato));

  it('lê os três movimentos e a cadeia fecha', () => {
    expect(r.movimentos).toHaveLength(3);
    expect(r.confere).toBe(true);
  });

  it('o rodapé à frente da linha não esconde o movimento', () => {
    // O extrato tem texto escrito de lado na margem, que o extrator mete à
    // frente de uma linha de movimento. Com a expressão ancorada no início,
    // esse movimento desaparecia — e um movimento a menos parte a cadeia.
    expect(r.movimentos[1].valor).toBe(20);
    expect(r.movimentos[1].descricao).not.toContain('Processado');
  });

  it('o débito e o crédito ficam com o sinal certo', () => {
    // No texto são os dois números positivos: «40,00 204,71» e «20,00
    // 224,71». Só o saldo os distingue.
    expect(r.movimentos[0].valor).toBe(-40);
    expect(r.movimentos[1].valor).toBe(20);
  });

  it('a continuação do descritivo junta-se ao movimento de cima', () => {
    expect(r.movimentos[0].descricao).toContain('Rua Qualquer');
  });

  it('guarda as duas datas: a de valor manda, a de lançamento fica', () => {
    expect(r.movimentos[0].data).toBe('2026-09-06');
    expect(r.movimentos[0].dataLancamento).toBe('2026-09-06');
  });

  it('o saldo anterior e o contabilístico são lidos do ficheiro', () => {
    expect(r.saldoInicial).toBe(244.71);
    expect(r.saldoFinal).toBe(220);
  });

  it('um movimento a faltar é apanhado pelo saldo final declarado', () => {
    const semUm = extrato.split('\n')
      .filter((l) => !l.includes('Loja Dois')).join('\n');
    expect(conferir(lerNovoBanco(semUm)).confere).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════ MILLENNIUM ══

describe('o EXTRATO COMBINADO do Millennium BCP', () => {
  const extrato = [
    'Banco Comercial Português, S.A.',
    'IBAN: PT50 0000 0000 0000 0000 3505 5',
    'EXTRATO DE 2026/08/03 A 2026/08/31',
    'LANC. VALOR DESCRITIVODEBITOCREDITOSALDO',
    'SALDO INICIAL 0.90',
    '8.037.31 TRF. RECEBIDA DE ALGUEM 511.00511.90',
    '8.038.03 REGULARIZA. INCUMPRIMENTO 100000002 504.287.62',
    '8.038.04 COM. MANUTENCAO CONTA 062026 5.202.42',
    '8.038.04 IMPOSTO DE SELO 17.3.4 0.212.21',
    'SALDO FINAL 2.21',
  ].join('\n');

  const r = conferir(lerMillennium(extrato));

  it('lê os quatro movimentos e a cadeia fecha', () => {
    expect(r.movimentos).toHaveLength(4);
    expect(r.confere).toBe(true);
  });

  it('descola dois números que vinham colados', () => {
    // «504.287.62» são 504,28 e 7,62. É o gerador de PDF do banco que escreve
    // as colunas sem espaço entre elas.
    expect(r.movimentos[1].valor).toBe(-504.28);
    expect(r.movimentos[1].saldo).toBe(7.62);
  });

  it('não começa a ler o valor a meio do número de contrato', () => {
    // «… 100000002 504.28» dava «02 504.28» — vinte e cinco mil euros numa
    // conta que tinha 511,90 €.
    expect(r.movimentos[1].valor).toBe(-504.28);
    expect(r.movimentos[1].referencia).toBe('100000002');
  });

  it('descola também as duas datas, e lê-as como mês.dia', () => {
    expect(r.movimentos[0].dataLancamento).toBe('2026-08-03');
    expect(r.movimentos[0].data).toBe('2026-07-31');
  });

  it('o ano vem do cabeçalho e não do relógio', () => {
    // Importar em Janeiro um extrato de Dezembro saltava um ano em todos os
    // movimentos.
    expect(r.movimentos.every((m) => m.data.startsWith('2026-'))).toBe(true);
  });

  it('sem o período no cabeçalho, avisa que as datas podem estar erradas', () => {
    const sem = extrato.split('\n').filter((l) => !l.startsWith('EXTRATO DE')).join('\n');
    expect(conferir(lerMillennium(sem)).avisos.join(' ')).toMatch(/ano errado/i);
  });

  it('o detalhe do crédito que vem no mesmo extrato NÃO entra nos movimentos', () => {
    const comCredito = [
      extrato,
      'DETALHE DAS PROXIMAS PRESTACOES',
      'DATA 2026/09/29 2026/10/29',
      'VALOR DA PRESTACAO 503.72 EUR 503.72 EUR',
    ].join('\n');
    expect(conferir(lerMillennium(comCredito)).movimentos).toHaveLength(4);
  });
});

// ══════════════════════════════════════════════════════════════ REVOLUT ══

describe('o extrato da Revolut Business', () => {
  const extrato = [
    'Extrato de conta',
    'Revolut Business',
    'Nome da conta Main',
    'IBAN LT23 0000 0000 0000 7354',
    'Saldo de abertura €0.00',
    'Entrada de dinheiro €1 000.00',
    'Saída de dinheiro - €964.00',
    'Saldo de encerramento €36.00',
    'Transações de 1 de setembro de 2026 para 30 de setembro de 2026',
    'Data (UTC) Descrição Saída de dinheiro Entrada de dinheiro Saldo',
    '23 set. 2026 MOS Para Alguem €64.00 €36.00',
    '22 set. 2026 CAR A16 €0.65 €100.00',
    '22 set. 2026 FEE Comissão da Revolut Business €35.00 €100.65',
    '21 set. 2026 MOA Dinheiro adicionado a partir de EMPRESA EXEMPLO €1 000.00 €135.65',
  ].join('\n');

  const r = conferir(lerRevolutBusiness(extrato));

  it('lê os movimentos pela ordem do tempo, não pela do ficheiro', () => {
    // O extrato vem do mais recente para o mais antigo, e a cadeia de saldos
    // só fecha na ordem do tempo.
    expect(r.movimentos[0].data).toBe('2026-09-21');
    expect(r.movimentos[r.movimentos.length - 1].data).toBe('2026-09-23');
  });

  it('«A16» não é um valor de 16 €', () => {
    // Foi o engano mais insidioso dos seis: o nome de uma auto-estrada
    // encaixava na forma «número com o euro depois», e o leitor lia um
    // movimento de 16,00 € com saldo 0,65 €.
    const a16 = r.movimentos.find((m) => m.descricao.includes('A16'));
    expect(a16?.valor).toBe(-0.65);
  });

  it('o saldo de abertura e de encerramento vêm do resumo', () => {
    expect(r.saldoInicial).toBe(0);
    expect(r.saldoFinal).toBe(36);
  });

  it('tira a data da descrição, para não aparecer duas vezes', () => {
    expect(r.movimentos[0].descricao).not.toMatch(/\d{4}/);
  });

  it('um saldo negativo escrito «-€31.51» é negativo', () => {
    const comNegativo = [
      'Revolut Business', 'Nome da conta Main',
      'Saldo de abertura €3.49',
      'Saldo de encerramento €0.00',
      '22 set. 2026 MOR De Alguem €31.51 €0.00',
      '22 set. 2026 FEE Comissão da Revolut Business €35.00 -€31.51',
    ].join('\n');
    const n = conferir(lerRevolutBusiness(comNegativo));
    expect(n.movimentos[0].saldo).toBe(-31.51);
    expect(n.movimentos[0].valor).toBe(-35);
    expect(n.confere).toBe(true);
  });
});

describe('o extrato da Revolut pessoal', () => {
  const extrato = [
    'Extrato de EUR',
    'Revolut Bank UAB',
    'IBAN LT52 0000 0000 0000 0232',
    'Resumo do saldo',
    'Produto Saldo disponível inicial Dinheiro retirado Dinheiro recebido Saldo disponível final',
    'Conta (Conta Corrente) 230,87€ 174,24€ 0,00€ 56,63€',
    'Total 230,87€ 174,24€ 0,00€ 56,63€',
    'Operações da conta de 1 de outubro de 2026 a 14 de outubro de 2026',
    'Data Descrição Dinheiro retirado Dinheiro recebido Saldo',
    '01/10/2026 Transferência para ALGUEM 170,20€ 60,67€',
    'Referência: To ALGUEM',
    'Para: ALGUEM',
    '01/10/2026 Loja Qualquer 4,04€ 56,63€',
    'Para: Loja Qualquer, 0000-000 Sitio',
    'Cartão: 400000******0000',
  ].join('\n');

  const r = conferir(lerRevolutPessoal(extrato));

  it('lê os dois movimentos e a cadeia fecha', () => {
    expect(r.movimentos).toHaveLength(2);
    expect(r.confere).toBe(true);
  });

  it('o saldo inicial e o final vêm da linha do resumo', () => {
    expect(r.saldoInicial).toBe(230.87);
    expect(r.saldoFinal).toBe(56.63);
  });

  it('a linha do câmbio NÃO é um movimento', () => {
    // «Taxa Revolut 1,00€ = 1,12$ / 15,80$» é o mesmo pagamento visto em
    // dólares. Importado como despesa, acrescentava um movimento que o banco
    // não tem.
    const comCambio = extrato.split('\n');
    comCambio.splice(13, 0, 'Taxa Revolut 1,00€ = 1,12$ 15,80$');
    const c = conferir(lerRevolutPessoal(comCambio.join('\n')));
    expect(c.movimentos).toHaveLength(2);
    expect(c.confere).toBe(true);
  });

  it('as linhas de detalhe entram no descritivo', () => {
    expect(r.movimentos[0].descricao).toMatch(/Refer/);
  });
});

// ════════════════════════════════════════════════ reconhecer e despachar ══

describe('reconhecer o banco pelo próprio ficheiro', () => {
  it('cada banco é reconhecido pela sua marca', () => {
    expect(reconhecerBanco('End. SWIFT/BIC BESCPTPL')).toBe('NOVO_BANCO');
    expect(reconhecerBanco('Banco Comercial Português, S.A.')).toBe('MILLENNIUM');
    expect(reconhecerBanco('MOVIMENTOS_PT50000000000000000000000')).toBe('ABANCA');
  });

  it('a Revolut Business é testada ANTES da pessoal', () => {
    // As duas têm «Revolut» no texto, e as convenções dos números são
    // diferentes: ao contrário, todos os extratos iam para o leitor errado.
    expect(reconhecerBanco('Revolut Business\nSaldo de abertura €0.00')).toBe('REVOLUT_BUSINESS');
    expect(reconhecerBanco('Revolut Bank UAB\nExtrato de EUR')).toBe('REVOLUT');
  });

  it('um ficheiro que não se reconhece é RECUSADO, e diz o que se lê', () => {
    const r = lerExtrato('Isto é uma factura de electricidade de Outubro de 2026, com um total.');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/não reconheci o banco/i);
  });

  it('um PDF sem texto diz que pode ser digitalizado', () => {
    const r = lerExtrato('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/digitalizado/i);
  });
});

// ═════════════════════════════════════════════════════════ classificação ══

describe('despesa, receita ou dinheiro a mudar de bolso', () => {
  // Os nomes vêm da base de dados, nunca do código — ver a nota em
  // `classificar.ts`. Aqui são inventados.
  const eu = { nomes: ['Nome Proprio Exemplo', 'Empresa Exemplo Lda'], contas: ['9680'] };

  it('o que saiu sem mais nada é despesa', () => {
    const c = classificar({ descricao: 'Compra Mb Loja Qualquer', valor: -40 }, eu);
    expect(c.classe).toBe('DESPESA');
    expect(c.confianca).toBe('pelo-sinal');
  });

  it('o que entrou sem mais nada é receita', () => {
    expect(classificar({ descricao: 'Plataforma Alfa', valor: 440.43 }, eu).classe).toBe('RECEITA');
  });

  it('«movimento entre contas» não é nem uma coisa nem outra', () => {
    const c = classificar({ descricao: 'Dinheiro adicionado a partir de EMPRESA EXEMPLO', valor: 1000 }, eu);
    expect(c.classe).toBe('TRANSFERENCIA');
    expect(c.confianca).toBe('certa');
  });

  it('suprimentos são um empréstimo do sócio, não receita', () => {
    // Era o caso que ele apontou: 900 € de «Devolução Suprimentos» contados
    // como despesa num mês de 36 € de resultado.
    const c = classificar({ descricao: 'Para Nome Proprio Exemplo • Devolução Suprimentos', valor: -900 }, eu);
    expect(c.classe).toBe('TRANSFERENCIA');
  });

  it('uma transferência com o nome dele é entre contas dele', () => {
    const c = classificar({ descricao: 'Trf Imediata Sepa+ De Nome Proprio Exemplo', valor: 250 }, eu);
    expect(c.classe).toBe('TRANSFERENCIA');
    expect(c.motivo).toContain('Nome Proprio Exemplo');
  });

  it('o nome do meio abreviado continua a ser reconhecido', () => {
    // Um banco escreve «Nome Proprio Exemplo» e outro «Nome P Exemplo».
    const c = classificar({ descricao: 'Trf Sepa De Nome P Exemplo', valor: 100 }, eu);
    expect(c.classe).toBe('TRANSFERENCIA');
  });

  it('o número de uma conta dele basta', () => {
    const c = classificar({ descricao: 'Transferencia para conta 9680', valor: -500 }, eu);
    expect(c.classe).toBe('TRANSFERENCIA');
    expect(c.confianca).toBe('certa');
  });

  it('o nome dele SEM palavra de transferência não é transferência', () => {
    // Um ordenado pago por ele a ele é despesa da empresa. Marcá-lo como
    // transferência apagava um custo real do lucro.
    const c = classificar({ descricao: 'Ordenado Gerente Nome Proprio Exemplo', valor: -500 }, eu);
    expect(c.classe).toBe('DESPESA');
    expect(c.motivo).toMatch(/Confirme/);
  });

  it('sem nomes configurados, nada é tomado por transferência de ninguém', () => {
    const c = classificar({ descricao: 'Trf Imediata Sepa+ De Nome Proprio Exemplo', valor: 250 });
    expect(c.classe).toBe('RECEITA');
  });

  it('um nome curto não serve para reconhecer nada', () => {
    // «Ana» apareceria em metade dos descritivos.
    const c = classificar({ descricao: 'Trf De Ana Maria', valor: 20 }, { nomes: ['Ana'] });
    expect(c.classe).toBe('RECEITA');
  });

  it('acentos e maiúsculas não impedem o reconhecimento', () => {
    expect(achatar('DIOGO RAFAEL LEAL ISAÍAS')).toBe('diogo rafael leal isaias');
    const c = classificar({ descricao: 'TRF. P/O NOME PRÓPRIO EXEMPLO', valor: 511 }, eu);
    expect(c.classe).toBe('TRANSFERENCIA');
  });

  it('conta quantas de cada, para o resumo do ecrã', () => {
    expect(contarClasses([
      { classe: 'DESPESA' }, { classe: 'DESPESA' }, { classe: 'TRANSFERENCIA' },
    ])).toEqual({ DESPESA: 2, RECEITA: 0, TRANSFERENCIA: 1 });
  });
});
