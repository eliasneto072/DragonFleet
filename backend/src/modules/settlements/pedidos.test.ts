// src/modules/settlements/pedidos.test.ts

import { describe, it, expect } from 'vitest';
import {
  LINHAS, MAXIMO_DE_ABERTOS_POR_FECHO,
  etiquetaDaLinha, linhaConhecida, linhasQuestionaveis, podePedir,
  respostaCompleta, resumirPedidos,
} from './pedidos';

/** Um fecho com a Via Verde e o combustível preenchidos e o resto a zero. */
const FECHO = {
  tollsAmount: 14.45,
  fuelAmount: 62.1,
  chargeAmount: 0,
  vehicleFee: 0,
  otherDeductions: 0,
  taxAmount: 0,
  commissionAmount: 0,
  uberAmount: 0,
  boltAmount: 0,
};

const linhas = (r: { linha: string }[]) => r.map((l) => l.linha);

describe('o catálogo das linhas', () => {
  it('começa pela Via Verde, que é a dúvida que ele trouxe', () => {
    expect(LINHAS[0].linha).toBe('VIA_VERDE');
  });

  it('acaba na OUTRA, a saída para a dúvida que não cabe nas outras', () => {
    expect(LINHAS[LINHAS.length - 1].linha).toBe('OUTRA');
  });

  it('não repete linhas nem campos', () => {
    const nomes = LINHAS.map((l) => l.linha);
    expect(new Set(nomes).size).toBe(nomes.length);
    const campos = LINHAS.map((l) => l.campo).filter((c) => c !== null);
    expect(new Set(campos).size).toBe(campos.length);
  });

  it('dá uma etiqueta em português a cada linha', () => {
    expect(etiquetaDaLinha('VIA_VERDE')).toBe('Via Verde (portagens)');
    expect(etiquetaDaLinha('COMBUSTIVEL')).toBe('Combustível');
  });

  it('uma linha desconhecida devolve o próprio código, e não vazio', () => {
    // Um fecho antigo com um código que já não existe tem de continuar a
    // mostrar algo. Vazio dava uma linha sem nome no ecrã.
    expect(etiquetaDaLinha('COISA_ANTIGA')).toBe('COISA_ANTIGA');
    expect(linhaConhecida('COISA_ANTIGA')).toBe(false);
    expect(linhaConhecida('VIA_VERDE')).toBe(true);
  });
});

describe('que linhas é que vale a pena questionar', () => {
  it('mostra as que têm valor e deixa de fora as que estão a zero', () => {
    expect(linhas(linhasQuestionaveis(FECHO))).toEqual([
      'VIA_VERDE', 'COMBUSTIVEL', 'OUTRA',
    ]);
  });

  it('a OUTRA aparece sempre, mesmo num fecho todo a zero', () => {
    const vazio = linhasQuestionaveis({});
    expect(linhas(vazio)).toEqual(['OUTRA']);
    expect(vazio[0].valor).toBe(0);
  });

  it('uma dedução guardada em negativo é tão questionável como em positivo', () => {
    const r = linhasQuestionaveis({ ...FECHO, tollsAmount: -14.45 });
    const vv = r.find((l) => l.linha === 'VIA_VERDE');
    expect(vv).toBeDefined();
    expect(vv!.valor).toBe(14.45);
  });

  it('trata nulo e indefinido como zero', () => {
    const r = linhasQuestionaveis({ tollsAmount: null, fuelAmount: undefined });
    expect(linhas(r)).toEqual(['OUTRA']);
  });

  it('respeita a ordem do catálogo, e não a ordem dos valores', () => {
    const r = linhasQuestionaveis({ boltAmount: 900, tollsAmount: 1 });
    expect(linhas(r)).toEqual(['VIA_VERDE', 'BOLT', 'OUTRA']);
  });
});

describe('um pedido aberto por linha', () => {
  it('marca a linha com pedido aberto e explica porquê', () => {
    const r = linhasQuestionaveis(FECHO, [
      { line: 'VIA_VERDE', status: 'ABERTO' },
    ]);
    const vv = r.find((l) => l.linha === 'VIA_VERDE')!;
    expect(vv.pedidoAberto).toBe(true);
    expect(vv.disponivel).toBe(false);
    expect(vv.motivo).toMatch(/à espera de resposta/);
  });

  it('não contamina as outras linhas', () => {
    const r = linhasQuestionaveis(FECHO, [
      { line: 'VIA_VERDE', status: 'ABERTO' },
    ]);
    expect(r.find((l) => l.linha === 'COMBUSTIVEL')!.disponivel).toBe(true);
  });

  it('depois de respondido, pode voltar a perguntar na mesma linha', () => {
    // É o caso que o índice único PARCIAL da base deixa passar de propósito:
    // o extrato chegou e continua a não bater certo.
    const r = linhasQuestionaveis(FECHO, [
      { line: 'VIA_VERDE', status: 'RESPONDIDO' },
    ]);
    const vv = r.find((l) => l.linha === 'VIA_VERDE')!;
    expect(vv.jaRespondido).toBe(true);
    expect(vv.pedidoAberto).toBe(false);
    expect(vv.disponivel).toBe(true);
    expect(vv.motivo).toBeNull();
  });

  it('uma linha corrigida para zero continua a mostrar o pedido já feito', () => {
    // Senão o pedido dele desaparecia do ecrã por causa de uma correção ao
    // fecho, e ele ficava à espera de uma resposta que não via onde estava.
    const r = linhasQuestionaveis({ ...FECHO, tollsAmount: 0 }, [
      { line: 'VIA_VERDE', status: 'ABERTO' },
    ]);
    expect(linhas(r)).toContain('VIA_VERDE');
    expect(r.find((l) => l.linha === 'VIA_VERDE')!.valor).toBe(0);
  });
});

