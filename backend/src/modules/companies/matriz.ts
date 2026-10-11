// src/modules/companies/matriz.ts
//
// Quanto é que cada motorista passou a cada sociedade.
//
// ─── PORQUE É QUE ISTO ESTÁ FORA DO SERVIÇO ─────────────────────────────────
//
// Porque são somas de dinheiro que vão para a contabilidade, e uma soma errada
// aqui não dá erro nenhum: dá um número que parece certo. Um cêntimo a menos
// numa linha é invisível; a mesma falha repetida num ano são euros que não
// batem com o extrato, e ninguém sabe onde se perderam.
//
// ─── AS CONTAS SÃO EM CÊNTIMOS INTEIROS ─────────────────────────────────────
//
// Nunca em vírgula flutuante. `0.1 + 0.2` em JavaScript dá 0.30000000000000004,
// e somar centenas de recibos assim acumula erro — poucos cêntimos ao fim de um
// trimestre, sem explicação nenhuma. Os valores chegam da base como texto
// decimal exacto ("1000.00"), passam a inteiros, somam-se como inteiros, e só
// voltam a euros no fim.
//
// ─── AS QUATRO NATUREZAS DE UMA COLUNA ──────────────────────────────────────
//
// Uma retirada aponta para uma sociedade da lista, OU para um nome escrito à
// mão, OU para nenhuma, OU ainda não foi classificada. As quatro são
// diferentes e as quatro têm de aparecer:
//
//   - `sociedade`      — uma da lista. A maioria.
//   - `outra`          — nome escrito à mão. Pode ser uma sociedade a sério
//                        que ainda não está na lista, e esconder isso fazia o
//                        total do motorista não bater com o que ele recebeu.
//   - `nenhum`         — decidiu-se que não leva sociedade. É uma decisão.
//   - `porClassificar` — ninguém decidiu ainda. NÃO é o mesmo que "nenhum", e
//                        juntá-las escondia trabalho por fazer dentro de um
//                        número que parecia arrumado.

/** Uma linha como vem da base: um motorista, uma sociedade, uma soma. */
export interface LinhaCrua {
  userId: string;
  userName: string;
  /** Id da sociedade da lista. `null` nas outras três naturezas. */
  companyId: string | null;
  /** Nome escrito à mão. `null` quando não é esse o caso. */
  companyOther: string | null;
  /** Já foi classificada por alguém? `false` = por classificar. */
  classificado: boolean;
  /** A soma, em texto decimal exacto como a base a devolve: "1000.00". */
  total: string;
}

export type TipoDeColuna = 'sociedade' | 'outra' | 'nenhum' | 'porClassificar';

export interface Coluna {
  /** Identificador estável da coluna. É a chave em `valores`. */
  chave: string;
  nome: string;
  tipo: TipoDeColuna;
}

export interface LinhaDaMatriz {
  userId: string;
  nome: string;
  /** Em euros, por chave de coluna. Só as colunas com valor. */
  valores: Record<string, number>;
  total: number;
}

export interface Matriz {
  colunas: Coluna[];
  linhas: LinhaDaMatriz[];
  /** O total de cada coluna, por chave. */
  totaisPorColuna: Record<string, number>;
  /** O total de tudo. Igual à soma das linhas E à soma das colunas. */
  total: number;
}

export const CHAVE_NENHUM = '__nenhum__';
export const CHAVE_POR_CLASSIFICAR = '__por_classificar__';
/** As colunas de texto livre levam este prefixo, para não colidir com ids. */
export const PREFIXO_OUTRA = 'outra:';

/**
 * "1000.00" → 100000 cêntimos.
 *
 * Trunca para duas casas em vez de arredondar: os valores vêm de uma coluna
 * `Decimal(12,2)`, que já só tem duas casas. Se um dia vier mais, truncar é a
 * resposta conservadora — não inventa um cêntimo que não está na base.
 */
export function paraCentimos(texto: string): number {
  const limpo = String(texto).trim();
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return 0;

  const negativo = limpo.startsWith('-');
  const [inteira, decimal = ''] = limpo.replace('-', '').split('.');
  const centimos = Number(inteira) * 100 + Number((decimal + '00').slice(0, 2));
  return negativo ? -centimos : centimos;
}

/** 100000 cêntimos → 1000. */
export function paraEuros(centimos: number): number {
  return centimos / 100;
}

