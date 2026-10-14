// src/features/landing/pages/GestoresPage.tsx
//
// A página para quem gere uma frota. É a página que tem de vender.
//
// ─── O QUE MUDOU, E PORQUE ──────────────────────────────────────────────────
//
// A versão anterior falava do produto e nunca o mostrava: pedia quinze
// minutos ao telefone a um desconhecido para ele poder ver o sistema. Quase
// ninguém faz essa chamada — vai-se embora, e nós nunca soubemos que esteve
// aqui. Era o maior buraco da página e as outras mudanças todas valem menos
// do que tapá-lo.
//
// Tinha também três problemas menores e caros:
//   · nenhum argumento de dinheiro ou de tempo, numa página para quem compra
//     ferramentas de trabalho (o motorista tinha calculadora, o gestor tinha
//     adjetivos);
//   · nenhuma resposta às objeções que travam a compra em silêncio;
//   · e tudo com o mesmo peso visual — caixa cinzenta arredondada, dez vezes
//     seguidas — por isso o olho não tinha onde parar e não ficava com nada.
//
// ─── A ORDEM, QUE NÃO É ARBITRÁRIA ──────────────────────────────────────────
//
//  1. A dobra: o argumento que nenhum concorrente consegue copiar — isto foi
//     feito por um gestor de frota para a frota dele.
//  2. Os dois casos: quem tem 5 carros e quem tem 25 não têm o mesmo
//     problema. É aqui que a pessoa se reconhece, e antes disso nada do que
//     dissermos lhe serve.
//  3. Os ecrãs: ver o produto. Tão cedo quanto possível.
//  4. O Excel contra isto: o argumento todo numa tabela que se lê de relance.
//  5. As horas: a conta que ele faz a si próprio, com os números dele.
//  6. Quem sou eu: a confiança, imediatamente antes do preço.
//  7. Os preços, com o primeiro mês grátis.
//  8. As perguntas: as sete objeções, respondidas. É aqui que fecha.
//  9. Os três passos, para a decisão parecer pequena.
// 10. O contacto.
//
// ─── O QUE ESTA PÁGINA JÁ NÃO DIZ ───────────────────────────────────────────
//
// Saiu o cartaz «Os teus dados são só teus», com escudo e tudo. O isolamento
// entre frotas é o que se espera de qualquer sistema, não é uma vantagem — e
// anunciá-lo em letras grandes é pôr na cabeça do comprador uma dúvida que
// ele não tinha. Passou a ser uma resposta nas perguntas frequentes, onde
// serve a quem de facto pergunta.
//
// Saiu também o selo «Mais escolhido» do plano do meio: sem clientes
// pagantes, era falso numa página pública. Ficou «Recomendado», que é uma
// opinião e não um facto inventado.
//
// ─── OS PREÇOS VÊM DA BASE DE DADOS ─────────────────────────────────────────
//
// Dos planos activos do painel do dono. Mudas lá, muda aqui — não há uma
// segunda lista de preços neste ficheiro a divergir daquela, que é como um
// site acaba a anunciar um valor que já não se pratica.

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Building2, CheckCircle2, Gift, MessageCircle, Minus, PlayCircle,
} from 'lucide-react';
import {
  TopoPublico, RodapePublico, Seccao, TituloDaSeccao,
  BotaoPrincipal, BotaoSecundario, Selo, linkWhatsApp, VERDE,
} from '../components/Chrome';
import { FormularioContacto } from '../components/FormularioContacto';
import { Ecras } from '../components/Ecras';
import { CalculadoraHoras } from '../components/CalculadoraHoras';
import { Perguntas } from '../components/Perguntas';
import {
  GESTORES, MENSAGEM_WHATSAPP, CONTACTO, DEMONSTRACAO,
} from '../conteudo';
import { leadsService } from '../services/leads.service';
import { escadaDePlanos } from '../escada';

function duracao(dias: number): string {
  if (dias === 30) return '/mês';
  if (dias === 90) return '/trimestre';
  if (dias === 180) return '/semestre';
  if (dias === 365) return '/ano';
  return `/${dias} dias`;
}

