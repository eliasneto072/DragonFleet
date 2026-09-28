// src/modules/expenses/expenses.math.ts
//
// A parte PURA da automação da Prio e da Via Verde: ler o que os portais
// escrevem e decidir o que se desconta a quem.
//
// Vive fora do serviço pela mesma razão que o `assignment-lookup.ts`: é aqui que
// os enganos acontecem — um cêntimo lido como milhar, uma portagem de domingo
// à meia-noite na semana errada — e isto testa-se sem base de dados nenhuma.
//
// ─── AS DECISÕES DE NEGÓCIO, TODAS NUM SÍTIO ─────────────────────────────────
//
// Foram tomadas sem as respostas do cliente, com o critério "o que faz mais
// sentido". Estão aqui juntas para a conversa com ele ser sobre este ficheiro e
// não sobre dez espalhados:
//
//   1. PRIO desconta a PRÓPRIA semana. VIA VERDE desconta a ANTERIOR — o fecho
//      de uma semana leva as portagens da semana antes (settlementWeekOf).
//
//   2. VIA VERDE: desconta-se o USO (portagens, estacionamento). A mensalidade
//      do identificador é custo fixo do aparelho, como o seguro do carro: fica
//      na empresa por omissão (defaultChargeable). Cada linha pode ser marcada
//      à mão antes de confirmar.
//
//   3. Movimentos CANCELADOS não se descontam. PENDENTES sim — vão ser cobrados,
//      e o atraso de uma semana existe para eles assentarem.

export type ExpenseSource = 'PRIO' | 'VIA_VERDE';
export type ExpenseCategory = 'FUEL' | 'TOLL' | 'PARKING' | 'FEE' | 'OTHER';

// ─── MATRÍCULAS E CARTÕES ────────────────────────────────────────────────────

/**
 * A forma canónica de uma matrícula: maiúsculas, e com traços se forem os seis
 * caracteres portugueses. É a forma com que se guarda; para PROCURAR um veículo
 * usa-se o `plateCandidates` da consulta por matrícula, que tolera as variantes
 * gravadas na base.
 */
export function canonicalPlate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const core = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (core.length === 0) return null;
  if (core.length === 6) return `${core.slice(0, 2)}-${core.slice(2, 4)}-${core.slice(4, 6)}`;
  return core;
}

/** Só os dígitos. A Prio mostra o cartão às vezes com espaços. */
export function normalizeCard(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  return d.length >= 8 ? d : null;
}

/**
 * A célula "CARTÃO" da Prio traz o cartão E a matrícula na mesma caixa:
 *
 *   7824000011112222
 *   XY-27-QZ
 *
 * Separa os dois. A matrícula é o que vem depois do número.
 */
export function splitPrioCardCell(raw: string): { card: string | null; plate: string | null } {
  const texto = raw.trim();
  const numero = texto.match(/\d[\d\s]{7,}\d/);
  const card = normalizeCard(numero?.[0]);
  const resto = numero ? texto.replace(numero[0], ' ') : texto;
  const matricula = resto.match(/[A-Z0-9]{2}\s*-?\s*[A-Z0-9]{2}\s*-?\s*[A-Z0-9]{2}/i);
  return { card, plate: canonicalPlate(matricula?.[0]) };
}

// ─── DINHEIRO ────────────────────────────────────────────────────────────────

/**
 * "87,55€", "1,49 €", "1.234,56 €", "-3,20" → número.
 *
 * O caso traiçoeiro é o PONTO sozinho. Na coluna TOTAL da Prio o separador
 * decimal é a vírgula ("87,55€"), mas na V. UNIT. da mesma tabela é o ponto
 * ("1.7797 €"). A regra:
 *
 *   - vírgula e ponto juntos: o ÚLTIMO é o decimal ("1.234,56");
 *   - só vírgula: é decimal ("87,55");
 *   - só ponto com EXATAMENTE três algarismos depois: é milhar ("1.234");
 *   - só ponto noutro caso: é decimal ("1.7797", "12.5").
 *
 * O terceiro caso é uma aposta: "1.234" pode ser mil duzentos e trinta e quatro
 * ou um vírgula dois três quatro. Nos totais de um portal português, uma
 * quantia com ponto e três casas é milhar. Nas colunas que lemos isto nunca
 * aparece com outro sentido, e há um teste a fixar a escolha.
 */
