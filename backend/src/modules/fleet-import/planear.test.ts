// src/modules/fleet-import/planear.test.ts
//
// De despesas por matrícula para rascunhos por motorista.
//
// As decisões difíceis estão todas aqui e nenhuma precisa de base de dados:
// de quem é este carro nesta semana, o que fazer quando mudou de mãos, e o que
// fazer com dinheiro que não se consegue atribuir a ninguém.
//
// A regra que atravessa o ficheiro inteiro: NADA desaparece em silêncio. Cada
// euro que não entra num rascunho tem de sair num aviso, porque o rascunho
// existe para passar por mão humana e essa mão precisa de saber onde olhar.

import { describe, it, expect } from 'vitest';
import { planear, type Atribuicao, type Veiculo } from './planear';
import type { Leitura } from './parsers/tipos';

const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);
const SEMANA = { inicio: dia('2026-10-12'), fim: dia('2026-10-18') };

/** Uma leitura que confere, com os valores indicados. */
function leitura(
  porMatricula: Record<string, number>,
  semMatricula = { total: 0, ocorrencias: 0 },
): Leitura {
  const linhas = Object.entries(porMatricula).map(([matricula, total]) => ({ matricula, total }));
  return {
    porMatricula: linhas,
    semMatricula,
    totalLido: linhas.reduce((s, l) => s + l.total, 0) + semMatricula.total,
    totalDeclarado: null,
    confere: true,
    avisos: [],
  };
}

const CARROS: Veiculo[] = [
  { id: 'v1', plate: 'BG-49-GP' },
  { id: 'v2', plate: 'BT-63-NU' },
];

/** O carro v1 com o motorista m1 desde sempre. */
const SEMPRE: Atribuicao[] = [
  { vehicleId: 'v1', userId: 'm1', inicio: dia('2026-01-01'), fim: null },
  { vehicleId: 'v2', userId: 'm2', inicio: dia('2026-01-01'), fim: null },
];

const base = {
  semana: SEMANA,
  viaVerde: null,
  prioFrota: null,
  prioElectric: null,
  veiculos: CARROS,
  atribuicoes: SEMPRE,
};

