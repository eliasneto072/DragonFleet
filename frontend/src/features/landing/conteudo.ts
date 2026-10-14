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

// ─── A CONTA DE DEMONSTRAÇÃO ────────────────────────────────────────────────

/**
 * A frota de exemplo onde qualquer pessoa pode entrar e clicar.
 *
 * Está DESLIGADA, e é de propósito: ainda não existe. Um botão a prometer
 * "entrar e experimentar" que leva a um ecrã de login é pior do que não ter
 * botão — é a primeira coisa que a pessoa experimenta de nós e já não
 * funcionou.
 *
 * Quando a conta estiver montada, põe-se `activa: true` e as duas páginas
 * passam a mostrar o botão. Mais nada.
 */
export const DEMONSTRACAO = {
  activa: false,
  url: '',
  /** Mostrado por baixo do botão, para a pessoa saber onde está a entrar. */
  nota: 'Frota de exemplo, dados inventados. Podes mexer em tudo.',
};

// ─── GESTORES DE FROTA ──────────────────────────────────────────────────────

export const GESTORES = {
  /**
   * ╔════════════════════════════════════════════════════════════════════════╗
   * ║  LÊ ISTO ANTES DE PUBLICAR. É a única parte da página que fala de ti.  ║
   * ╚════════════════════════════════════════════════════════════════════════╝
   *
   * É o argumento mais forte que tens, e é o único que nenhum concorrente
   * consegue copiar: eles podem fazer o mesmo software, não podem ter uma
   * frota. Mas só funciona enquanto for verdade ao pé da letra — se um
   * comprador descobrir uma exageração aqui, perde a confiança em tudo o
   * resto da página, e com razão.
   *
   * Duas coisas para decidires:
   *
   *  1. O VERBO. Está «fiz um». Tu dirigiste o trabalho e decidiste tudo o
   *     que o sistema faz, por isso defende-se — mas se preferires «mandei
   *     fazer um», que é mais literal, muda. É uma palavra e é tua.
   *
   *  2. O NÚMERO DE CARROS. Não está escrito, de propósito. Um número ajuda
   *     a credibilidade com quem tem uma frota do teu tamanho e tira-a com
   *     quem tem o triplo. Se quiseres pô-lo, acrescenta-o ao `texto`.
   */
  operador: {
    titulo: 'Não sou uma empresa de software',
    texto: 'Sou gestor de frota TVDE em Portugal. Passava os sábados a fechar contas '
      + 'no Excel, andava com os recibos dos motoristas no WhatsApp e descobri mais '
      + 'do que um seguro a expirar pelo pior caminho: com o carro já parado. '
      + 'Como não encontrei nenhum sistema feito para isto, fiz um. '
      + 'É este, e é o que uso todas as semanas na minha frota.',
    /**
     * As três consequências de o construtor ser o utilizador. Não são
     * promessas de funcionalidades — são promessas sobre a relação, e é
     * nisso que uma empresa de uma pessoa ganha a uma de duzentas.
     */
    pontos: [
      {
        titulo: 'Nada aqui é teoria',
        texto: 'Cada ecrã existe porque me faltou a mim numa semana concreta. '
          + 'Não foi desenhado numa reunião a partir de um estudo de mercado.',
      },
      {
        titulo: 'Falas comigo',
        texto: 'Não abres um bilhete à espera que uma empresa noutro país decida '
          + 'se o teu caso interessa. Tens o meu número e eu percebo o problema '
          + 'antes de o explicares.',
      },
      {
        titulo: 'Não vou abandonar isto',
        texto: 'Se eu parasse de desenvolver o sistema, a primeira frota a ficar '
          + 'sem ferramenta era a minha. É a garantia mais sólida que te posso dar.',
      },
    ],
  },

  /**
   * Os dois tamanhos de comprador.
   *
   * Escolheste falar aos dois, e isso só funciona se cada um se reconhecer
   * depressa — por isso a primeira linha de cada cartão é o tamanho da frota
   * e não uma vantagem. Quem tem 5 carros e quem tem 25 não têm o mesmo
   * problema: o primeiro não tem tempo, o segundo não tem visibilidade. Dizer
   * a mesma coisa aos dois era não dizer nada a nenhum.
   */
  casos: [
    {
      tamanho: 'De 1 a 10 carros',
      titulo: 'Fazes tudo tu',
      resumo: 'O fecho é teu, a oficina é tua, e as mensagens dos motoristas '
        + 'chegam todas ao teu telefone — incluindo ao domingo.',
      pontos: [
        'Lanças o que entrou e o que saiu, e a comissão e o imposto aplicam-se sozinhos',
        'Os motoristas deixam de te perguntar quanto têm a receber — está na app deles',
        'Não precisas de contratar ninguém para o escritório para deixares de perder sábados',
      ],
      ganho: 'Ganhas o teu tempo de volta',
    },
    {
      tamanho: 'De 10 a 30 carros',
      titulo: 'Já tens quem trate disto',
      resumo: 'O problema deixou de ser o tempo. É não saberes, num dado momento, '
        + 'onde está o dinheiro, que papéis estão a expirar e que carro está parado.',
      pontos: [
        'A frota inteira num ecrã: saldos, documentos, carros parados e pedidos à espera',
        'Cada pessoa da equipa só mexe no que é dela, por níveis de permissão',
        'A tabela anual de quanto cada motorista passou a cada sociedade, pronta para a contabilidade',
      ],
      ganho: 'Ganhas o controlo',
    },
  ],

  /**
   * Os ecrãs do painel.
   *
   * ╔════════════════════════════════════════════════════════════════════════╗
   * ║  AS IMAGENS AINDA NÃO EXISTEM. Falta-te pôr os ficheiros abaixo em    ║
   * ║  frontend/public/ecras/ — com estes nomes exactos.                     ║
   * ╚════════════════════════════════════════════════════════════════════════╝
   *
   * Enquanto não estiverem lá, a página mostra um aviso visível a dizer que
   * ficheiro falta. É de propósito: um espaço em branco calado passava
   * despercebido e ficava publicado assim.
   *
   * Conselhos para as capturas: ecrã de computador em modo escuro (combina
   * com a página), janela larga, e sem nomes nem matrículas verdadeiras —
   * inventa dois ou três motoristas antes de fotografar, porque isto vai para
   * uma página pública e os dados dos teus motoristas não.
   */
  ecras: [
    {
      ficheiro: 'fecho-semanal.png',
      titulo: 'O fecho da semana',
      texto: 'Lanças o que entrou e o que saiu por motorista. A comissão e o imposto '
        + 'aplicam-se sozinhos, e o saldo de cada um actualiza na hora.',
    },
    {
      ficheiro: 'documentos.png',
      titulo: 'O que está a expirar',
      texto: 'Cartas, seguros e inspeções com data. O menu diz-te quantos estão a '
        + 'chegar ao fim — antes de alguém ser parado na estrada.',
    },
    {
      ficheiro: 'retiradas.png',
      titulo: 'Os pedidos de dinheiro',
      texto: 'O motorista pede na app com o recibo já anexado. Aprovas, e fica '
        + 'registado quem pediu, quanto, quando e para que IBAN foi.',
    },
    {
      ficheiro: 'recibos-verdes.png',
      titulo: 'Quem passou quanto a cada sociedade',
      texto: 'Uma tabela por ano: motoristas nas linhas, as tuas sociedades nas '
        + 'colunas. A conta que se fazia à mão em Janeiro está feita todo o ano.',
    },
    {
      ficheiro: 'oficina.png',
      titulo: 'A oficina e as peças',
      texto: 'Marcações, mecânicos e stock com os preços de compra. Cada reparação '
        + 'com a fatura e o comprovativo de pagamento anexados.',
    },
    {
      // Mostrar a app do motorista a quem compra responde, sem uma palavra, à
      // pergunta "e eles vão usar isto?".
      ficheiro: 'motorista.png',
      titulo: 'E o que o motorista vê',
      texto: 'O saldo dele, movimento a movimento, e o botão para pedir o dinheiro. '
        + 'É por isto que eles usam — não é por tu mandares.',
    },
  ],

  /**
   * A comparação lado a lado.
   *
   * ─── ISTO SUBSTITUIU A LISTA DE «DORES» ───────────────────────────────────
   *
   * A página tinha uma secção de cinco pares problema/solução e esta tabela
   * dizia-lhe a mesma coisa logo a seguir. Duas secções com o mesmo argumento
   * em sequência é metade do que fazia a página antiga parecer um bloco só:
   * nada se destacava porque tudo tinha o mesmo peso.
   *
   * Ficou a tabela, porque se lê de relance e a outra obrigava a ler.
   *
   * É a secção que se lê de relance, e por isso cada linha tem de caber numa
   * linha. O «hoje» é escrito sem desprezo: o Excel não é estupidez, é o que
   * funciona até deixar de funcionar — e quem o usa sabe-o melhor do que nós.
   */
  comparacao: [
    {
      assunto: 'Fechar a semana',
      hoje: 'Um sábado inteiro, com três ficheiros abertos',
      agora: 'Lanças os valores e está fechado',
    },
    {
      assunto: '«Quanto tenho a receber?»',
      hoje: 'Mensagem do motorista, e tu vais ver',
      agora: 'Está na app dele, ao cêntimo, sem te perguntar',
    },
    {
      assunto: 'Seguros e inspeções',
      hoje: 'Descobres no dia em que o carro é parado',
      agora: 'O painel avisa com antecedência e diz quantos faltam',
    },
    {
      assunto: 'Pedidos de dinheiro',
      hoje: 'Perdidos no WhatsApp, sem recibo',
      agora: 'Pedido com recibo anexado, aprovado e registado',
    },
    {
      assunto: 'Reparações',
      hoje: 'Um caderno e a memória do mecânico',
      agora: 'Marcação, fatura e comprovativo no mesmo sítio',
    },
    {
      assunto: 'Recibos verdes por sociedade',
      hoje: 'Contas à mão em Janeiro, se der',
      agora: 'Tabela por ano, sempre feita',
    },
    {
      assunto: 'Duas folhas a dizer coisas diferentes',
      hoje: 'Acontece, e descobres tarde',
      agora: 'Há um sítio só, e é esse que manda',
    },
  ],

  /**
   * As perguntas que o comprador faz calado.
   *
   * Esta secção não é um apêndice: é onde a venda se ganha. Quem chega aqui
   * já quer — o que o trava é uma destas sete dúvidas, e uma página que as
   * deixa sem resposta perde-o sem nunca saber porquê.
   *
   * ─── DUAS RESPOSTAS QUE SÃO COMPROMISSOS TEUS ─────────────────────────────
   *
   * A da exportação e a do acompanhamento na primeira semana prometem
   * trabalho TEU, não do sistema. Deixei-as escritas porque são o que faz a
   * diferença contra uma empresa grande — mas lê-as e confirma que as
   * cumpres com dez clientes, não só com um. Se não, dizes-me e eu abrando-as.
   */
  perguntas: [
    {
      pergunta: 'Tenho de passar para lá tudo o que já tenho?',
      resposta: 'Não. Criam-se os carros e os motoristas — isso faz-se numa tarde — e '
        + 'começas a fechar as semanas no sistema a partir daí. O histórico antigo pode '
        + 'ficar onde está; não precisas de o importar para começar a usar.',
    },
    {
      pergunta: 'Os meus motoristas vão mesmo usar?',
      resposta: 'Usam, porque é lá que vêem o saldo e é lá que pedem o dinheiro. Entram '
        + 'por um link de convite teu, funciona no telemóvel sem instalar nada, e na '
        + 'prática dá-lhes menos trabalho do que mandar-te mensagem.',
    },
    {
      pergunta: 'E se eu quiser sair? Levo os meus dados?',
      resposta: 'Levas. Pedes, e eu exporto-te tudo — motoristas, fechos, movimentos e '
        + 'documentos — em folhas de Excel. Não há letra pequena sobre isto e não tens '
        + 'de dar justificação nenhuma.',
    },
    {
      pergunta: 'Quem és tu, e isto existe no ano que vem?',
      resposta: 'Sou o Diogo, da Chromatic Dragon. Tenho uma frota TVDE em Portugal e '
        + 'este sistema é o que uso para a gerir. Enquanto eu tiver frota, isto é '
        + 'mantido — se o abandonasse, a operação que parava primeiro era a minha.',
    },
    {
      // A resposta que ele pediu para tirar do lugar onde estava: aqui é uma
      // resposta a quem perguntou, e não um cartaz a levantar a dúvida.
      pergunta: 'Os meus dados ficam misturados com os de outras frotas?',
      resposta: 'Não. Cada frota só vê o que é dela, e isso não depende de ninguém se '
        + 'lembrar de o garantir — é como o sistema está construído por dentro.',
    },
    {
      pergunta: 'Quanto custa, e o que acontece se não gostar?',
      resposta: 'Os preços estão aqui em cima, à vista. O primeiro mês é grátis e usas '
        + 'com a tua frota verdadeira, não com uma demonstração. Se não te resolver o '
        + 'problema, não pagas — e não tens nada a cancelar nem a justificar.',
    },
    {
      pergunta: 'E se precisar de uma coisa que o sistema não faz?',
      resposta: 'Dizes-me. É a vantagem de falares com quem o constrói em vez de uma '
        + 'empresa com mil clientes: se fizer sentido para mais frotas que a tua, faz-se, '
        + 'e sabes quando. Se não fizer, digo-te isso também em vez de te deixar à espera.',
    },
  ],

  /** Os três passos até começar. */
  passos: [
    {
      titulo: 'Falamos quinze minutos',
      texto: 'Vejo como trabalhas hoje e digo-te sem rodeios se isto te serve. '
        + 'Se não servir, digo-o.',
    },
    {
      titulo: 'Monta-se a tua frota',
      texto: 'Carros, motoristas e as tuas regras de comissão. Numa tarde, '
        + 'e com o primeiro mês já a contar como grátis.',
    },
    {
      titulo: 'Fechas a primeira semana',
      texto: 'Essa fazemo-la juntos. Daí para a frente fazes sozinho, '
        + 'em minutos em vez de um sábado.',
    },
  ],

  /** O que está incluído em qualquer plano. */
  base: [
    'Primeiro mês grátis, com a tua frota verdadeira',
    'Painel na web e no telemóvel, sem instalar nada',
    'Os teus motoristas entram por um link de convite teu',
    'Falas comigo, e não com um formulário de suporte',
  ],
};
