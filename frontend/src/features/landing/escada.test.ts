// src/features/landing/escada.test.ts
//
// «Tudo o do plano anterior» é uma afirmação numa página de preços. Os casos
// que interessam não são os normais — são aqueles em que ela deixa de ser
// verdade sem ninguém reparar.

import { describe, it, expect } from 'vitest';
import { escadaDePlanos, type PlanoPublico } from './escada';

function f(...codigos: string[]) {
  return codigos.map((c) => ({ codigo: c, nome: c.toLowerCase() }));
}

function plano(nome: string, preco: string, ...codigos: string[]): PlanoPublico {
  return { id: nome, nome, preco, duracaoDias: 30, inclui: f(...codigos) };
}

const BASICO = plano('Básico', '10', 'DASHBOARD', 'DRIVERS');
const ESSENCIAL = plano('Essencial', '27.99', 'DASHBOARD', 'DRIVERS', 'OFICINA');
const COMPLETO = plano('Completo', '34.99', 'DASHBOARD', 'DRIVERS', 'OFICINA', 'MATERIAL');

describe('a escada normal', () => {
  it('o primeiro mostra tudo, os outros só o que acrescentam', () => {
    const e = escadaDePlanos([BASICO, ESSENCIAL, COMPLETO]);

    expect(e[0].herdaDe).toBe(null);
    expect(e[0].mostrar.map((x) => x.codigo)).toEqual(['DASHBOARD', 'DRIVERS']);

    expect(e[1].herdaDe).toBe('Básico');
    expect(e[1].mostrar.map((x) => x.codigo)).toEqual(['OFICINA']);

    expect(e[2].herdaDe).toBe('Essencial');
    expect(e[2].mostrar.map((x) => x.codigo)).toEqual(['MATERIAL']);
  });

  it('ordena pelo preço, venha o servidor por que ordem vier', () => {
    // Montados no painel, os planos podem sair por ordem de criação. Uma
    // escada fora de ordem compara cada degrau com o errado.
    const e = escadaDePlanos([COMPLETO, BASICO, ESSENCIAL]);
    expect(e.map((d) => d.plano.nome)).toEqual(['Básico', 'Essencial', 'Completo']);
    expect(e[1].herdaDe).toBe('Básico');
  });
});

describe('quando a frase deixaria de ser verdade', () => {
  it('o plano caro sem uma coisa que o barato tem mostra a lista toda', () => {
    // Uma caixa por marcar no painel e já está. Aqui o Essencial não tem
    // DRIVERS: dizer «tudo o do Básico, mais…» era mentira numa página de
    // preços, e só se descobria depois de pagar.
    const furado = plano('Essencial', '27.99', 'DASHBOARD', 'OFICINA');
    const e = escadaDePlanos([BASICO, furado]);

    expect(e[1].herdaDe).toBe(null);
    expect(e[1].mostrar.map((x) => x.codigo)).toEqual(['DASHBOARD', 'OFICINA']);
  });

  it('dois planos com a mesma lista não dizem «mais nada»', () => {
    const igual = plano('Essencial', '27.99', 'DASHBOARD', 'DRIVERS');
    const e = escadaDePlanos([BASICO, igual]);

    expect(e[1].herdaDe).toBe(null);
    expect(e[1].mostrar).toHaveLength(2);
  });
});

describe('os casos das pontas', () => {
  it('sem planos, sem degraus', () => {
    expect(escadaDePlanos([])).toEqual([]);
  });

  it('um plano só mostra a lista dele', () => {
    const e = escadaDePlanos([BASICO]);
    expect(e).toHaveLength(1);
    expect(e[0].herdaDe).toBe(null);
  });

  it('um preço que não é número vai para o fim e não para a frente', () => {
    // Se fosse para a frente, passava a ser o degrau de base e toda a escada
    // acima dele era comparada com o plano errado.
    const estranho = plano('Sob consulta', 'a combinar', 'DASHBOARD');
    const e = escadaDePlanos([estranho, BASICO, ESSENCIAL]);
    expect(e.map((d) => d.plano.nome)).toEqual(['Básico', 'Essencial', 'Sob consulta']);
  });

  it('não mexe na lista que recebeu', () => {
    const entrada = [COMPLETO, BASICO];
    escadaDePlanos(entrada);
    expect(entrada.map((p) => p.nome)).toEqual(['Completo', 'Básico']);
  });
});
