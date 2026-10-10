// src/modules/system/capacidade.test.ts
//
// Esta é a regra que tranca pessoas fora do trabalho delas. Um erro aqui não
// dá erro nenhum: dá um cliente que pagou e não consegue registar o fecho da
// semana, ou um que não pagou e continua a usar tudo.

import { describe, it, expect } from 'vitest';
import {
  capacidadeDaFrota, podeEscrever, temFuncionalidade, metodoSoLe,
} from './capacidade';
import { FUNCIONALIDADES } from './funcionalidades';

const HOJE = new Date('2026-10-10T15:30:00.000Z');
const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('sem plano é tudo, e não nada', () => {
  it('a frota da casa — sem plano e sem assinatura — tem tudo e escreve', () => {
    // "Sem plano = nada" trancava o dono fora do próprio sistema.
    const c = capacidadeDaFrota({ features: null, subscriptionEndsOn: null }, HOJE);
    expect(c.funcionalidades.length).toBe(FUNCIONALIDADES.length);
    expect(c.podeEscrever).toBe(true);
    expect(c.assinatura.estado).toBe('sem_assinatura');
  });

  it('uma lista de funcionalidades vazia conta como sem plano', () => {
    // Um plano gravado sem nada marcado não deve dar um painel vazio ao
    // cliente: dá tudo, e quem o configurou que corrija o plano.
    const c = capacidadeDaFrota({ features: [], subscriptionEndsOn: null }, HOJE);
    expect(c.funcionalidades.length).toBe(FUNCIONALIDADES.length);
  });
});

describe('o plano decide os menus', () => {
  it('só o que está no plano, mais o painel que vai sempre', () => {
    const c = capacidadeDaFrota({ features: ['OFICINA', 'MATERIAL'] }, HOJE);
    expect(c.funcionalidades).toEqual(['DASHBOARD', 'OFICINA', 'MATERIAL']);
    expect(temFuncionalidade(c, 'OFICINA')).toBe(true);
    expect(temFuncionalidade(c, 'SETTLEMENTS')).toBe(false);
  });

  it('a oficina abre a área da frota, porque é lá que a rota vive', () => {
    const c = capacidadeDaFrota({ features: ['OFICINA'] }, HOJE);
    expect(c.areas).toContain('FLEET');
    expect(c.areas).not.toContain('SETTLEMENTS');
  });

  it('um código que já não existe no catálogo é ignorado', () => {
    const c = capacidadeDaFrota({ features: ['OFICINA', 'COISA_VELHA'] }, HOJE);
    expect(c.funcionalidades).toEqual(['DASHBOARD', 'OFICINA']);
  });
});

describe('a assinatura decide a escrita, e nada mais', () => {
  it('em dia, escreve', () => {
    expect(podeEscrever(dia('2026-11-01'), HOJE)).toBe(true);
  });

  it('a acabar hoje, ainda escreve — o último dia é dela', () => {
    expect(podeEscrever(dia('2026-10-10'), HOJE)).toBe(true);
  });

  it('expirada ontem, já não escreve', () => {
    expect(podeEscrever(dia('2026-10-09'), HOJE)).toBe(false);
  });

  it('sem assinatura, escreve — é o caso da casa', () => {
    expect(podeEscrever(null, HOJE)).toBe(true);
  });

  it('expirada NÃO tira menus nenhuns', () => {
    // Os dados são do cliente. O que pára é o trabalho novo; o que ele já lá
    // tem continua a abrir, senão é a contabilidade de alguém como refém.
    const c = capacidadeDaFrota(
      { features: ['OFICINA', 'SETTLEMENTS'], subscriptionEndsOn: dia('2026-01-01') },
      HOJE,
    );
    expect(c.podeEscrever).toBe(false);
    // A ordem é a do catálogo (Operação antes de Dinheiro), e não a de quem
    // escreveu o plano — ver `normalizarFuncionalidades`.
    expect(c.funcionalidades).toEqual(['DASHBOARD', 'OFICINA', 'SETTLEMENTS']);
    expect(c.areas).toContain('SETTLEMENTS');
  });

  it('as duas perguntas não se misturam', () => {
    // Plano mínimo com assinatura boa: mexe no pouco que comprou.
    const pobreEmDia = capacidadeDaFrota(
      { features: ['OFICINA'], subscriptionEndsOn: dia('2026-12-01') }, HOJE,
    );
    expect(pobreEmDia.podeEscrever).toBe(true);
    expect(pobreEmDia.funcionalidades.length).toBe(2);

    // Plano completo com assinatura má: vê tudo, não mexe em nada.
    const ricoExpirado = capacidadeDaFrota(
      { features: FUNCIONALIDADES.map((f) => f.codigo), subscriptionEndsOn: dia('2026-01-01') },
      HOJE,
    );
    expect(ricoExpirado.podeEscrever).toBe(false);
    expect(ricoExpirado.funcionalidades.length).toBe(FUNCIONALIDADES.length);
  });
});

describe('metodoSoLe', () => {
  it('conhece os que leem', () => {
    expect(metodoSoLe('GET')).toBe(true);
    expect(metodoSoLe('get')).toBe(true);
    expect(metodoSoLe('HEAD')).toBe(true);
    expect(metodoSoLe('OPTIONS')).toBe(true);
  });

  it('tudo o resto é trabalho novo', () => {
    // Lista branca: um método que ninguém se lembrou de classificar fica do
    // lado seguro.
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'QUALQUERCOISA']) {
      expect(metodoSoLe(m)).toBe(false);
    }
  });
});
