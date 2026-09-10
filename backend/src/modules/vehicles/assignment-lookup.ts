// src/modules/vehicles/assignment-lookup.ts
//
// A parte PURA da pergunta "quem teve este carro neste dia".
//
// Vive fora do service de propósito: o service toca na base e não se consegue
// testar sem Postgres de pé. Isto — formatos de matrícula, fronteiras de dia,
// regra de sobreposição — é exatamente onde os enganos acontecem, e aqui é
// tudo verificável com `npm test`, sem preparação nenhuma.

// ─── MATRÍCULAS ──────────────────────────────────────────────────────────────
//
// A matrícula é gravada tal como foi escrita no formulário do veículo: o
// `createVehicleSchema` só limita o comprimento, não normaliza. Portanto a base
// pode ter "AA-00-BB" num registo e "AA00BB" noutro, consoante quem o criou.
//
// Do outro lado, quem faz esta consulta está a copiar de um aviso de multa ou a
// escrever de cabeça, e escreve o que lhe sai: com traços, sem traços, em
// minúsculas.
//
// Em vez de adivinhar uma forma canónica, geramos as formas plausíveis e
// procuramos por todas de uma vez. É uma consulta só, sem SQL em bruto, e não
// obriga a migrar os dados que já lá estão.

/**
 * As variantes da mesma matrícula que podem estar gravadas.
 *
 * Ordem sem importância — a consulta usa `in`. O `Set` evita repetir quando o
 * que veio já coincide com uma das formas geradas.
 */
export function plateCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed === '') return [];

  const core = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const out = new Set<string>([trimmed, trimmed.toUpperCase()]);

  if (core !== '') {
    out.add(core);

    // Matrícula portuguesa: seis caracteres em três pares. Só nesse caso é que
    // reconstruir com traços faz sentido — noutros comprimentos seria inventar
    // um formato que ninguém usa.
    if (core.length === 6) {
      out.add(`${core.slice(0, 2)}-${core.slice(2, 4)}-${core.slice(4, 6)}`);
    }
  }

  return [...out];
}

// ─── A JANELA DE DATAS ───────────────────────────────────────────────────────

export interface DayWindow {
  from: Date;
  to: Date;
}

/**
 * Converte `YYYY-MM-DD` (um dia, ou um intervalo) na janela fechada
 * correspondente.
 *
 * O Diogo escreveu "filtro carro e datas", no plural, e a seguir "naquele dia".
 * Suportar as duas coisas custa um parâmetro opcional: sem `to`, a janela é o
 * próprio dia do `from`.
 *
 * ─── SOBRE O FUSO ──────────────────────────────────────────────────────────
 *
 * As fronteiras são construídas em UTC, que é como a aplicação guarda as datas
 * e como os testes correm (`TZ: 'UTC'` no vitest.config). Fica registado o
 * canto que isto tem: Portugal está em UTC+1 no verão, portanto uma multa
 * passada às 00:30 de dia 5 (hora local) está gravada como 23:30 de dia 4 em
 * UTC. Numa consulta por um dia só, isso pode devolver a atribuição errada na
 * fronteira da meia-noite.
 *
 * Não corrigimos aqui porque a correção certa depende de uma decisão que ainda
 * não foi tomada: se a data que a pessoa escreve é hora local ou UTC. A saída
 * prática, enquanto isso, é a que o plural já permite — em caso de dúvida,
 * consultar o intervalo do dia anterior ao seguinte e ver as duas atribuições.
 */
export function resolveWindow(from: string, to?: string | null): DayWindow {
  const end = to ?? from;

  return {
    from: new Date(`${from}T00:00:00.000Z`),
    to: new Date(`${end}T23:59:59.999Z`),
  };
}

// ─── A REGRA DE SOBREPOSIÇÃO ─────────────────────────────────────────────────

/**
 * Uma atribuição cruza a janela consultada?
 *
 * Espelha o `where` que o repositório manda para a base. Existe em duplicado de
 * propósito: a versão do Prisma não se testa sem Postgres, e esta regra é o
 * coração da funcionalidade — se estiver errada, a resposta aponta para a
 * pessoa errada num processo de multa ou de acidente.
 *
 * A atribuição é um intervalo `[startedAt, endedAt)` com `endedAt` a nulo
 * enquanto o carro não é devolvido. Cruza a janela quando começou antes de a
 * janela acabar E não acabou antes de a janela começar.
 *
 * O `>=` na fronteira do fim é escolha consciente: uma atribuição que terminou
 * exatamente à meia-noite do primeiro dia consultado aparece na mesma. Numa
 * investigação, mostrar um candidato a mais é recuperável; esconder o único que
 * interessava não é.
 */
export function overlapsWindow(
  assignment: { startedAt: Date; endedAt: Date | null },
  window: DayWindow,
): boolean {
  if (assignment.startedAt > window.to) return false;
  if (assignment.endedAt !== null && assignment.endedAt < window.from) return false;
  return true;
}
