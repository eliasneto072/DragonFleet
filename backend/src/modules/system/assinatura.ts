// src/modules/system/assinatura.ts
//
// As regras das assinaturas: até quando está paga, e o que acontece quando
// deixa de estar.
//
// ─── PORQUE É QUE ISTO ESTÁ FORA DO SERVIÇO ─────────────────────────────────
//
// Porque são contas de datas, e contas de datas erram em silêncio. Uma
// renovação que começa no dia errado dá uma frota com menos três dias do que
// pagou, ou com mais trinta de graça — e nenhum dos dois casos aparece num
// erro. Aqui testam-se em três linhas cada.
//
// ─── A REGRA DA RENOVAÇÃO ───────────────────────────────────────────────────
//
// Renovar NÃO é "mais trinta dias a partir de hoje". É mais trinta dias a
// partir de quando a assinatura acabava:
//
//   - Ainda dentro do prazo → soma-se ao fim que já tinha. Quem renova três
//     dias antes não perde esses três dias.
//   - Já fora do prazo      → conta a partir de hoje. Uma frota que esteve dois
//     meses parada não paga esses dois meses ao renovar.
//
// É a conta que qualquer pessoa faz de cabeça, e é a que não gera discussão
// quando alguém pergunta porque é que a data é aquela.

/** Um dia, sem horas, em UTC. As assinaturas contam-se em dias inteiros. */
export function soDia(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * "2026-10-09" → Date, ao dia. Devolve `null` se não for uma data.
 *
 * ─── UMA DATA QUE NÃO EXISTE É RECUSADA, E NÃO CORRIGIDA ────────────────────
 *
 * O `Date` do JavaScript aceita 29 de fevereiro num ano que não é bissexto e
 * devolve 1 de março sem se queixar. Numa assinatura isso é um dia a mais ou a
 * menos escrito em silêncio, e a conversa que se segue é sobre porque é que o
 * sistema mudou a data que alguém escreveu. Confere-se o que saiu contra o que
 * entrou: se não for o mesmo dia, não era uma data.
 */
export function doTexto(texto: string | null | undefined): Date | null {
  if (!texto) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return null;

  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (Number.isNaN(d.getTime())) return null;

  const mesmoDia = d.getUTCFullYear() === ano
    && d.getUTCMonth() === mes - 1
    && d.getUTCDate() === dia;
  return mesmoDia ? d : null;
}

/** Date → "2026-10-09". */
export const paraTexto = (d: Date): string => d.toISOString().slice(0, 10);

export type EstadoDaAssinatura = 'sem_assinatura' | 'activa' | 'termina_em_breve' | 'expirada';

/** A partir de quantos dias a contar para o fim se avisa. */
export const DIAS_DE_AVISO = 7;

export interface Situacao {
  estado: EstadoDaAssinatura;
  /** Dias até ao fim. Negativo quando já passou. Nulo sem assinatura. */
  dias: number | null;
}

/**
 * Em que pé está a assinatura de uma frota.
 *
 * `endsOn` nulo é "sem assinatura", e isso NÃO é o mesmo que expirada: é o
 * estado da frota do próprio dono, que não paga a ninguém. Tratá-los como a
 * mesma coisa trancava-o fora da casa dele.
 *
 * O último dia conta como pago. Uma assinatura que acaba hoje ainda vale hoje
 * — cobrar um dia a menos do que se vendeu é o género de detalhe que ninguém
 * discute, mas toda a gente nota.
 */
export function situacao(
  endsOn: Date | null | undefined,
  hoje: Date = new Date(),
): Situacao {
  if (!endsOn) return { estado: 'sem_assinatura', dias: null };

  const fim = soDia(endsOn);
  const dia = soDia(hoje);
  const dias = Math.round((fim.getTime() - dia.getTime()) / 86_400_000);

  if (dias < 0) return { estado: 'expirada', dias };
  if (dias <= DIAS_DE_AVISO) return { estado: 'termina_em_breve', dias };
  return { estado: 'activa', dias };
}

/** Pode entrar e trabalhar? Sem assinatura também pode — ver `situacao`. */
export function podeTrabalhar(endsOn: Date | null | undefined, hoje = new Date()): boolean {
  return situacao(endsOn, hoje).estado !== 'expirada';
}

/**
 * A data nova, ao renovar por `dias`.
 *
 * Ver a regra no topo: soma-se ao fim que havia quando ainda está dentro do
 * prazo, e a hoje quando já passou.
 */
export function renovar(
  endsOn: Date | null | undefined,
  dias: number,
  hoje: Date = new Date(),
): Date {
  if (!Number.isFinite(dias) || dias <= 0) {
    throw new Error('[assinatura] a duração tem de ser pelo menos um dia');
  }

  const dia = soDia(hoje);
  const base = endsOn && soDia(endsOn) >= dia ? soDia(endsOn) : dia;

  const nova = new Date(base);
  nova.setUTCDate(nova.getUTCDate() + Math.floor(dias));
  return nova;
}

/** As durações que o painel sugere. À medida escreve-se o número. */
export const DURACOES = [
  { dias: 30, nome: 'Mensal' },
  { dias: 90, nome: 'Trimestral' },
  { dias: 180, nome: 'Semestral' },
  { dias: 365, nome: 'Anual' },
] as const;
