// src/modules/system/funcionalidades.ts
//
// O que há para vender: a lista das funcionalidades que um plano pode incluir.
//
// ─── PORQUE É QUE ISTO NÃO É A LISTA DAS ÁREAS ──────────────────────────────
//
// Porque as áreas são permissões e isto são menus, e não são a mesma coisa.
//
// A área FLEET tem TRÊS entradas no menu — Frotas, Oficina e Material — e um
// plano que venda "agendamento e inventário" sem vender a gestão de carros
// precisa de as distinguir. Ao nível das áreas isso não se escreve: ou se dava
// a área inteira, ou não se dava nada.
//
// Então a unidade aqui é a ENTRADA DE MENU, que é também a unidade em que se
// pensa ao vender ("este plano dá-te a oficina"). Cada uma declara a área de
// que depende, e é esse par que a fase 4 vai usar: a entrada aparece quando o
// plano a inclui E a pessoa tem permissão na área dela. As duas condições, não
// uma — o plano diz o que a frota comprou, as permissões dizem o que cada
// pessoa dessa frota faz com o que foi comprado.
//
// ─── PORQUE É QUE O INVESTIMENTO NÃO ESTÁ AQUI ──────────────────────────────
//
// Porque não se vende. Os investidores e os projetos são da casa: o dinheiro é
// dele, os contratos são com ele, e uma frota cliente não tem nada que ver
// investidores — nem os dela, que não existem, nem os de ninguém. Deixar essas
// três fora da lista é o que garante que não entram num plano por distração.
//
// ─── PORQUE É QUE ISTO ESTÁ NUM FICHEIRO PURO ───────────────────────────────
//
// Para o editor de planos e o servidor lerem a MESMA lista. Uma caixa no painel
// que escreva um código que o servidor não reconhece dá um plano que diz que dá
// acesso a uma coisa e não dá — e isso só se descobre quando um cliente liga.

/** Um grupo do menu, pela ordem em que aparece. */
export type GrupoDaFuncionalidade = 'Operação' | 'Dinheiro' | 'Sistema' | 'Extras';

export interface Funcionalidade {
  /** O código gravado no plano. Nunca muda — está em linhas na base de dados. */
  codigo: string;
  /** Como aparece nas caixas do editor. */
  nome: string;
  grupo: GrupoDaFuncionalidade;
  /**
   * A área de permissões de que esta entrada depende, ou `null` quando não é
   * uma entrada de menu (ver `EXTENSAO`).
   */
  area: string | null;
  /** Uma linha a dizer o que é, para quem está a montar o plano. */
  descricao: string;
  /**
   * Vai em todos os planos, quer se marque a caixa quer não.
   *
   * Só o painel. Um plano sem painel é um plano onde a pessoa entra e não há
   * primeira página — e o sintoma é "paguei e não consigo entrar", que é a pior
   * forma de descobrir que faltava marcar uma caixa.
   */
  obrigatoria?: true;
}

export const FUNCIONALIDADES: Funcionalidade[] = [
  // ── Operação ──
  {
    codigo: 'DASHBOARD', nome: 'Dashboard', grupo: 'Operação', area: 'DASHBOARD',
    descricao: 'A primeira página, com o resumo do que falta fazer.',
    obrigatoria: true,
  },
  {
    codigo: 'DRIVERS', nome: 'Motoristas', grupo: 'Operação', area: 'DRIVERS',
    descricao: 'Fichas dos motoristas, saldos e histórico.',
  },
  {
    codigo: 'DOCUMENTS', nome: 'Documentos', grupo: 'Operação', area: 'DOCUMENTS',
    descricao: 'Receber, validar e vigiar as validades.',
  },
  {
    codigo: 'FLEET', nome: 'Frotas', grupo: 'Operação', area: 'FLEET',
    descricao: 'Os carros: atribuições, inspeções e seguros.',
  },
  {
    codigo: 'OFICINA', nome: 'Oficina', grupo: 'Operação', area: 'FLEET',
    descricao: 'Marcações de reparação, oficinas e mecânicos.',
  },
  {
    codigo: 'MATERIAL', nome: 'Material', grupo: 'Operação', area: 'FLEET',
    descricao: 'Stock de peças e consumíveis, com os preços de compra.',
  },
  {
    codigo: 'RANKS', nome: 'Níveis', grupo: 'Operação', area: 'RANKS',
    descricao: 'A escada de níveis dos motoristas e as vantagens de cada um.',
  },

  // ── Dinheiro ──
  {
    codigo: 'SETTLEMENTS', nome: 'Faturação', grupo: 'Dinheiro', area: 'SETTLEMENTS',
    descricao: 'O fecho semanal: o que entrou, o que saiu, o que se credita.',
  },
  {
    codigo: 'IMPORTAR', nome: 'Importar despesas', grupo: 'Dinheiro', area: 'SETTLEMENTS',
    descricao: 'Carregar ficheiros das plataformas em vez de escrever à mão.',
  },
  {
    codigo: 'FINANCIAL', nome: 'Financeiro', grupo: 'Dinheiro', area: 'FINANCIAL',
    descricao: 'Retiradas, ajustes e movimentos de banca.',
  },
  {
    codigo: 'AGENDAMENTOS', nome: 'Agendamentos', grupo: 'Dinheiro', area: 'FINANCIAL',
    descricao: 'Pagamentos e descontos marcados para datas futuras.',
  },
  {
    codigo: 'GREEN_RECEIPTS', nome: 'Recibos Verdes', grupo: 'Dinheiro', area: 'GREEN_RECEIPTS',
    descricao: 'Os recibos dos motoristas, por empresa.',
  },
  {
    codigo: 'ANALYTICS', nome: 'Análises', grupo: 'Dinheiro', area: 'ANALYTICS',
    descricao: 'Receitas, margens e evolução ao longo do tempo.',
  },
  {
    codigo: 'ESTATISTICAS', nome: 'Estatísticas', grupo: 'Dinheiro', area: 'ANALYTICS',
    descricao: 'Os números da frota em bruto, por carro e por motorista.',
  },

  // ── Sistema ──
  {
    codigo: 'NOTIFICATIONS', nome: 'Notificações', grupo: 'Sistema', area: 'NOTIFICATIONS',
    descricao: 'Avisos automáticos e mensagens para os motoristas.',
  },
  {
    codigo: 'SUPPORT', nome: 'Suporte', grupo: 'Sistema', area: 'SUPPORT',
    descricao: 'Os pedidos de ajuda dos motoristas, em tickets.',
  },
  {
    codigo: 'SETTINGS', nome: 'Configurações', grupo: 'Sistema', area: 'SETTINGS',
    descricao: 'Comissão, impostos e limites da frota.',
  },
  {
    codigo: 'TEAM', nome: 'Equipa', grupo: 'Sistema', area: 'TEAM',
    descricao: 'Contas de gestor e as permissões de cada uma.',
  },

  // ── Extras ──
  //
  // Não são entradas de menu: são coisas que a frota tem ou não tem. Daí
  // `area: null` — não há permissão a verificar, há um plano a incluir ou não.
  {
    codigo: 'EXTENSAO', nome: 'Extensão automática', grupo: 'Extras', area: null,
    descricao: 'A extensão do browser que recolhe sozinha os dados das plataformas.',
  },
];

