// src/modules/materials/custeio.test.ts
//
// Os casos que interessam são todos da forma "comprei a este preço, depois
// àquele, gastei, e agora quanto é que isto custou". São contas de três linhas
// e é por isso que vivem fora do serviço — testá-las com base de dados à volta
// custava uma hora e dava menos.

import { describe, it, expect } from 'vitest';
import {
  entrada, saida, ajuste, arredondar, valorDoStock, stockBaixo, ErroDeStock,
} from './custeio';

const vazio = { qty: 0, avgCost: 0 };

describe('arredondar', () => {
  it('apanha o caso que o toFixed erra', () => {
    // 0.615 não existe exactamente em binário: o toFixed(2) devolve "0.61".
    expect(arredondar(0.615, 2)).toBe(0.62);
    expect(arredondar(1.005, 2)).toBe(1.01);
  });

  it('não estraga o que já está certo', () => {
    expect(arredondar(4.1, 2)).toBe(4.1);
    expect(arredondar(0, 2)).toBe(0);
    expect(arredondar(-2.345, 2)).toBe(-2.35);
  });
});

describe('entrada', () => {
  it('a primeira compra fixa a média', () => {
    const r = entrada(vazio, 10, 4.1);
    expect(r.estado.qty).toBe(10);
    expect(r.estado.avgCost).toBe(4.1);
    expect(r.totalCost).toBe(41);
  });

  it('a segunda compra faz a média ponderada e não a simples', () => {
    // 10 a 4,10 € e 10 a 4,60 € → média 4,35 €. Aqui a simples dá o mesmo,
    // por isso o caso a seguir é o que prova a ponderação.
    const r = entrada({ qty: 10, avgCost: 4.1 }, 10, 4.6);
    expect(r.estado.qty).toBe(20);
    expect(r.estado.avgCost).toBe(4.35);
  });

  it('pesa pelas quantidades — 90 a 4,10 e 10 a 10,00 não é 7,05', () => {
    const r = entrada({ qty: 90, avgCost: 4.1 }, 10, 10);
    // (90 × 4,10 + 10 × 10,00) ÷ 100 = 4,69
    expect(r.estado.avgCost).toBe(4.69);
    // A média simples seria 7,05 — mais de 50% acima.
    expect(r.estado.avgCost).toBeLessThan(5);
  });

  it('aceita custo zero: material de garantia, amostra, brinde', () => {
    const r = entrada({ qty: 10, avgCost: 4 }, 10, 0);
    expect(r.estado.avgCost).toBe(2);
    expect(r.totalCost).toBe(0);
  });

  it('recusa preço negativo — isso é uma devolução, não uma compra', () => {
    expect(() => entrada(vazio, 5, -1)).toThrow(ErroDeStock);
  });

  it('recusa quantidade zero ou negativa', () => {
    expect(() => entrada(vazio, 0, 4)).toThrow(ErroDeStock);
    expect(() => entrada(vazio, -3, 4)).toThrow(ErroDeStock);
  });

  it('com stock negativo, a média passa a ser o preço desta compra', () => {
    // O caso perigoso: sem este tratamento, o valor negativo do que "havia"
    // entrava na média e dava um custo sem sentido — ou uma divisão por zero.
    const r = entrada({ qty: -4, avgCost: 4.1 }, 10, 5);
    expect(r.estado.qty).toBe(6);
    expect(r.estado.avgCost).toBe(5);
  });
});

describe('saida', () => {
  it('valoriza ao custo médio do momento', () => {
    const r = saida({ qty: 20, avgCost: 4.35 }, 3);
    expect(r.estado.qty).toBe(17);
    expect(r.unitCost).toBe(4.35);
    expect(r.totalCost).toBe(13.05);
  });

  it('NÃO mexe na média — tirar da prateleira não muda o que custou', () => {
    const r = saida({ qty: 20, avgCost: 4.35 }, 19);
    expect(r.estado.avgCost).toBe(4.35);
  });

  it('aceita meias unidades', () => {
    const r = saida({ qty: 5, avgCost: 10 }, 0.5);
    expect(r.estado.qty).toBe(4.5);
    expect(r.totalCost).toBe(5);
  });

  it('deixa o stock ficar negativo, de propósito', () => {
    // O material saiu da prateleira: recusar obrigaria a inventar uma compra
    // para o poder registar. O negativo é o aviso de que falta uma factura.
    const r = saida({ qty: 2, avgCost: 4 }, 5);
    expect(r.estado.qty).toBe(-3);
  });

  it('recusa quantidade zero', () => {
    expect(() => saida({ qty: 10, avgCost: 1 }, 0)).toThrow(ErroDeStock);
  });
});

