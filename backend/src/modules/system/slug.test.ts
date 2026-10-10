// src/modules/system/slug.test.ts

import { describe, it, expect } from 'vitest';
import { slugificar, slugLivre, MAXIMO } from './slug';

describe('slugificar', () => {
  it('o caso normal', () => {
    expect(slugificar('Chromatic Dragon')).toBe('chromatic-dragon');
  });

  it('tira os acentos e deixa a letra', () => {
    // Sem isto, "São" dava "s-o", que não é o nome de nada.
    expect(slugificar('São João Transportes')).toBe('sao-joao-transportes');
    expect(slugificar('Açores Mobilidade')).toBe('acores-mobilidade');
  });

  it('a pontuação e os símbolos passam a um hífen só', () => {
    expect(slugificar('Silva & Filhos, Lda.')).toBe('silva-filhos-lda');
    expect(slugificar('A---B')).toBe('a-b');
  });

  it('não começa nem acaba em hífen', () => {
    expect(slugificar('  Transportes!  ')).toBe('transportes');
    expect(slugificar('...TVDE...')).toBe('tvde');
  });

  it('corta no máximo e não deixa hífen pendurado', () => {
    const longo = slugificar('a'.repeat(80));
    expect(longo.length).toBe(MAXIMO);
    expect(longo.endsWith('-')).toBe(false);
  });

  it('um nome sem nada de utilizável dá vazio, e não um nome inventado', () => {
    // Quem chama decide o que fazer com isto. Inventar aqui escondia o caso.
    expect(slugificar('!!!')).toBe('');
    expect(slugificar('   ')).toBe('');
  });
});

describe('slugLivre', () => {
  const comOcupados = (ocupados: string[]) =>
    async (s: string) => ocupados.includes(s);

  it('livre à primeira, fica sem número', () => {
    return slugLivre('Transportes Silva', comOcupados([]))
      .then((r) => expect(r).toBe('transportes-silva'));
  });

  it('ocupado, começa no 2 — o primeiro é que não leva número', () => {
    return slugLivre('Transportes Silva', comOcupados(['transportes-silva']))
      .then((r) => expect(r).toBe('transportes-silva-2'));
  });

  it('salta os que já existem', () => {
    return slugLivre('Silva', comOcupados(['silva', 'silva-2', 'silva-3']))
      .then((r) => expect(r).toBe('silva-4'));
  });

  it('o sufixo cabe no máximo', () => {
    // Cortar a raiz é melhor do que passar o limite e ser recusado pela base.
    const raiz = 'b'.repeat(MAXIMO);
    return slugLivre(raiz, comOcupados([slugificar(raiz)]))
      .then((r) => {
        expect(r.length).toBeLessThan(MAXIMO + 1);
        expect(r.endsWith('-2')).toBe(true);
      });
  });

  it('um nome que não dá slug nenhum atira em vez de gravar vazio', () => {
    // Um slug vazio é único uma vez e colide para sempre a seguir.
    return slugLivre('!!!', comOcupados([])).then(
      () => { throw new Error('devia ter atirado'); },
      (e) => expect(String(e)).toContain('não sobrou nada'),
    );
  });

  it('desiste ao fim de cem em vez de ficar preso', () => {
    // Um ciclo sem fim num pedido web não dá erro: dá um pedido que nunca
    // responde.
    const sempreOcupado = async () => true;
    return slugLivre('silva', sempreOcupado).then(
      () => { throw new Error('devia ter atirado'); },
      (e) => expect(String(e)).toContain('resolva este à mão'),
    );
  });
});