/** Pela ordem em que o editor desenha as caixas. */
export const GRUPOS_DE_FUNCIONALIDADES: GrupoDaFuncionalidade[] = [
  'Operação', 'Dinheiro', 'Sistema', 'Extras',
];

const PORCODIGO = new Map(FUNCIONALIDADES.map((f) => [f.codigo, f]));

/** Os códigos que vão em todos os planos. Ver `obrigatoria`. */
export const OBRIGATORIAS: string[] = FUNCIONALIDADES
  .filter((f) => f.obrigatoria)
  .map((f) => f.codigo);

export function existeFuncionalidade(codigo: string): boolean {
  return PORCODIGO.has(codigo);
}

export function nomeDaFuncionalidade(codigo: string): string {
  return PORCODIGO.get(codigo)?.nome ?? codigo;
}

/**
 * A lista de um plano, limpa: sem códigos desconhecidos, sem repetidos, com as
 * obrigatórias, e sempre na mesma ordem.
 *
 * ─── PORQUE É QUE A ORDEM É A DO CATÁLOGO E NÃO A DAS CAIXAS ────────────────
 *
 * Porque assim dois planos com as mesmas funcionalidades gravam exactamente a
 * mesma lista, independentemente da ordem por que alguém carregou nas caixas.
 * Sem isto, comparar dois planos — ou ver num histórico o que mudou num — era
 * comparar listas iguais escritas de forma diferente.
 *
 * ─── PORQUE É QUE UM CÓDIGO DESCONHECIDO É IGNORADO E NÃO RECUSADO ──────────
 *
 * Para o dia em que uma funcionalidade sair do catálogo. Os planos antigos
 * continuam com o código dela gravado, e recusá-lo tornava impossível gravar
 * uma alteração num plano antigo sem primeiro perceber que código era aquele.
 * Ignorado, o plano limpa-se a si próprio na primeira vez que for guardado.
 */
export function normalizarFuncionalidades(codigos: readonly string[]): string[] {
  const pedidos = new Set(codigos.map((c) => c.trim().toUpperCase()));
  for (const o of OBRIGATORIAS) pedidos.add(o);

  return FUNCIONALIDADES
    .filter((f) => pedidos.has(f.codigo))
    .map((f) => f.codigo);
}

/**
 * As áreas que estas funcionalidades abrem.
 *
 * É o que a fase 4 vai usar para fechar à chave o que o plano não inclui: uma
 * área só conta se ALGUMA funcionalidade do plano depender dela.
 */
export function areasDasFuncionalidades(codigos: readonly string[]): string[] {
  const incluidos = new Set(normalizarFuncionalidades(codigos));
  const areas = new Set<string>();

  for (const f of FUNCIONALIDADES) {
    if (f.area && incluidos.has(f.codigo)) areas.add(f.area);
  }
  return [...areas];
}

/** Inclui esta funcionalidade? Trata das obrigatórias por ti. */
export function planoInclui(codigos: readonly string[], codigo: string): boolean {
  if (OBRIGATORIAS.includes(codigo)) return true;
  return codigos.includes(codigo);
}
