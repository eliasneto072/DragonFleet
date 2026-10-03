// src/modules/fleet-import/planear.ts
//
// De despesas por MATRÍCULA para rascunhos por MOTORISTA.
//
// ─── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
//
// Os três portais respondem sempre à mesma pergunta: quanto gastou cada carro.
// Nenhum deles sabe quem o conduzia. Mas o fecho semanal é de uma PESSOA, e é
// a ela que a despesa vai ser lançada.
//
// Entre uma coisa e outra está o histórico de atribuições — que carro esteve
// com quem, e quando.
//
// ─── FUNÇÃO PURA, DE PROPÓSITO ──────────────────────────────────────────────
//
// Isto não toca na base de dados. Recebe listas e devolve um plano. É o que
// permite testá-lo a sério: as decisões difíceis aqui são "de quem é este
// carro nesta semana" e "o que fazer quando mudou de mãos a meio", e nenhuma
// delas precisa de Postgres para estar certa ou errada.
//
// Quem grava recebe este plano já decidido.
//
// ─── NADA É CRIADO EM SILÊNCIO ──────────────────────────────────────────────
//
// Tudo o que não encaixa perfeitamente sai em `avisos`, com o valor ao lado.
// O cliente foi explícito sobre isto: os rascunhos existem precisamente para
// passarem por mão humana antes de creditar, e um aviso é a única maneira de
// essa mão saber onde olhar.

import { cent } from './parsers/numeros';
import type { Leitura } from './parsers/tipos';

export interface Veiculo {
  id: string;
  plate: string;
}

/** Um período em que um carro esteve com alguém. `fim` nulo = ainda está. */
export interface Atribuicao {
  vehicleId: string;
  userId: string | null;
  inicio: Date;
  fim: Date | null;
}

export interface RascunhoPlaneado {
  userId: string;
  vehicleId: string;
  plate: string;
  tollsAmount: number;
  fuelAmount: number;
  chargeAmount: number;
}

export interface Plano {
  rascunhos: RascunhoPlaneado[];
  avisos: string[];
  /** Soma de tudo o que foi lido mas não entrou em rascunho nenhum. */
  porAtribuir: number;
}

/** Sobreposição entre [aInicio, aFim] e [bInicio, bFim], em dias inteiros. */
function diasEmComum(aInicio: Date, aFim: Date, bInicio: Date, bFim: Date | null): number {
  const fimB = bFim ?? new Date(8640000000000000);
  const inicio = Math.max(aInicio.getTime(), bInicio.getTime());
  const fim = Math.min(aFim.getTime(), fimB.getTime());
  if (fim < inicio) return 0;
  return Math.floor((fim - inicio) / 86400000) + 1;
}

/** Matrícula → total, a partir de uma leitura. */
function mapa(leitura: Leitura | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of leitura?.porMatricula ?? []) m.set(p.matricula.toUpperCase(), p.total);
  return m;
}

