// src/features/landing/conteudo.ts
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  É AQUI QUE SE MUDA O TEXTO DO SITE. Só aqui.                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// ─── O QUE ESTE SITE NÃO PROMETE ────────────────────────────────────────────
//
// Nenhum valor de rendimento. Não há ordenado fixo no TVDE: cada um ganha o
// que trabalha. Qualquer número que puséssemos como exemplo passava a ser a
// expectativa de quem o lesse, e a primeira semana abaixo disso era uma
// conversa difícil que a página criou sozinha.
//
// Em vez disso há a calculadora (`calculadora.ts`): a pessoa escreve o que
// acha que fatura, e nós mostramos exactamente o que cobramos sobre isso.
// Essa parte é exacta, é a única que controlamos, e está testada.
//
// ─── AS CONDIÇÕES ESTÃO EM DOIS SÍTIOS, E É DE PROPÓSITO ────────────────────
//
// Os números das condições de carro próprio (6% + 50 €) vivem em
// `calculadora.ts`, porque é lá que são CONTA. O texto aqui descreve-os. Se
// mudares as condições, muda os dois — e há um teste que falha se o número da
// calculadora mudar sem ninguém reparar.

/** O teu contacto. O WhatsApp é o botão principal das duas páginas. */
export const CONTACTO = {
  /** Só dígitos, com indicativo e sem +. Portugal é 351. */
  whatsapp: '351938130689',
  email: 'chromaticdragontvde@gmail.com',
  /** Como se mostra ao lado do botão. */
  telefoneVisivel: '938 130 689',
};

/** A mensagem já escrita quando alguém abre o WhatsApp a partir do site. */
export const MENSAGEM_WHATSAPP = {
  motorista: 'Olá! Vi o site da DragonFleet e queria saber como começar a conduzir.',
  gestor: 'Olá! Vi o site da DragonFleet e queria saber mais sobre a gestão de frota.',
};

// ─── MOTORISTAS ─────────────────────────────────────────────────────────────

export const MOTORISTAS = {
  /**
   * Os dois caminhos. Tu disseste que aceitas os dois casos, por isso a
   * página mostra-os lado a lado e deixa a pessoa reconhecer-se num.
   */
  caminhos: [
    {
      titulo: 'Não tenho carro',
      resumo: 'Damos-te o carro da frota. Começas sem investir nada numa viatura.',
      pontos: [
        'Viatura da frota, pronta a trabalhar',
        // O valor varia com o carro, e por isso não está escrito: dizer "a
        // partir de X" numa página pública amarra-te ao carro mais barato.
        'Aluguer semanal fixo, conforme o carro',
        'Sem comissão sobre o que faturas',
      ],
    },
    {
      titulo: 'Já tenho carro',
      resumo: 'Tratamos das licenças, das plataformas e da papelada. Tu conduzes.',
      pontos: [
        'Licença TVDE e contratos tratados por nós',
        'Uber e Bolt ligados à mesma conta',
        // Os números vivem em `calculadora.ts`, que é onde são conta. Aqui
        // são texto — ver a nota no topo deste ficheiro.
        '6% sobre o que faturas, mais 50 € por semana de slot',
        'Mais nada. Sem surpresas no fim do mês',
      ],
    },
  ],

  /**
   * O que a plataforma faz por ele. Isto não precisa de ser preenchido: é
   * descrição do produto, e qualquer uma destas frases se confirma abrindo a
   * aplicação.
   */
  plataforma: [
    {
      titulo: 'Sabes sempre quanto tens',
      texto: 'O teu saldo está na app, actualizado a cada fecho semanal. '
        + 'Vês o que entrou, o que saiu e porquê — linha a linha, sem perguntar a ninguém.',
    },
    {
      titulo: 'Pedes o dinheiro quando quiseres',
      texto: 'Anexas o recibo no próprio pedido e acompanhas o estado até ser pago. '
        + 'Nada de mensagens à espera de resposta.',
    },
    {
      titulo: 'O carro avaria, marcas na app',
      texto: 'Escolhes a oficina, dizes o que tem, e segues a reparação até estar pronta. '
        + 'Se precisares de boleia, pedes no mesmo sítio.',
    },
    {
      titulo: 'Os teus documentos avisam-te',
      texto: 'Carta, TVDE, seguro. A app avisa antes de expirarem, '
        + 'para não seres tu a descobrir no dia em que já não podes trabalhar.',
    },
  ],

  /**
   * Os passos até começar. Ajusta os prazos se não baterem certo com a tua
   * realidade — mas não prometas o que não consegues cumprir numa semana má.
   */
  passos: [
    { titulo: 'Deixas o contacto', texto: 'Aqui no site ou por WhatsApp. Dois campos.' },
    { titulo: 'Falamos', texto: 'Percebemos o teu caso e dizemos-te as condições, sem rodeios.' },
    { titulo: 'Documentos', texto: 'Dizemos o que falta e tratamos do que for connosco.' },
    { titulo: 'Começas', texto: 'Conta criada, carro atribuído, e a app na mão.' },
  ],
};

// ─── GESTORES DE FROTA ──────────────────────────────────────────────────────

export const GESTORES = {
  /**
   * As dores. Escritas a partir do que o próprio sistema resolve — cada uma
   * corresponde a um ecrã que existe.
   */
  dores: [
    {
      problema: 'O fecho semanal é um sábado inteiro no Excel',
      solucao: 'Lanças o que entrou e o que saiu por motorista, a comissão e o imposto '
        + 'são aplicados sozinhos, e o saldo de cada um actualiza na hora.',
    },
    {
      problema: 'Nunca sabes que documentos estão a expirar',
      solucao: 'Cartas, seguros e inspeções com data. O painel avisa antes, '
        + 'e diz-te quantos são logo no menu.',
    },
    {
      problema: 'As retiradas andam perdidas no WhatsApp',
      solucao: 'O motorista pede na app com o recibo anexado. Tu aprovas, '
        + 'e fica registado quem pediu, quanto, e para que IBAN foi.',
    },
    {
      problema: 'Não sabes quanto cada motorista passou a cada sociedade',
      solucao: 'Uma tabela por ano, com os motoristas nas linhas e as tuas sociedades '
        + 'nas colunas. Para a contabilidade, está feito.',
    },
    {
      problema: 'A oficina é um grupo de WhatsApp e um caderno',
      solucao: 'Marcações, oficinas, mecânicos e o stock de peças com os preços de compra. '
        + 'Cada reparação com a fatura e o comprovativo anexados.',
    },
  ],

  /** O que está incluído em qualquer plano. */
  base: [
    'Os teus dados são só teus — cada frota está isolada das outras',
    'Painel na web e no telemóvel, sem instalar nada',
    'Os teus motoristas entram por um link de convite teu',
    'Suporte em português, falas comigo',
  ],
};