describe('ajuste', () => {
  it('recebe a quantidade CONTADA e calcula a diferença', () => {
    const r = ajuste({ qty: 20, avgCost: 4.35 }, 17);
    expect(r.estado.qty).toBe(17);
    expect(r.diferenca).toBe(-3);
  });

  it('uma falta fica com valor negativo — é um prejuízo', () => {
    const r = ajuste({ qty: 20, avgCost: 4.35 }, 17);
    expect(r.totalCost).toBe(-13.05);
  });

  it('não mexe na média quando já havia stock', () => {
    const r = ajuste({ qty: 20, avgCost: 4.35 }, 25);
    expect(r.estado.avgCost).toBe(4.35);
    expect(r.diferenca).toBe(5);
  });

  it('uma sobra com stock a zero pode fixar a média, se vier preço', () => {
    const r = ajuste({ qty: 0, avgCost: 0 }, 6, 3.5);
    expect(r.estado.qty).toBe(6);
    expect(r.estado.avgCost).toBe(3.5);
  });

  it('sem preço e sem média, aceita o ajuste e deixa a média a zero', () => {
    // A quantidade é a parte que interessa à prateleira. Recusar o ajuste por
    // não haver preço deixava a contagem errada para proteger um número.
    const r = ajuste({ qty: 0, avgCost: 0 }, 6);
    expect(r.estado.qty).toBe(6);
    expect(r.estado.avgCost).toBe(0);
  });

  it('recusa uma contagem igual ao stock', () => {
    expect(() => ajuste({ qty: 10, avgCost: 1 }, 10)).toThrow(ErroDeStock);
  });

  it('recusa contagem negativa', () => {
    expect(() => ajuste({ qty: 10, avgCost: 1 }, -1)).toThrow(ErroDeStock);
  });
});

describe('uma vida inteira de um material', () => {
  it('compra, compra mais caro, gasta, e a conta fecha', () => {
    // 20 L a 4,10 €
    let e = entrada(vazio, 20, 4.1).estado;
    expect(e).toEqual({ qty: 20, avgCost: 4.1 });

    // + 20 L a 4,60 € → 40 L a 4,35 €
    e = entrada(e, 20, 4.6).estado;
    expect(e).toEqual({ qty: 40, avgCost: 4.35 });

    // Uma revisão gasta 4,5 L
    const revisao = saida(e, 4.5);
    e = revisao.estado;
    expect(revisao.totalCost).toBe(19.58);   // 4,5 × 4,35 = 19,575 → 19,58
    expect(e.qty).toBe(35.5);
    expect(e.avgCost).toBe(4.35);

    // A contagem diz 35 — faltou meio litro
    const contagem = ajuste(e, 35);
    expect(contagem.diferenca).toBe(-0.5);
    expect(contagem.totalCost).toBe(-2.18);  // 0,5 × 4,35 = 2,175 → 2,18
  });
});

describe('valorDoStock', () => {
  it('soma quantidade × custo médio de cada linha', () => {
    expect(valorDoStock([
      { qty: 35, avgCost: 4.35 },
      { qty: 4, avgCost: 12.5 },
    ])).toBe(202.25);
  });

  it('um stock negativo baixa o valor, em vez de ser ignorado', () => {
    expect(valorDoStock([{ qty: -2, avgCost: 10 }])).toBe(-20);
  });

  it('nada em stock vale zero', () => {
    expect(valorDoStock([])).toBe(0);
  });
});

describe('stockBaixo', () => {
  it('sem mínimo, nunca assinala', () => {
    expect(stockBaixo(0, null)).toBe(false);
    expect(stockBaixo(0, undefined)).toBe(false);
  });

  it('assinala no mínimo e abaixo dele', () => {
    expect(stockBaixo(3, 3)).toBe(true);
    expect(stockBaixo(2, 3)).toBe(true);
    expect(stockBaixo(4, 3)).toBe(false);
  });
});
