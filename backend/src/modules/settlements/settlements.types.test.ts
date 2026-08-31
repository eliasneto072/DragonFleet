// src/modules/settlements/settlements.types.test.ts
//
// Testes da fórmula do fecho semanal.
//
// ─── POR QUE ESTE FICHEIRO É O PRIMEIRO DO PROJETO ───────────────────────────
//
// É a conta que decide quanto cada motorista recebe. Se partir, ninguém dá por
// isso até alguém reclamar do valor — e nessa altura já foram pagos fechos
// errados que os valores congelados não deixam recalcular.
//
// É também função pura: entra um objeto, sai outro. Sem base de dados, sem
// rede, sem relógio. Corre em milissegundos e nunca falha por razões que não
// sejam o código estar errado. Testes assim são os que se escrevem primeiro e
// os que mais rendem.
//
// ─── COMO LER ESTE FICHEIRO ──────────────────────────────────────────────────
//
// Cada `it` tem o nome de uma REGRA DE NEGÓCIO escrita por extenso, não de uma
// função. "recusa cobrar comissao sobre uma semana em prejuizo" diz o que o
// sistema promete; "testa computeTotals com valores negativos" diria apenas o
// que o código faz. Quando um teste falha, o nome dele deve chegar para saber
// o que se partiu, sem abrir o ficheiro.
//
// Cada teste segue Arranjar → Agir → Verificar: preparar os dados, chamar uma
// vez, afirmar. Sem ciclos, sem condições — um teste com um `if` dentro pode
// passar sem ter verificado nada.

import { describe, it, expect } from 'vitest';
import { computeTotals } from './settlements.types';

/**
 * Construtor de semanas.
 *
 * Cada teste declara SÓ o que lhe importa e o resto vem daqui. Sem isto, um
 * teste sobre o imposto teria de indicar portagens, combustível e viatura que
 * não têm nada a ver com o que está a ser verificado — e quem o lesse a seguir
 * teria de descobrir sozinho quais daqueles números eram relevantes.
 *
 * Quando a fórmula ganhar um campo novo, muda-se aqui e não em vinte testes.
 */
function semana(overrides: Partial<Parameters<typeof computeTotals>[0]> = {}) {
  return computeTotals({
    uberAmount: 0,
    boltAmount: 0,
    otherRevenue: 0,
    tollsAmount: 0,
    fuelAmount: 0,
    vehicleFee: 0,
    otherDeductions: 0,
    commissionRate: 15,
    taxRate: 6,
    ...overrides,
  });
}

describe('computeTotals — receitas e despesas', () => {
  it('soma as tres origens de receita no bruto', () => {
    const r = semana({ uberAmount: 500, boltAmount: 400, otherRevenue: 100 });
    expect(r.grossRevenue).toBe(1000);
  });

  it('soma as quatro despesas operacionais, mais o imposto', () => {
    const r = semana({
      uberAmount: 1000,
      tollsAmount: 40, fuelAmount: 100, vehicleFee: 200, otherDeductions: 60,
    });
    // 400 de despesas reais + 60 de imposto sobre os 1000 da Uber
    expect(r.operatingCosts).toBe(460);
  });

  it('o lucro e o bruto menos as despesas', () => {
    const r = semana({ uberAmount: 1000, fuelAmount: 200, taxRate: 0 });
    expect(r.profitBase).toBe(800);
  });
});

describe('computeTotals — comissao da empresa', () => {
  it('incide sobre o lucro e nao sobre o bruto', () => {
    const r = semana({ uberAmount: 1000, fuelAmount: 200, taxRate: 0, commissionRate: 15 });
    // 15% de 800 de lucro, e nao de 1000 de bruto (que dariam 150)
    expect(r.commissionAmount).toBe(120);
  });

  it('recusa cobrar comissao sobre uma semana em prejuizo', () => {
    const r = semana({ uberAmount: 300, fuelAmount: 500, taxRate: 0 });

    expect(r.profitBase).toBeLessThan(0);
    expect(r.commissionAmount).toBe(0);
  });

  it('deixa o liquido negativo quando a semana da prejuizo', () => {
    // Não é um erro a corrigir: a despesa foi real e alguém a pagou. O saldo do
    // motorista pode ficar abaixo de zero e é assim que deve ser.
    const r = semana({ uberAmount: 300, fuelAmount: 500, taxRate: 0 });
    expect(r.netToDriver).toBe(-200);
  });

  it('nao cobra comissao quando o lucro e exatamente zero', () => {
    // A fronteira. A condição no código é `profitBase > 0`, e um `>=` distraído
    // passaria neste caso sem ninguém reparar, porque 0 × 15% também é 0 — mas
    // partiria a regra assim que alguém mudasse a ordem das operações.
    const r = semana({ uberAmount: 500, fuelAmount: 500, taxRate: 0 });

    expect(r.profitBase).toBe(0);
    expect(r.commissionAmount).toBe(0);
  });
});