describe('o travão aos pedidos a mais', () => {
  const cheio = {
    tollsAmount: 10, fuelAmount: 10, chargeAmount: 10,
    vehicleFee: 10, otherDeductions: 10, uberAmount: 10,
  };
  const abertos = [
    { line: 'VIA_VERDE', status: 'ABERTO' },
    { line: 'COMBUSTIVEL', status: 'ABERTO' },
    { line: 'CARREGAMENTO', status: 'ABERTO' },
    { line: 'VIATURA', status: 'ABERTO' },
  ];

  it('com o máximo de abertos, mais nenhuma linha fica disponível', () => {
    expect(abertos.length).toBe(MAXIMO_DE_ABERTOS_POR_FECHO);
    const r = linhasQuestionaveis(cheio, abertos);
    expect(r.every((l) => l.disponivel === false)).toBe(true);
    expect(r.find((l) => l.linha === 'UBER')!.motivo).toMatch(/Aguarda uma resposta/);
  });

  it('um abaixo do máximo e ainda dá para pedir', () => {
    const r = linhasQuestionaveis(cheio, abertos.slice(0, 3));
    expect(r.find((l) => l.linha === 'UBER')!.disponivel).toBe(true);
  });

  it('os respondidos não contam para o travão', () => {
    const r = linhasQuestionaveis(
      cheio,
      abertos.map((a) => ({ ...a, status: 'RESPONDIDO' })),
    );
    expect(r.find((l) => l.linha === 'UBER')!.disponivel).toBe(true);
  });
});

describe('podePedir', () => {
  it('deixa pedir numa linha com valor e sem pedido aberto', () => {
    expect(podePedir(FECHO, 'VIA_VERDE')).toEqual({ pode: true, motivo: null });
  });

  it('recusa uma linha que não existe', () => {
    const r = podePedir(FECHO, 'FOGUETE');
    expect(r.pode).toBe(false);
    expect(r.motivo).toMatch(/não existe/);
  });

  it('recusa uma linha que está a zero nessa semana', () => {
    const r = podePedir(FECHO, 'BOLT');
    expect(r.pode).toBe(false);
    expect(r.motivo).toMatch(/não tem valor/);
  });

  it('recusa um segundo pedido aberto na mesma linha', () => {
    const r = podePedir(FECHO, 'VIA_VERDE', [{ line: 'VIA_VERDE', status: 'ABERTO' }]);
    expect(r.pode).toBe(false);
  });

  it('deixa sempre pedir na OUTRA, mesmo num fecho vazio', () => {
    expect(podePedir({}, 'OUTRA').pode).toBe(true);
  });
});

describe('uma resposta tem de dizer alguma coisa', () => {
  it('texto sozinho serve', () => {
    expect(respostaCompleta({ answer: 'é a passagem da ponte, duas vezes' })).toBe(true);
  });

  it('ficheiro sozinho serve', () => {
    expect(respostaCompleta({ fileUrl: 'https://exemplo.invalid/extrato.pdf' })).toBe(true);
  });

  it('nem texto nem ficheiro não serve', () => {
    expect(respostaCompleta({})).toBe(false);
    expect(respostaCompleta({ answer: '', fileUrl: null })).toBe(false);
  });

  it('espaços em branco não são uma resposta', () => {
    expect(respostaCompleta({ answer: '   \n  ' })).toBe(false);
  });
});

describe('o resumo que alimenta o contador do menu', () => {
  const pedidos = [
    { line: 'VIA_VERDE', status: 'ABERTO', createdAt: '2026-10-10T08:00:00.000Z' },
    { line: 'VIA_VERDE', status: 'ABERTO', createdAt: '2026-10-12T08:00:00.000Z' },
    { line: 'COMBUSTIVEL', status: 'ABERTO', createdAt: '2026-10-08T08:00:00.000Z' },
    { line: 'IMPOSTO', status: 'RESPONDIDO', createdAt: '2026-10-01T08:00:00.000Z' },
  ];

  it('conta só os abertos', () => {
    expect(resumirPedidos(pedidos).abertos).toBe(3);
  });

  it('o mais antigo é o mais antigo DOS ABERTOS', () => {
    // O respondido de 1 de outubro é mais velho, e não deve mandar: senão o
    // menu dizia "espera há 13 dias" por causa de algo já tratado.
    expect(resumirPedidos(pedidos).maisAntigo).toBe('2026-10-08T08:00:00.000Z');
  });

  it('agrupa por linha, da que tem mais para a que tem menos', () => {
    expect(resumirPedidos(pedidos).porLinha).toEqual([
      { linha: 'VIA_VERDE', etiqueta: 'Via Verde (portagens)', abertos: 2 },
      { linha: 'COMBUSTIVEL', etiqueta: 'Combustível', abertos: 1 },
    ]);
  });

  it('sem pedidos, zero e sem data — e não uma data de hoje', () => {
    expect(resumirPedidos([])).toEqual({ abertos: 0, maisAntigo: null, porLinha: [] });
  });

  it('sem abertos, também não há data', () => {
    const r = resumirPedidos([pedidos[3]]);
    expect(r.abertos).toBe(0);
    expect(r.maisAntigo).toBeNull();
  });

  it('ignora datas estragadas em vez de devolver uma data inválida', () => {
    const r = resumirPedidos([
      { line: 'OUTRA', status: 'ABERTO', createdAt: 'isto-não-é-uma-data' },
    ]);
    expect(r.abertos).toBe(1);
    expect(r.maisAntigo).toBeNull();
  });
});