export function planear(entrada: {
  semana: { inicio: Date; fim: Date };
  viaVerde: Leitura | null;
  prioFrota: Leitura | null;
  prioElectric: Leitura | null;
  veiculos: Veiculo[];
  atribuicoes: Atribuicao[];
  /**
   * Avançar mesmo com uma leitura que não confere.
   *
   * Existe porque a recusa, sozinha, é um beco: um relatório legitimamente
   * vazio — uma semana sem abastecimentos — é indistinguível de um ficheiro
   * mal lido, e travava o fecho inteiro sem saída possível.
   *
   * NÃO é o caminho normal, e o aviso que sai daqui diz isso em voz alta. Quem
   * o liga está a afirmar que olhou para os números e os aceita.
   */
  forcar?: boolean;
}): Plano {
  const { semana, veiculos, atribuicoes } = entrada;
  const avisos: string[] = [];

  // Uma leitura que não confere não entra — nem em parte. Deixar passar as
  // outras duas daria um rascunho com metade das despesas e ar de completo.
  for (const [nome, l] of [
    ['Via Verde', entrada.viaVerde],
    ['Prio Frota', entrada.prioFrota],
    ['Prio Electric', entrada.prioElectric],
  ] as const) {
    if (l && !l.confere) {
      if (!entrada.forcar) {
        return {
          rascunhos: [],
          porAtribuir: 0,
          avisos: [`A leitura da ${nome} não confere — não foi importado nada.`, ...l.avisos],
        };
      }
      avisos.push(
        `FORÇADO: a leitura da ${nome} NÃO confere e foi importada à mesma. `
        + 'Confira estes valores contra o portal antes de creditar.',
        ...l.avisos,
      );
      continue;
    }
    if (l) avisos.push(...l.avisos);
  }

  const tolls = mapa(entrada.viaVerde);
  const fuel = mapa(entrada.prioFrota);
  const charge = mapa(entrada.prioElectric);

  const porMatricula = new Map(veiculos.map((v) => [v.plate.toUpperCase(), v]));
  const matriculas = new Set([...tolls.keys(), ...fuel.keys(), ...charge.keys()]);

  const rascunhos: RascunhoPlaneado[] = [];
  let porAtribuir = 0;

  for (const matricula of [...matriculas].sort()) {
    const t = tolls.get(matricula) ?? 0;
    const f = fuel.get(matricula) ?? 0;
    const c = charge.get(matricula) ?? 0;
    const total = cent(t + f + c);

    const veiculo = porMatricula.get(matricula);
    if (!veiculo) {
      porAtribuir = cent(porAtribuir + total);
      avisos.push(
        `A matrícula ${matricula} gastou ${total.toFixed(2)} € mas não existe na frota. `
        + 'Registe o veículo ou confirme a matrícula.',
      );
      continue;
    }

    // Quem teve o carro nesta semana, e por quantos dias.
    const daSemana = atribuicoes
      .filter((a) => a.vehicleId === veiculo.id && a.userId)
      .map((a) => ({ userId: a.userId as string, dias: diasEmComum(semana.inicio, semana.fim, a.inicio, a.fim) }))
      .filter((a) => a.dias > 0)
      .sort((a, b) => b.dias - a.dias);

    if (daSemana.length === 0) {
      porAtribuir = cent(porAtribuir + total);
      avisos.push(
        `${matricula} gastou ${total.toFixed(2)} € mas não esteve atribuída a ninguém nesta semana. `
        + 'Lance à mão em quem a conduziu.',
      );
      continue;
    }

    // Mudou de mãos a meio: vai para quem a teve MAIS dias, e diz-se. O
    // cliente pediu exatamente isto — "se for só 1 dia, tem de ser manual,
    // são raros esses casos" — e é para isso que o rascunho existe.
    if (daSemana.length > 1) {
      const outros = daSemana.slice(1).map((a) => `${a.dias} dia(s)`).join(', ');
      avisos.push(
        `${matricula} mudou de motorista nesta semana (${daSemana[0].dias} dia(s) para um, `
        + `${outros} para outro). Lancei os ${total.toFixed(2)} € em quem a teve mais dias — confirme antes de creditar.`,
      );
    }

    rascunhos.push({
      userId: daSemana[0].userId,
      vehicleId: veiculo.id,
      plate: veiculo.plate,
      tollsAmount: t,
      fuelAmount: f,
      chargeAmount: c,
    });
  }

  // O que os leitores viram mas não conseguiram atribuir a matrícula nenhuma.
  for (const [nome, l] of [
    ['Via Verde', entrada.viaVerde],
    ['Prio Frota', entrada.prioFrota],
    ['Prio Electric', entrada.prioElectric],
  ] as const) {
    if (l && l.semMatricula.ocorrencias > 0) {
      porAtribuir = cent(porAtribuir + l.semMatricula.total);
      void nome;
    }
  }

  // Carros da frota que não gastaram nada. NÃO é um erro — mas também não é
  // um rascunho: zero despesas não justifica criar um fecho para alguém que
  // pode nem ter trabalhado. Fica dito, para se distinguir de um esquecimento.
  const semDespesa = veiculos
    .filter((v) => !matriculas.has(v.plate.toUpperCase()))
    .map((v) => v.plate);
  if (semDespesa.length > 0) {
    avisos.push(
      `Sem despesas nesta semana: ${semDespesa.join(', ')}. `
      + 'Se esperava movimentos, confirme o período que exportou.',
    );
  }

  return { rascunhos, avisos, porAtribuir };
}