describe('computeTotals — imposto sobre a faturacao', () => {
  it('cobra a taxa sobre a soma da Uber e da Bolt', () => {
    // O exemplo textual do cliente: "Motorista fez 500€ Uber e 500€ Bolt esse
    // campo vai registar 60€ de imposto que equivale aos 6%".
    const r = semana({ uberAmount: 500, boltAmount: 500, taxRate: 6 });

    expect(r.taxBase).toBe(1000);
    expect(r.taxAmount).toBe(60);
  });

  it('deixa as outras receitas FORA da base do imposto', () => {
    // A regra mais fácil de partir por distração: quem escrever a fórmula com
    // `grossRevenue` em vez de `uber + bolt` tributa receita que o cliente não
    // mandou tributar, e a diferença sai do bolso do motorista.
    const r = semana({ uberAmount: 500, boltAmount: 500, otherRevenue: 300, taxRate: 6 });

    expect(r.grossRevenue).toBe(1300);
    expect(r.taxBase).toBe(1000);
    expect(r.taxAmount).toBe(60);
  });

  it('desconta o imposto ANTES de calcular a comissao', () => {
    // Onde o imposto entra na fórmula muda quem o paga. Dentro das despesas, a
    // comissão incide sobre o lucro já líquido de imposto — e a empresa
    // partilha o encargo. Depois da comissão, o motorista pagava-o sozinho.
    const r = semana({
      uberAmount: 500, boltAmount: 500,
      tollsAmount: 80, fuelAmount: 120,
      commissionRate: 15, taxRate: 6,
    });

    expect(r.operatingCosts).toBe(260);   // 200 de despesas + 60 de imposto
    expect(r.profitBase).toBe(740);
    expect(r.commissionAmount).toBe(111); // 15% de 740, e nao de 800
    expect(r.netToDriver).toBe(629);
  });

  it('pode empurrar para prejuizo uma semana que dava lucro sem ele', () => {
    // Consequência real da decisão acima, e a que o cliente vai notar primeiro.
    const amounts = {
      uberAmount: 500, boltAmount: 500,
      tollsAmount: 300, fuelAmount: 260, vehicleFee: 400,
    };
    const sem = semana({ ...amounts, taxRate: 0 });
    const com = semana({ ...amounts, taxRate: 6 });

    expect(sem.profitBase).toBe(40);
    expect(sem.commissionAmount).toBe(6);

    expect(com.profitBase).toBe(-20);
    expect(com.commissionAmount).toBe(0);
  });

  it('com a taxa a zero devolve exatamente a conta anterior ao imposto', () => {
    // Teste de nao-regressao: garante que a funcionalidade nova nao mudou o
    // comportamento de quem nao a usa.
    const r = semana({
      uberAmount: 500, boltAmount: 500,
      tollsAmount: 80, fuelAmount: 120,
      commissionRate: 15, taxRate: 0,
    });

    expect(r.taxAmount).toBe(0);
    expect(r.operatingCosts).toBe(200);
    expect(r.netToDriver).toBe(680);
  });
});

describe('computeTotals — arredondamento', () => {
  it('arredonda a duas casas sem residuo de virgula flutuante', () => {
    // Em JavaScript, 0.1 + 0.2 dá 0.30000000000000004. Numa conta de dinheiro
    // isso acaba num cêntimo a mais ou a menos que ninguém consegue explicar.
    const r = semana({ uberAmount: 333.33, boltAmount: 111.11, taxRate: 6 });

    expect(r.taxBase).toBe(444.44);
    expect(r.taxAmount).toBe(26.67);
    // Se houvesse resíduo, multiplicar por 100 não daria um inteiro.
    expect(Number.isInteger(r.taxAmount * 100)).toBe(true);
  });

  it('mantem o total de deducoes coerente com as parcelas', () => {
    const r = semana({
      uberAmount: 733.33, boltAmount: 211.11,
      tollsAmount: 41.37, fuelAmount: 99.99,
      commissionRate: 15, taxRate: 6,
    });

    // A relação que tem de valer sempre: o que o motorista recebe é o bruto
    // menos tudo o que lhe foi descontado. Se esta falhar, há dinheiro a
    // aparecer ou a desaparecer da conta.
    expect(r.netToDriver).toBeCloseTo(r.grossRevenue - r.totalDeductions, 2);
    expect(r.totalDeductions).toBeCloseTo(r.operatingCosts + r.commissionAmount, 2);
  });
});

describe('computeTotals — campos omitidos', () => {
  it('trata os valores em falta como zero', () => {
    // A pré-visualização chama isto com um formulário meio preenchido. Se um
    // campo por preencher desse NaN, o resumo mostrava "NaN €" ao administrador.
    const r = computeTotals({ commissionRate: 15, taxRate: 6 });

    expect(r.grossRevenue).toBe(0);
    expect(r.taxAmount).toBe(0);
    expect(r.netToDriver).toBe(0);
    expect(Number.isNaN(r.netToDriver)).toBe(false);
  });
});
