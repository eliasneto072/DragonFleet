// src/modules/companies/matriz.test.ts
//
// São somas de dinheiro que vão para a contabilidade. Uma soma errada aqui não
// dá erro: dá um número que parece certo e que não bate com o extrato.

import { describe, it, expect } from 'vitest';
import {
  montarMatriz, paraCentimos, chaveDaLinha,
  CHAVE_NENHUM, CHAVE_POR_CLASSIFICAR, PREFIXO_OUTRA,
  type LinhaCrua,
} from './matriz';

const MOTORISTAS = [
  { id: 'u1', nome: 'Diogo Didelet' },
  { id: 'u2', nome: 'Ana Silva' },
  { id: 'u3', nome: 'Bruno Costa' },
];

const SOCIEDADES = [
  { id: 'c1', nome: 'Empresa A' },
  { id: 'c2', nome: 'Empresa B' },
];

const linha = (p: Partial<LinhaCrua>): LinhaCrua => ({
  userId: 'u1', userName: 'Diogo Didelet',
  companyId: null, companyOther: null, classificado: true, total: '0.00',
  ...p,
});

describe('paraCentimos', () => {
  it('converte sem perder cêntimos', () => {
    expect(paraCentimos('1000.00')).toBe(100000);
    expect(paraCentimos('0.01')).toBe(1);
    expect(paraCentimos('1234.56')).toBe(123456);
    expect(paraCentimos('7')).toBe(700);
  });

  it('trunca em vez de arredondar', () => {
    // A coluna é Decimal(12,2) e já só tem duas casas. Se um dia vier mais,
    // truncar não inventa um cêntimo que não está na base.
    expect(paraCentimos('1.999')).toBe(199);
  });

  it('aceita negativos', () => {
    expect(paraCentimos('-50.25')).toBe(-5025);
  });

  it('texto que não é número dá zero em vez de NaN', () => {
    // Um NaN propagava-se por todas as somas e punha a tabela inteira vazia.
    expect(paraCentimos('')).toBe(0);
    expect(paraCentimos('abc')).toBe(0);
  });
});

describe('chaveDaLinha', () => {
  it('uma sociedade da lista vai pelo id', () => {
    const c = chaveDaLinha(linha({ companyId: 'c1' }));
    expect(c).toEqual({ chave: 'c1', nome: '', tipo: 'sociedade' });
  });

  it('o texto livre junta variantes de maiúsculas numa coluna só', () => {
    // "Empresa A" e "empresa a" são a mesma empresa escrita por duas pessoas.
    const a = chaveDaLinha(linha({ companyOther: 'Transportes X' }));
    const b = chaveDaLinha(linha({ companyOther: 'transportes x' }));
    expect(a.chave).toBe(b.chave);
    expect(a.chave).toBe(`${PREFIXO_OUTRA}transportes x`);
    expect(a.tipo).toBe('outra');
  });

  it('"sem sociedade" e "por classificar" são colunas diferentes', () => {
    // Uma é uma decisão; a outra é trabalho por fazer. Juntá-las escondia
    // trabalho dentro de um número que parecia arrumado.
    expect(chaveDaLinha(linha({ classificado: true })).chave).toBe(CHAVE_NENHUM);
    expect(chaveDaLinha(linha({ classificado: false })).chave).toBe(CHAVE_POR_CLASSIFICAR);
  });
});