// ═══════════════════════════════════════════════════════════════════════════
describe('o caso normal', () => {
  it('junta as três fontes no rascunho do motorista certo', () => {
    const p = planear({
      ...base,
      viaVerde: leitura({ 'BG-49-GP': 33.39 }),
      prioFrota: leitura({ 'BG-49-GP': 99.91 }),
      prioElectric: leitura({ 'BT-63-NU': 45.20 }),
    });

    expect(p.rascunhos).toHaveLength(2);

    const gp = p.rascunhos.find((r) => r.plate === 'BG-49-GP')!;
    expect(gp.userId).toBe('m1');
    expect(gp.tollsAmount).toBe(33.39);
    expect(gp.fuelAmount).toBe(99.91);
    expect(gp.chargeAmount).toBe(0);

    const nu = p.rascunhos.find((r) => r.plate === 'BT-63-NU')!;
    expect(nu.userId).toBe('m2');
    expect(nu.chargeAmount).toBe(45.20);
    expect(nu.fuelAmount).toBe(0);
  });

  it('um carro sem despesas não gera rascunho, mas fica dito', () => {
    // Zero despesas não justifica criar um fecho a alguém que pode nem ter
    // trabalhado. Mas tem de se distinguir de um esquecimento.
    const p = planear({ ...base, viaVerde: leitura({ 'BG-49-GP': 10 }) });
    expect(p.rascunhos).toHaveLength(1);
    expect(p.avisos.join(' ')).toContain('BT-63-NU');
    expect(p.avisos.join(' ')).toContain('Sem despesas');
  });

  it('a matrícula em minúsculas casa na mesma', () => {
    const p = planear({ ...base, viaVerde: leitura({ 'bg-49-gp': 10 }) });
    expect(p.rascunhos[0]?.userId).toBe('m1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('uma leitura que não confere trava TUDO', () => {
  it('não importa metade', () => {
    // O caso perigoso: duas fontes boas e uma má. Deixar passar as boas dava
    // um rascunho com metade das despesas e ar de completo — e ninguém
    // repararia até o motorista reclamar.
    const má: Leitura = { ...leitura({ 'BG-49-GP': 1 }), confere: false, avisos: ['o PDF mudou'] };
    const p = planear({
      ...base,
      viaVerde: má,
      prioFrota: leitura({ 'BG-49-GP': 99.91 }),
    });
    expect(p.rascunhos).toHaveLength(0);
    expect(p.avisos.join(' ')).toContain('não foi importado nada');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('forçar: avançar apesar de uma leitura não conferir', () => {
  const má: Leitura = { ...leitura({ 'BG-49-GP': 1 }), confere: false, avisos: ['o PDF mudou'] };

  it('com forcar, importa o que as OUTRAS fontes trouxeram', () => {
    const p = planear({
      ...base, forcar: true,
      prioFrota: má,
      viaVerde: leitura({ 'BG-49-GP': 33.39 }),
    });
    expect(p.rascunhos).toHaveLength(1);
    expect(p.rascunhos[0].tollsAmount).toBe(33.39);
  });

  it('e DEIXA RASTO, em maiúsculas, de que foi forçado', () => {
    // Quem abrir este rascunho daqui a um mês tem de perceber que os números
    // não passaram pela conferência. Sem isto, um fecho forçado é
    // indistinguível de um normal.
    const p = planear({ ...base, forcar: true, prioFrota: má, viaVerde: leitura({ 'BG-49-GP': 1 }) });
    expect(p.avisos.join(' ')).toContain('FORÇADO');
    expect(p.avisos.join(' ')).toContain('Prio Frota');
  });

  it('a fonte que não confere ENTRA, com os valores que deu', () => {
    // Decisão do cliente: forçar é criar "com o que conseguiu ler", não
    // continuar sem a fonte. Faz sentido para o caso que motivou isto — uma
    // semana sem abastecimentos, em que o leitor diz "não encontrei nada" e o
    // valor certo é mesmo zero.
    //
    // O que torna isto aceitável não é o valor ser de confiança: é o aviso em
    // maiúsculas e a nota no fecho, que mandam conferir contra o portal.
    const p = planear({ ...base, forcar: true, prioFrota: má, viaVerde: leitura({ 'BG-49-GP': 33.39 }) });
    expect(p.rascunhos[0].fuelAmount).toBe(1);
  });

  it('sem forcar, continua a travar tudo', () => {
    const p = planear({ ...base, prioFrota: má, viaVerde: leitura({ 'BG-49-GP': 33.39 }) });
    expect(p.rascunhos).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('quando não se sabe de quem é', () => {
  it('matrícula que não existe na frota fica por atribuir, com o valor', () => {
    const p = planear({ ...base, prioFrota: leitura({ 'ZZ-99-ZZ': 40 }) });
    expect(p.rascunhos).toHaveLength(0);
    expect(p.porAtribuir).toBe(40);
    expect(p.avisos.join(' ')).toContain('ZZ-99-ZZ');
    expect(p.avisos.join(' ')).toContain('não existe na frota');
  });

  it('carro sem motorista atribuído na semana não inventa um', () => {
    const p = planear({
      ...base,
      atribuicoes: [{ vehicleId: 'v1', userId: 'm1', inicio: dia('2020-01-01'), fim: dia('2026-01-01') }],
      viaVerde: leitura({ 'BG-49-GP': 33.39 }),
    });
    expect(p.rascunhos).toHaveLength(0);
    expect(p.porAtribuir).toBe(33.39);
    expect(p.avisos.join(' ')).toContain('não esteve atribuída a ninguém');
  });

  it('movimentos sem matrícula somam ao que fica por atribuir', () => {
    // O cliente: "se não houver carro identificado, não faz mal, ele não conta
    // essa e soma as outras, mas convém avisar".
    const p = planear({
      ...base,
      viaVerde: leitura({ 'BG-49-GP': 33.39 }, { total: 12.40, ocorrencias: 1 }),
    });
    expect(p.rascunhos[0].tollsAmount).toBe(33.39);
    expect(p.porAtribuir).toBe(12.40);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('o carro que muda de motorista a meio da semana', () => {
  const partilhado: Atribuicao[] = [
    // m1 de 12 a 14 (3 dias), m3 de 15 a 18 (4 dias)
    { vehicleId: 'v1', userId: 'm1', inicio: dia('2026-01-01'), fim: dia('2026-10-14') },
    { vehicleId: 'v1', userId: 'm3', inicio: dia('2026-10-15'), fim: null },
  ];

  it('lança em quem teve o carro mais dias', () => {
    const p = planear({
      ...base, atribuicoes: partilhado, viaVerde: leitura({ 'BG-49-GP': 70 }),
    });
    expect(p.rascunhos).toHaveLength(1);
    expect(p.rascunhos[0].userId).toBe('m3'); // 4 dias contra 3
    expect(p.rascunhos[0].tollsAmount).toBe(70);
  });

  it('e AVISA, com o valor, para a pessoa ir confirmar', () => {
    // A regra do cliente: são casos raros, resolvem-se à mão, e é para isso
    // que o rascunho existe. O aviso é o que faz a mão saber onde olhar.
    const p = planear({
      ...base, atribuicoes: partilhado, viaVerde: leitura({ 'BG-49-GP': 70 }),
    });
    const texto = p.avisos.join(' ');
    expect(texto).toContain('mudou de motorista');
    expect(texto).toContain('70.00');
  });

  it('uma atribuição que acabou ANTES da semana não conta', () => {
    const p = planear({
      ...base,
      atribuicoes: [
        { vehicleId: 'v1', userId: 'antigo', inicio: dia('2026-01-01'), fim: dia('2026-10-11') },
        { vehicleId: 'v1', userId: 'm1', inicio: dia('2026-10-12'), fim: null },
      ],
      viaVerde: leitura({ 'BG-49-GP': 70 }),
    });
    expect(p.rascunhos[0].userId).toBe('m1');
    expect(p.avisos.join(' ')).not.toContain('mudou de motorista');
  });

  it('uma atribuição que só começa DEPOIS da semana não conta', () => {
    const p = planear({
      ...base,
      atribuicoes: [
        { vehicleId: 'v1', userId: 'm1', inicio: dia('2026-01-01'), fim: null },
        { vehicleId: 'v1', userId: 'futuro', inicio: dia('2026-10-19'), fim: null },
      ],
      viaVerde: leitura({ 'BG-49-GP': 70 }),
    });
    expect(p.rascunhos[0].userId).toBe('m1');
    expect(p.avisos.join(' ')).not.toContain('mudou de motorista');
  });

  it('um único dia de sobreposição já conta como mudança', () => {
    // A fronteira: quem entrou no último dia da semana tem 1 dia. Não pode
    // desaparecer — é precisamente o caso que o cliente disse ser manual.
    const p = planear({
      ...base,
      atribuicoes: [
        { vehicleId: 'v1', userId: 'm1', inicio: dia('2026-01-01'), fim: dia('2026-10-17') },
        { vehicleId: 'v1', userId: 'novo', inicio: dia('2026-10-18'), fim: null },
      ],
      viaVerde: leitura({ 'BG-49-GP': 70 }),
    });
    expect(p.rascunhos[0].userId).toBe('m1'); // 6 dias contra 1
    expect(p.avisos.join(' ')).toContain('mudou de motorista');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('os cêntimos', () => {
  it('somar três fontes não deixa resíduo de vírgula flutuante', () => {
    const p = planear({
      ...base,
      viaVerde: leitura({ 'BG-49-GP': 0.1 }),
      prioFrota: leitura({ 'BG-49-GP': 0.2 }),
    });
    // Guardados separados, não somados — mas o total por atribuir e os avisos
    // usam somas, e é aí que 0.1 + 0.2 = 0.30000000000000004 aparecia.
    expect(p.rascunhos[0].tollsAmount).toBe(0.1);
    expect(p.rascunhos[0].fuelAmount).toBe(0.2);
  });

  it('o que fica por atribuir soma ao cêntimo', () => {
    const p = planear({
      ...base,
      viaVerde: leitura({ 'ZZ-99-ZZ': 0.1 }),
      prioFrota: leitura({ 'ZZ-99-ZZ': 0.2 }),
    });
    expect(p.porAtribuir).toBe(0.3);
  });
});