/** A que coluna pertence uma linha crua. */
export function chaveDaLinha(l: LinhaCrua): { chave: string; nome: string; tipo: TipoDeColuna } {
  if (l.companyId) {
    return { chave: l.companyId, nome: '', tipo: 'sociedade' };
  }
  const texto = l.companyOther?.trim();
  if (texto) {
    // A chave é em minúsculas para "Empresa A" e "empresa a" não darem duas
    // colunas; o nome mostrado é o que estiver escrito.
    return { chave: PREFIXO_OUTRA + texto.toLowerCase(), nome: texto, tipo: 'outra' };
  }
  return l.classificado
    ? { chave: CHAVE_NENHUM, nome: 'Sem sociedade', tipo: 'nenhum' }
    : { chave: CHAVE_POR_CLASSIFICAR, nome: 'Por classificar', tipo: 'porClassificar' };
}

/**
 * Monta a tabela cruzada.
 *
 * `motoristas` é a lista COMPLETA — todos aparecem, mesmo os que não passaram
 * nada no período. Um motorista ausente da tabela lê-se como "não existe"; um
 * motorista com zeros lê-se como "não passou nada", que é outra coisa e é a
 * verdade.
 *
 * `sociedades` dá o nome e a ordem das colunas da lista. As que não tiverem
 * nada no período ficam de fora: uma coluna inteira a zeros ocupa largura e
 * não diz nada que a ausência não diga.
 *
 * As linhas saem por ordem alfabética. Esta tabela abre-se para procurar UMA
 * pessoa, e por ordem de valor essa pessoa muda de sítio de mês para mês.
 */
export function montarMatriz(
  cruas: readonly LinhaCrua[],
  motoristas: readonly { id: string; nome: string }[],
  sociedades: readonly { id: string; nome: string }[],
): Matriz {
  // ── As colunas que têm mesmo valor ──
  const vistas = new Map<string, Coluna>();
  const porCelula = new Map<string, number>(); // `${userId}|${chave}` → cêntimos

  for (const l of cruas) {
    const c = chaveDaLinha(l);
    if (!vistas.has(c.chave)) {
      const nome = c.tipo === 'sociedade'
        ? (sociedades.find((s) => s.id === c.chave)?.nome ?? 'Sociedade apagada')
        : c.nome;
      vistas.set(c.chave, { chave: c.chave, nome, tipo: c.tipo });
    }

    const k = `${l.userId}|${c.chave}`;
    porCelula.set(k, (porCelula.get(k) ?? 0) + paraCentimos(l.total));
  }

  // ── A ordem das colunas ──
  //
  // Primeiro as sociedades da lista, na ordem da lista (que é a que ele
  // escolheu); depois os nomes escritos à mão, por ordem alfabética; e no fim
  // "sem sociedade" e "por classificar", que são as duas que não são vendas.
  const daLista = sociedades
    .filter((s) => vistas.has(s.id))
    .map((s) => vistas.get(s.id)!);

  // ── As que já não estão na lista ──
  //
  // Uma sociedade pode sair da lista (desactivada e depois apagada), mas a
  // chave estrangeira é SET NULL e as retiradas dela ficam. Sem isto, as
  // colunas dessas sociedades não entravam na ordenação e o dinheiro delas
  // desaparecia da tabela — o total do motorista deixava de bater com o que
  // ele recebeu, e nada na tela dizia porquê.
  //
  // Foi um teste que apanhou isto, não um cliente.
  const conhecidas = new Set(sociedades.map((s) => s.id));
  const orfas = [...vistas.values()]
    .filter((c) => c.tipo === 'sociedade' && !conhecidas.has(c.chave))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));

  const outras = [...vistas.values()]
    .filter((c) => c.tipo === 'outra')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));

  const fim = [CHAVE_NENHUM, CHAVE_POR_CLASSIFICAR]
    .filter((k) => vistas.has(k))
    .map((k) => vistas.get(k)!);

  const colunas = [...daLista, ...orfas, ...outras, ...fim];

  // ── As linhas ──
  const linhas: LinhaDaMatriz[] = [...motoristas]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
    .map((m) => {
      const valores: Record<string, number> = {};
      let totalCent = 0;

      for (const col of colunas) {
        const cent = porCelula.get(`${m.id}|${col.chave}`) ?? 0;
        if (cent !== 0) valores[col.chave] = paraEuros(cent);
        totalCent += cent;
      }

      return { userId: m.id, nome: m.nome, valores, total: paraEuros(totalCent) };
    });

  // ── Os totais ──
  //
  // Somados dos CÊNTIMOS outra vez, e não dos euros já convertidos das linhas.
  // Somar os convertidos era reintroduzir pela porta das traseiras o erro de
  // vírgula flutuante que esta função existe para evitar.
  const totaisPorColuna: Record<string, number> = {};
  let totalCent = 0;

  for (const col of colunas) {
    let cent = 0;
    for (const m of motoristas) cent += porCelula.get(`${m.id}|${col.chave}`) ?? 0;
    totaisPorColuna[col.chave] = paraEuros(cent);
    totalCent += cent;
  }

  return { colunas, linhas, totaisPorColuna, total: paraEuros(totalCent) };
}
