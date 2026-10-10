// src/modules/system/funcionalidades.test.ts

import { describe, it, expect } from 'vitest';
import {
  FUNCIONALIDADES, OBRIGATORIAS, normalizarFuncionalidades,
  areasDasFuncionalidades, planoInclui, existeFuncionalidade,
} from './funcionalidades';

describe('o catálogo', () => {
  it('não tem códigos repetidos', () => {
    // Dois iguais davam duas caixas no editor que gravam a mesma coisa, e a
    // segunda a apagar a primeira sem ninguém perceber.
    const codigos = FUNCIONALIDADES.map((f) => f.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('não vende investimentos, investidores nem projetos', () => {
    // Esses são da casa. Se algum dia aparecerem aqui, é por distração — e
    // este teste é o que a apanha.
    const codigos = FUNCIONALIDADES.map((f) => f.codigo);
    expect(codigos).not.toContain('INVESTMENTS');
    expect(codigos).not.toContain('INVESTORS');
    expect(codigos).not.toContain('PROJECTS');
  });

  it('o painel é a única obrigatória', () => {
    expect(OBRIGATORIAS).toEqual(['DASHBOARD']);
  });
});

describe('normalizarFuncionalidades', () => {
  it('põe sempre o painel, mesmo que ninguém o marque', () => {
    // Um plano sem painel é um plano onde se entra e não há primeira página.
    expect(normalizarFuncionalidades([])).toEqual(['DASHBOARD']);
    expect(normalizarFuncionalidades(['OFICINA'])).toEqual(['DASHBOARD', 'OFICINA']);
  });

  it('ignora códigos que não existem em vez de recusar', () => {
    // Para que um plano antigo, com o código de uma funcionalidade que já saiu
    // do catálogo, continue a poder ser guardado.
    expect(normalizarFuncionalidades(['OFICINA', 'COISA_QUE_JA_NAO_EXISTE']))
      .toEqual(['DASHBOARD', 'OFICINA']);
  });

  it('tira repetidos', () => {
    expect(normalizarFuncionalidades(['OFICINA', 'OFICINA', 'DASHBOARD']))
      .toEqual(['DASHBOARD', 'OFICINA']);
  });

  it('a ordem é a do catálogo, não a das caixas', () => {
    // Dois planos com as mesmas funcionalidades gravam a mesma lista, seja
    // qual for a ordem por que se carregou nas caixas.
    const a = normalizarFuncionalidades(['MATERIAL', 'DRIVERS', 'OFICINA']);
    const b = normalizarFuncionalidades(['OFICINA', 'MATERIAL', 'DRIVERS']);
    expect(a).toEqual(b);
    expect(a).toEqual(['DASHBOARD', 'DRIVERS', 'OFICINA', 'MATERIAL']);
  });

  it('aceita minúsculas e espaços', () => {
    expect(normalizarFuncionalidades([' oficina ', 'material']))
      .toEqual(['DASHBOARD', 'OFICINA', 'MATERIAL']);
  });
});

describe('areasDasFuncionalidades', () => {
  it('a oficina e o material abrem a área da frota', () => {
    // As três entradas da Frota vivem na mesma área. Um plano que venda só a
    // oficina tem de abrir FLEET — senão a rota recusa o que o plano vendeu.
    expect(areasDasFuncionalidades(['OFICINA']).sort()).toEqual(['DASHBOARD', 'FLEET']);
  });

  it('os extras não abrem área nenhuma', () => {
    // A extensão não é um menu: é uma coisa que a frota tem.
    expect(areasDasFuncionalidades(['EXTENSAO'])).toEqual(['DASHBOARD']);
  });

  it('um plano com tudo abre todas as áreas que o catálogo conhece', () => {
    const todas = areasDasFuncionalidades(FUNCIONALIDADES.map((f) => f.codigo));
    expect(todas).toContain('FLEET');
    expect(todas).toContain('SETTLEMENTS');
    expect(todas).toContain('TEAM');
    expect(todas).not.toContain('INVESTMENTS');
  });
});

describe('planoInclui', () => {
  it('o painel está incluído mesmo quando não está na lista', () => {
    expect(planoInclui([], 'DASHBOARD')).toBe(true);
  });

  it('o resto é o que está na lista', () => {
    expect(planoInclui(['OFICINA'], 'OFICINA')).toBe(true);
    expect(planoInclui(['OFICINA'], 'MATERIAL')).toBe(false);
  });
});

describe('existeFuncionalidade', () => {
  it('conhece as do catálogo e mais nenhuma', () => {
    expect(existeFuncionalidade('EXTENSAO')).toBe(true);
    expect(existeFuncionalidade('INVESTORS')).toBe(false);
  });
});