function euros(texto: string): string {
  const n = Number(texto);
  if (!Number.isFinite(n)) return texto;
  // Sem cêntimos quando são zero: "49 €" lê-se melhor do que "49,00 €" numa
  // tabela de preços, e com cêntimos quando os há, porque aí são o preço.
  return n % 1 === 0
    ? `${n.toLocaleString('pt-PT')} €`
    : n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

export function GestoresPage() {
  const whatsapp = linkWhatsApp(MENSAGEM_WHATSAPP.gestor);

  const { data, isLoading } = useQuery({
    queryKey: ['publico', 'planos'],
    queryFn: () => leadsService.planos(),
    staleTime: 10 * 60 * 1000,
  });
  const planos = data?.planos ?? [];
  // Cada degrau sabe o que acrescenta ao anterior — e sabe também quando NÃO
  // pode dizer que o contém todo. Ver `escada.ts`.
  const degraus = escadaDePlanos(planos);

  return (
    <div className="min-h-screen bg-[#07100d]">
      <TopoPublico voltar />

      {/* ══ 1. A DOBRA ══
          O título não é «recupera os teus sábados» (uma promessa, igual a
          todas as outras) mas «fiz isto para a minha frota» (um facto que
          nenhuma empresa de software consegue dizer). */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-40 -top-20 h-[30rem] w-[30rem]
            rounded-full opacity-20 blur-3xl"
          style={{ background: VERDE }}
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center gap-2 rounded-full border border-white/15
                px-4 py-1.5 text-sm text-white/70"
            >
              <Building2 className="h-4 w-4" style={{ color: VERDE }} />
              Para gestores de frota
            </div>
            <Selo>
              <Gift className="h-4 w-4" />
              Primeiro mês grátis
            </Selo>
          </div>

          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.1] text-white sm:text-6xl">
            Fiz isto para a minha frota.
            <br />
            <span style={{ color: VERDE }}>Agora também serve a tua.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-white/60 sm:text-xl">
            Fechos semanais, documentos a expirar, retiradas, oficina e recibos
            verdes — num sítio só. Não é software de uma empresa de software: é
            a ferramenta que uso todas as semanas para gerir a minha frota TVDE.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            {/* Quando a conta de demonstração existir, o botão de entrar passa
                a ser o principal: clicar e ver vale mais do que ler preços.
                Até lá nem aparece — ver a nota em conteudo.ts. */}
            {DEMONSTRACAO.activa ? (
              <>
                <BotaoPrincipal href={DEMONSTRACAO.url}>
                  <PlayCircle className="h-5 w-5" />
                  Entrar e experimentar
                </BotaoPrincipal>
                <BotaoSecundario href="#planos">Ver planos e preços</BotaoSecundario>
              </>
            ) : (
              <>
                <BotaoPrincipal href="#planos">
                  Ver planos e preços
                  <ArrowRight className="h-5 w-5" />
                </BotaoPrincipal>
                <BotaoSecundario href={whatsapp}>
                  <MessageCircle className="h-5 w-5" />
                  Falar no WhatsApp
                </BotaoSecundario>
              </>
            )}
          </div>

          {DEMONSTRACAO.activa && (
            <p className="mt-4 text-sm text-white/40">{DEMONSTRACAO.nota}</p>
          )}
        </div>
      </section>

      {/* ══ 2. OS DOIS CASOS ══
          A primeira linha de cada cartão é o tamanho da frota, e não uma
          vantagem: a pessoa tem de se reconhecer antes de nos ouvir. */}
      <Seccao fundo="menos-escuro">
        <TituloDaSeccao
          sobretitulo="Em que caso te encaixas"
          titulo="O teu problema depende do tamanho da frota"
          texto="Quem tem cinco carros não tem tempo. Quem tem vinte e cinco não tem visibilidade. O sistema serve os dois — por razões diferentes."
        />

        <div className="grid gap-5 md:grid-cols-2">
          {GESTORES.casos.map((c) => (
            <div
              key={c.tamanho}
              className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-7"
            >
              <p
                className="text-sm font-semibold uppercase tracking-wider"
                style={{ color: VERDE }}
              >
                {c.tamanho}
              </p>
              <h3 className="mt-2 text-2xl font-bold text-white">{c.titulo}</h3>
              <p className="mt-3 text-white/60">{c.resumo}</p>

              <ul className="mt-6 flex-1 space-y-3">
                {c.pontos.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-white/80">
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 shrink-0"
                      style={{ color: VERDE }}
                      aria-hidden="true"
                    />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>

              <p
                className="mt-6 border-t border-white/10 pt-5 text-lg font-semibold"
                style={{ color: VERDE }}
              >
                {c.ganho}
              </p>
            </div>
          ))}
        </div>
      </Seccao>

      {/* ══ 3. OS ECRÃS ══
          A mudança que vale mais do que todas as outras juntas. */}
      <Seccao>
        <TituloDaSeccao
          sobretitulo="Por dentro"
          titulo="Vê o sistema antes de falares com alguém"
          texto="Sem demonstração marcada e sem deixar o contacto. São os ecrãs que uso na minha frota."
        />
        <Ecras ecras={GESTORES.ecras} />
      </Seccao>

      {/* ══ 4. O EXCEL CONTRA ISTO ══
          O argumento inteiro numa tabela. O «hoje» é escrito sem desprezo: o
          Excel não é estupidez, é o que funciona até deixar de funcionar. */}
      <Seccao fundo="menos-escuro">
        <TituloDaSeccao
          sobretitulo="Antes e depois"
          titulo="O que muda na prática"
          texto="À esquerda, como é hoje em quase todas as frotas. À direita, o que o sistema faz em vez disso."
        />

        <div className="overflow-hidden rounded-2xl border border-white/10">
          {/* O cabeçalho só aparece em ecrã largo: no telemóvel, duas colunas
              com título em cima e sete linhas por baixo deixam de se perceber
              a meio da tabela, e cada linha passa a trazer o seu rótulo. */}
          <div
            className="hidden grid-cols-[1fr_1.2fr_1.2fr] gap-4 border-b border-white/10
              bg-black/30 px-6 py-4 text-sm font-semibold uppercase tracking-wider
              text-white/40 md:grid"
          >
            <span />
            <span>Com Excel e WhatsApp</span>
            <span style={{ color: VERDE }}>Com a DragonFleet</span>
          </div>

          {GESTORES.comparacao.map((l, i) => (
            <div
              key={l.assunto}
              className={`gap-4 px-6 py-5 md:grid md:grid-cols-[1fr_1.2fr_1.2fr] ${
                i % 2 === 0 ? 'bg-white/[0.03]' : ''
              }`}
            >
              <p className="font-semibold text-white">{l.assunto}</p>

              <div className="mt-3 flex items-start gap-2.5 md:mt-0">
                <Minus className="mt-1 h-4 w-4 shrink-0 text-white/25" aria-hidden="true" />
                <p className="text-white/45">
                  <span className="mr-1 text-xs uppercase tracking-wider text-white/30 md:hidden">
                    Hoje ·
                  </span>
                  {l.hoje}
                </p>
              </div>

              <div className="mt-2 flex items-start gap-2.5 md:mt-0">
                <CheckCircle2
                  className="mt-1 h-4 w-4 shrink-0"
                  style={{ color: VERDE }}
                  aria-hidden="true"
                />
                <p className="text-white">
                  <span
                    className="mr-1 text-xs uppercase tracking-wider md:hidden"
                    style={{ color: VERDE }}
                  >
                    Agora ·
                  </span>
                  {l.agora}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Seccao>

      {/* ══ 5. AS HORAS ══
          Os números são todos dele. Ver a nota em CalculadoraHoras.tsx sobre
          a razão por que esta calculadora não fala de carros parados. */}
      <Seccao>
        <TituloDaSeccao
          sobretitulo="A tua conta"
          titulo="Quantos dias por ano é que isto te leva"
          texto="Sem estimativas nossas: mete as tuas horas e faz a conta tu."
        />
        <div className="mx-auto max-w-2xl">
          <CalculadoraHoras />
        </div>
      </Seccao>

      {/* ══ 6. QUEM SOU EU ══
          Imediatamente antes do preço, que é o momento em que a pergunta «e
          posso confiar neste tipo?» fica à frente de todas as outras. */}
      <Seccao fundo="menos-escuro">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p
              className="text-sm font-semibold uppercase tracking-wider"
              style={{ color: VERDE }}
            >
              Quem está por trás
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl">
              {GESTORES.operador.titulo}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-white/60">
              {GESTORES.operador.texto}
            </p>
            <p className="mt-6 font-semibold text-white">
              Diogo Isaías
              <span className="font-normal text-white/50"> · Chromatic Dragon</span>
            </p>
          </div>

          <div className="space-y-4">
            {GESTORES.operador.pontos.map((p) => (
              <div key={p.titulo} className="rounded-xl border border-white/10 bg-white/5 p-6">
                <h3 className="font-semibold text-white">{p.titulo}</h3>
                <p className="mt-2 text-white/60">{p.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </Seccao>

      {/* ══ 7. OS PLANOS ══ */}
      <Seccao id="planos">
        <TituloDaSeccao
          sobretitulo="Planos"
          titulo="Preço à vista, primeiro mês grátis"
          texto="Usas um mês com a tua frota verdadeira. Se não resolver, não pagas e não há nada a cancelar."
        />

        {isLoading && (
          <p className="text-center text-white/40">A carregar os planos…</p>
        )}

        {!isLoading && planos.length === 0 && (
          <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-white">Fala connosco para uma proposta.</p>
            <p className="mt-2 text-sm text-white/60">
              Montamos o plano a partir do que a tua frota precisa.
            </p>
            <div className="mt-6">
              <BotaoPrincipal href={whatsapp}>
                <MessageCircle className="h-5 w-5" />
                Pedir proposta
              </BotaoPrincipal>
            </div>
          </div>
        )}

        {planos.length > 0 && (
          /* ─── UM PLANO SÓ NÃO PODE FICAR NUMA GRELHA DE TRÊS ──────────────
             Com três colunas fixas e um plano activo, o cartão ficava
             encostado à esquerda com dois terços de preto ao lado: lia-se
             como se faltasse alguma coisa, mesmo estando tudo lá. Vi-o
             assim no site.

             Um plano fica centrado e estreito; dois ficam centrados a par;
             três ou mais enchem a grelha. */
          <div className={`grid gap-5 ${
            planos.length >= 3
              ? 'md:grid-cols-2 lg:grid-cols-3'
              : planos.length === 2
                ? 'mx-auto max-w-3xl md:grid-cols-2'
                : 'mx-auto max-w-sm'
          }`}
          >
            {degraus.map((degrau, i) => {
              const p = degrau.plano;
              // O do meio em destaque quando são três — é onde o olho cai, e
              // é onde costuma estar o plano que se quer vender. Com um ou
              // dois planos não há meio, e nenhum fica em destaque.
              //
              // O meio da ESCADA (ordenada por preço), e não o meio da lista
              // que veio do servidor: se os planos chegassem por ordem de
              // criação, o destaque caía no plano errado.
              const destaque = degraus.length >= 3 && i === 1;

              return (
                <div
                  key={p.id}
                  className={`relative flex flex-col rounded-2xl border p-7 ${
                    destaque
                      ? 'border-[#108865] bg-[#108865]/10'
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  {destaque && (
                    <span
                      className="absolute -top-3 left-7 rounded-full px-3 py-1 text-xs font-semibold text-white"
                      style={{ background: VERDE }}
                    >
                      Recomendado
                    </span>
                  )}

                  <h3 className="text-xl font-bold text-white">{p.nome}</h3>

                  <p className="mt-3">
                    <span className="text-4xl font-bold text-white">{euros(p.preco)}</span>
                    <span className="text-white/50">{duracao(p.duracaoDias)}</span>
                  </p>

                  {/* A oferta repetida em cada cartão, porque é no cartão que
                      a decisão de preço se toma — e quem salta directo para
                      aqui não leu o selo da dobra. */}
                  <p className="mt-2 text-sm font-medium" style={{ color: VERDE }}>
                    Primeiro mês grátis
                  </p>

                  {/* Só o que este degrau acrescenta. Três linhas em vez de
                      dezanove: a diferença entre os planos passa a ver-se de
                      relance, que é a decisão que a pessoa veio tomar aqui.

                      Quando `herdaDe` é nulo, este plano não contém o anterior
                      todo e a lista completa volta — ver a nota em `escada.ts`
                      sobre porque é que a frase tem de ser verificada. */}
                  {degrau.herdaDe && (
                    <p className="mt-5 text-sm font-medium text-white/70">
                      Tudo o do <span className="text-white">{degrau.herdaDe}</span>, mais:
                    </p>
                  )}

                  <ul className={`flex-1 space-y-2.5 ${degrau.herdaDe ? 'mt-3' : 'mt-6'}`}>
                    {degrau.mostrar.map((f) => (
                      <li key={f.codigo} className="flex items-start gap-2.5 text-sm text-white/80">
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0"
                          style={{ color: VERDE }}
                          aria-hidden="true"
                        />
                        {f.nome}
                      </li>
                    ))}
                  </ul>

                  <a
                    href={linkWhatsApp(
                      `${MENSAGEM_WHATSAPP.gestor} Interessa-me o plano ${p.nome}.`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-7 rounded-xl px-5 py-3 text-center font-semibold transition
                      active:scale-[0.98] ${
                      destaque
                        ? 'text-white hover:brightness-110'
                        : 'border border-white/20 text-white hover:bg-white/10'
                    }`}
                    style={destaque ? { background: VERDE } : undefined}
                  >
                    Começar o mês grátis
                  </a>
                </div>
              );
            })}
          </div>
        )}

        {/* O que vai em todos. Por baixo dos cartões e não dentro de cada um:
            repetido três vezes, deixava de se ler e empurrava o que distingue
            os planos para fora do ecrã. */}
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {GESTORES.base.map((b) => (
            <div key={b} className="flex items-start gap-3 text-white/70">
              <CheckCircle2
                className="mt-0.5 h-5 w-5 shrink-0"
                style={{ color: VERDE }}
                aria-hidden="true"
              />
              <span>{b}</span>
            </div>
          ))}
        </div>
      </Seccao>

      {/* ══ 8. AS PERGUNTAS ══
          Onde a venda fecha. Ver a nota em Perguntas.tsx. */}
      <Seccao fundo="menos-escuro">
        <TituloDaSeccao
          sobretitulo="Perguntas"
          titulo="O que normalmente me perguntam"
          texto="Incluindo as que são difíceis de responder. Se faltar alguma, pergunta-me."
        />
        <Perguntas perguntas={GESTORES.perguntas} />
      </Seccao>

      {/* ══ 9. OS TRÊS PASSOS ══ */}
      <Seccao>
        <TituloDaSeccao sobretitulo="Como começas" titulo="Três passos, e o primeiro é uma conversa" />

        <div className="grid gap-5 md:grid-cols-3">
          {GESTORES.passos.map((p, i) => (
            <div key={p.titulo} className="rounded-xl border border-white/10 bg-white/5 p-6">
              <span
                className="text-4xl font-bold leading-none"
                style={{ color: 'rgba(16,136,101,0.35)' }}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold text-white">{p.titulo}</h3>
              <p className="mt-1 text-sm text-white/60">{p.texto}</p>
            </div>
          ))}
        </div>
      </Seccao>

      {/* ══ 10. O CONTACTO ══ */}
      <Seccao id="contacto" fundo="menos-escuro">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Começa o mês grátis
            </h2>
            <p className="mt-4 text-lg text-white/60">
              Quinze minutos ao telefone para eu perceber como trabalhas, e
              montamos a tua frota no mesmo dia. Se não te servir, digo-te —
              não te vendo um plano que não vais usar.
            </p>

            <div className="mt-8">
              <BotaoPrincipal href={whatsapp}>
                <MessageCircle className="h-5 w-5" />
                WhatsApp
              </BotaoPrincipal>
            </div>

            <p className="mt-4 text-sm text-white/40">
              Ou liga: {CONTACTO.telefoneVisivel}
            </p>
          </div>

          <FormularioContacto
            tipo="GESTOR"
            titulo="Quero o mês grátis"
            subtitulo="Deixa o contacto e ligo-te eu."
          />
        </div>
      </Seccao>

      <RodapePublico />
    </div>
  );
}