describe('montarMatriz', () => {
  it('o caso que ele pediu: um motorista, duas empresas', () => {
    const m = montarMatriz([
      linha({ userId: 'u1', companyId: 'c1', total: '1000.00' }),
      linha({ userId: 'u1', companyId: 'c2', total: '1000.00' }),
    ], MOTORISTAS, SOCIEDADES);

    const diogo = m.linhas.find((l) => l.userId === 'u1')!;
    expect(diogo.valores.c1).toBe(1000);
    expect(diogo.valores.c2).toBe(1000);
    expect(diogo.total).toBe(2000);
    expect(m.total).toBe(2000);
  });

  it('todos os motoristas aparecem, mesmo os que não passaram nada', () => {
    // Um motorista ausente lê-se como "não existe"; com zeros lê-se como
    // "não passou nada", que é outra coisa e é a verdade.
    const m = montarMatriz(
      [linha({ userId: 'u1', companyId: 'c1', total: '500.00' })],
      MOTORISTAS, SOCIEDADES,
    );
    expect(m.linhas.length).toBe(3);
    expect(m.linhas.find((l) => l.userId === 'u2')!.total).toBe(0);
  });

  it('as linhas saem por ordem alfabética', () => {
    // Abre-se para procurar UMA pessoa, e por ordem de valor essa pessoa muda
    // de sítio de mês para mês.
    const m = montarMatriz([], MOTORISTAS, SOCIEDADES);
    expect(m.linhas.map((l) => l.nome)).toEqual(['Ana Silva', 'Bruno Costa', 'Diogo Didelet']);
  });

  it('uma sociedade sem nada no período não ganha coluna', () => {
    const m = montarMatriz(
      [linha({ userId: 'u1', companyId: 'c1', total: '100.00' })],
      MOTORISTAS, SOCIEDADES,
    );
    expect(m.colunas.map((c) => c.chave)).toEqual(['c1']);
  });

  it('a ordem das colunas: lista, texto livre, e no fim o que não é venda', () => {
    const m = montarMatriz([
      linha({ userId: 'u1', companyId: 'c2', total: '10.00' }),
      linha({ userId: 'u1', companyId: 'c1', total: '10.00' }),
      linha({ userId: 'u1', companyOther: 'Zeta', total: '10.00' }),
      linha({ userId: 'u1', companyOther: 'Alfa', total: '10.00' }),
      linha({ userId: 'u1', classificado: true, total: '10.00' }),
      linha({ userId: 'u1', classificado: false, total: '10.00' }),
    ], MOTORISTAS, SOCIEDADES);

    expect(m.colunas.map((c) => c.chave)).toEqual([
      'c1', 'c2',
      `${PREFIXO_OUTRA}alfa`, `${PREFIXO_OUTRA}zeta`,
      CHAVE_NENHUM, CHAVE_POR_CLASSIFICAR,
    ]);
  });

  it('os totais batem nos dois sentidos', () => {
    // A soma das linhas, a soma das colunas e o total têm de dar o mesmo. Se
    // não derem, o erro está nesta função e não nos dados.
    const m = montarMatriz([
      linha({ userId: 'u1', companyId: 'c1', total: '333.33' }),
      linha({ userId: 'u1', companyId: 'c2', total: '0.01' }),
      linha({ userId: 'u2', companyId: 'c1', total: '666.67' }),
      linha({ userId: 'u3', companyOther: 'Outra Lda', total: '0.99' }),
    ], MOTORISTAS, SOCIEDADES);

    const somaLinhas = m.linhas.reduce((s, l) => s + l.total, 0);
    const somaColunas = Object.values(m.totaisPorColuna).reduce((s, v) => s + v, 0);

    expect(m.total).toBe(1001);
    expect(Math.round(somaLinhas * 100)).toBe(100100);
    expect(Math.round(somaColunas * 100)).toBe(100100);
  });

  it('cem cêntimos somados não perdem nada', () => {
    // O teste que apanha a vírgula flutuante: 0.1 + 0.2 em JavaScript dá
    // 0.30000000000000004, e cem destes dão um erro visível.
    const cruas = Array.from({ length: 100 }, () =>
      linha({ userId: 'u1', companyId: 'c1', total: '0.10' }));
    const m = montarMatriz(cruas, MOTORISTAS, SOCIEDADES);
    expect(m.total).toBe(10);
    expect(m.linhas.find((l) => l.userId === 'u1')!.total).toBe(10);
  });

  it('uma sociedade apagada ainda mostra a coluna, com nome', () => {
    // O SET NULL não apaga retiradas, mas uma sociedade pode sair da lista.
    // Esconder a coluna fazia o total do motorista não bater.
    const m = montarMatriz(
      [linha({ userId: 'u1', companyId: 'cX', total: '50.00' })],
      MOTORISTAS, SOCIEDADES,
    );
    expect(m.total).toBe(50);
  });

  it('sem dados nenhuns, a tabela tem motoristas e nenhuma coluna', () => {
    const m = montarMatriz([], MOTORISTAS, SOCIEDADES);
    expect(m.colunas).toEqual([]);
    expect(m.total).toBe(0);
    expect(m.linhas.every((l) => l.total === 0)).toBe(true);
  });
});