export function parseMoney(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).replace(/[€\s\u00a0]/g, '');
  if (s === '' || s === '-') return null;

  const negativo = s.startsWith('-') || s.startsWith('(');
  s = s.replace(/[-()+]/g, '');

  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');

  if (temVirgula && temPonto) {
    const decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const milhar = decimal === ',' ? '.' : ',';
    s = s.split(milhar).join('').replace(decimal, '.');
  } else if (temVirgula) {
    s = s.replace(',', '.');
  } else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.split('.').join('');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((negativo ? -n : n) * 100) / 100;
}

// ─── DATAS ───────────────────────────────────────────────────────────────────

export interface PortalMoment {
  /** O dia do calendário EM LISBOA, AAAA-MM-DD. É daqui que sai a semana. */
  day: string;
  /** O instante exato, em UTC. */
  occurredAt: Date;
}

/**
 * Deslocamento de Lisboa face a UTC, em minutos, num dado instante.
 * +60 no verão, 0 no inverno.
 */
function lisbonOffsetMinutes(utcMs: number): number {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  const comoUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return Math.round((comoUtc - utcMs) / 60_000);
}

/**
 * Lê uma data e hora como os portais a escrevem, em hora de Lisboa.
 *
 *   Prio:        "23/09/2026 23:20"   (às vezes com quebra de linha no meio)
 *   Via Verde:   "2026-09-22 17:04:05"
 *                "2026-09-22 09:23:20 > 2026-09-22 09:26:23"  (entrada > saída)
 *
 * Com entrada e saída, fica a ENTRADA: é quando o motorista estava ao volante,
 * que é o que decide de quem é a portagem.
 *
 * ─── PORQUE O DIA SE GUARDA À PARTE DO INSTANTE ──────────────────────────────
 *
 * As semanas de fecho contam-se em UTC. Uma portagem às 00:30 de segunda-feira
 * em Lisboa, no verão, é 23:30 de DOMINGO em UTC — e pela conta em UTC cairia
 * na semana anterior. O motorista olha para o recibo, vê segunda-feira, e tem
 * razão. A semana tira-se do dia que o portal mostra; o instante serve para
 * saber quem tinha o carro.
 */
export function parsePortalDateTime(raw: string | null | undefined): PortalMoment | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, ' ').trim();

  let y: number, mo: number, d: number, h = 0, mi = 0, se = 0;

  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  const pt = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?/);

  if (iso && (!pt || s.indexOf(iso[0]) <= s.indexOf(pt[0]))) {
    [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    if (iso[4]) [h, mi, se] = [Number(iso[4]), Number(iso[5]), Number(iso[6] ?? 0)];
  } else if (pt) {
    [d, mo, y] = [Number(pt[1]), Number(pt[2]), Number(pt[3])];
    if (pt[4]) [h, mi, se] = [Number(pt[4]), Number(pt[5]), Number(pt[6] ?? 0)];
  } else {
    return null;
  }

  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;

  const palpite = Date.UTC(y, mo - 1, d, h, mi, se);
  const occurredAt = new Date(palpite - lisbonOffsetMinutes(palpite) * 60_000);

  const day = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { day, occurredAt };
}

// ─── SEMANAS ─────────────────────────────────────────────────────────────────

const DIA = 86_400_000;

/** A segunda-feira (AAAA-MM-DD) da semana a que um dia pertence. */
export function mondayOf(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  const semana = new Date(t).getUTCDay() || 7;
  return new Date(t - (semana - 1) * DIA).toISOString().slice(0, 10);
}

/**
 * A semana de FECHO em que um movimento é descontado.
 *
 * Prio: a própria semana. Via Verde: a SEGUINTE à do movimento — o fecho de uma
 * semana leva as portagens da anterior, porque os movimentos da Via Verde levam
 * dias a assentar. Decisão 1 no topo do ficheiro.
 */
export function settlementWeekOf(source: ExpenseSource, day: string): string {
  if (source === 'VIA_VERDE') {
    const maisSete = new Date(Date.parse(`${day}T00:00:00Z`) + 7 * DIA).toISOString().slice(0, 10);
    return mondayOf(maisSete);
  }
  return mondayOf(day);
}

/**
 * O intervalo de DIAS de movimento que um fecho de semana leva. O inverso de
 * `settlementWeekOf`: para a semana que começa em `weekStart`, que movimentos
 * entram. É isto que o formulário do fecho pede ao servidor.
 */
export function movementRangeFor(source: ExpenseSource, weekStart: string): { from: string; to: string } {
  const inicio = Date.parse(`${mondayOf(weekStart)}T00:00:00Z`) - (source === 'VIA_VERDE' ? 7 * DIA : 0);
  return {
    from: new Date(inicio).toISOString().slice(0, 10),
    to: new Date(inicio + 6 * DIA).toISOString().slice(0, 10),
  };
}

// ─── CATEGORIAS E O QUE SE DESCONTA ──────────────────────────────────────────

/**
 * A categoria de um movimento da Via Verde, pela descrição.
 *
 * A coluna "Serviço" do portal é um ÍCONE, sem texto que se possa ler. A
 * descrição é que diz o que foi:
 *
 *   "Pontinha >> Belas PV"        entrada >> saída  → portagem
 *   "Mensalidade VV Mobilidade"   / "Adesão ..."     → mensalidade
 *   estacionamentos                                  → estacionamento
 */
export function categorizeViaVerde(descricao: string, servico?: string | null): ExpenseCategory {
  const t = `${descricao} ${servico ?? ''}`.toLowerCase();
  if (/mensalidade|anuidade|ades[aã]o|quota/.test(t)) return 'FEE';
  if (/estaciona|parque|parking|\bpark\b/.test(t)) return 'PARKING';
  if (/>>|portagem|\btoll\b|autoestrada|a\d{1,2}\b/.test(t)) return 'TOLL';
  return 'OTHER';
}

/** O texto do estado diz que o movimento foi anulado? */
export function isCancelledStatus(estado: string | null | undefined): boolean {
  if (!estado) return false;
  return /cancel|anulad|estornad|revertid|recusad|reembolsad/i.test(estado);
}

/**
 * O padrão do "descontar ou não", antes de o administrador rever.
 * Decisões 2 e 3 no topo do ficheiro.
 */
export function defaultChargeable(categoria: ExpenseCategory, estado: string | null | undefined): boolean {
  if (isCancelledStatus(estado)) return false;
  if (categoria === 'FEE') return false;
  return true;
}

// ─── REPETIÇÕES ──────────────────────────────────────────────────────────────

/**
 * Uma chave estável por movimento, para que reenviar a mesma tabela não duplique
 * descontos. Com o mesmo princípio do ingest dos ganhos.
 *
 * Na Prio o RECIBO identifica o abastecimento; sem ele, cai para a combinação
 * cartão + instante + valor. Na Via Verde não há recibo: identificador ou
 * matrícula + instante + descrição + valor. Dois movimentos iguais nos cinco não
 * existem — a portagem regista o segundo.
 */
export function externalKey(r: {
  source: ExpenseSource;
  occurredAt: Date;
  amount: number;
  receipt?: string | null;
  card?: string | null;
  identifier?: string | null;
  plate?: string | null;
  description?: string | null;
}): string {
  const instante = r.occurredAt.toISOString();
  const valor = r.amount.toFixed(2);
  if (r.source === 'PRIO') {
    return r.receipt
      ? `PRIO|R|${r.receipt.trim()}|${r.card ?? ''}`
      : `PRIO|C|${r.card ?? r.plate ?? ''}|${instante}|${valor}`;
  }
  return `VV|${r.identifier ?? r.plate ?? ''}|${instante}|${(r.description ?? '').trim()}|${valor}`;
}
