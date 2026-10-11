// src/features/landing/pages/GestoresPage.tsx
//
// A página para quem gere uma frota.
//
// ─── O ARGUMENTO ────────────────────────────────────────────────────────────
//
// Não é "temos muitas funcionalidades". É "conheço o teu sábado". Quem gere
// uma frota TVDE em Portugal perde sábados num Excel a fechar contas, e
// descobre que um seguro expirou no dia em que o carro é parado. A página
// nomeia essas dores uma a uma — e a seguir a cada uma diz o que o sistema
// faz em vez disso.
//
// Isto só funciona porque é verdade: cada par problema/solução corresponde a
// um ecrã que existe. Uma lista de promessas genéricas lê-se como as outras
// todas, e esta tem de se distinguir das outras todas.
//
// ─── OS PREÇOS VÊM DA BASE DE DADOS ─────────────────────────────────────────
//
// Dos planos activos do painel do dono. Mudas lá, muda aqui — não há uma
// segunda lista de preços neste ficheiro a divergir daquela, que é como um
// site acaba a anunciar um valor que já não se pratica.

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Building2, CheckCircle2, MessageCircle, ShieldCheck, X,
} from 'lucide-react';
import {
  TopoPublico, RodapePublico, Seccao, TituloDaSeccao,
  BotaoPrincipal, BotaoSecundario, linkWhatsApp, VERDE,
} from '../components/Chrome';
import { FormularioContacto } from '../components/FormularioContacto';
import { GESTORES, MENSAGEM_WHATSAPP, CONTACTO } from '../conteudo';
import { leadsService } from '../services/leads.service';

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

  return (
    <div className="min-h-screen bg-[#07100d]">
      <TopoPublico voltar />

      {/* ── A dobra ── */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-40 -top-20 h-[30rem] w-[30rem]
            rounded-full opacity-20 blur-3xl"
          style={{ background: VERDE }}
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-white/15
              px-4 py-1.5 text-sm text-white/70"
          >
            <Building2 className="h-4 w-4" style={{ color: VERDE }} />
            Para gestores de frota
          </div>

          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.1] text-white sm:text-6xl">
            Recupera os teus
            <br />
            <span style={{ color: VERDE }}>sábados.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg text-white/60 sm:text-xl">
            Fechos semanais, documentos a expirar, retiradas, oficina e recibos
            verdes. Tudo num sítio — e construído por quem gere uma frota TVDE
            todos os dias.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <BotaoPrincipal href="#planos">
              Ver planos e preços
              <ArrowRight className="h-5 w-5" />
            </BotaoPrincipal>
            <BotaoSecundario href={whatsapp}>
              <MessageCircle className="h-5 w-5" />
              Falar no WhatsApp
            </BotaoSecundario>
          </div>
        </div>
      </section>

      {/* ── As dores ──
          Problema em cima, o que o sistema faz por baixo. Lado a lado, lê-se
          como uma conversa com alguém que já passou por aquilo — que é
          exactamente o que é. */}
      <Seccao fundo="menos-escuro">
        <TituloDaSeccao
          sobretitulo="O teu dia a dia"
          titulo="Conhecemos o problema porque é o nosso"
          texto="Não foi desenhado numa reunião. Foi desenhado a resolver isto, semana a semana."
        />

        <div className="space-y-4">
          {GESTORES.dores.map((d) => (
            <div
              key={d.problema}
              className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 md:grid-cols-2 md:gap-8"
            >
              <div className="flex items-start gap-3">
                <X className="mt-0.5 h-5 w-5 shrink-0 text-red-400/70" aria-hidden="true" />
                <p className="text-white/50 line-through decoration-white/20">{d.problema}</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0"
                  style={{ color: VERDE }}
                  aria-hidden="true"
                />
                <p className="text-white">{d.solucao}</p>
              </div>
            </div>
          ))}
        </div>
      </Seccao>

      {/* ── O isolamento ──
          A primeira pergunta de qualquer gestor que considere pôr os dados da
          empresa dele num sistema de outra pessoa. Responder antes de ser
          perguntado vale mais do que responder bem depois. */}
      <Seccao>
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <ShieldCheck className="mx-auto h-10 w-10" style={{ color: VERDE }} />
          <h2 className="mt-4 text-2xl font-bold text-white">
            Os teus dados são só teus
          </h2>
          <p className="mt-3 text-white/60">
            Cada frota está isolada na base de dados, e o sistema é construído
            de forma a que uma consulta que não diga a que frota pertence
            simplesmente falha — em vez de devolver os dados de outra pessoa.
            É a parte que não se vê, e é a que mais nos custou a fazer bem.
          </p>
        </div>
      </Seccao>

      {/* ── Os planos ── */}
      <Seccao id="planos" fundo="menos-escuro">
        <TituloDaSeccao
          sobretitulo="Planos"
          titulo="Escolhe o que precisas"
          texto="Pagas pelo que usas. Precisas de outra coisa? Fazemos um plano à medida."
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
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {planos.map((p, i) => {
              // O do meio em destaque quando são três — é onde o olho cai, e
              // é onde costuma estar o plano que se quer vender. Com um ou
              // dois planos não há meio, e nenhum fica em destaque.
              const destaque = planos.length >= 3 && i === 1;

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
                      Mais escolhido
                    </span>
                  )}

                  <h3 className="text-xl font-bold text-white">{p.nome}</h3>

                  <p className="mt-3">
                    <span className="text-4xl font-bold text-white">{euros(p.preco)}</span>
                    <span className="text-white/50">{duracao(p.duracaoDias)}</span>
                  </p>

                  <ul className="mt-6 flex-1 space-y-2.5">
                    {p.inclui.map((f) => (
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
                    Quero este plano
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

      {/* ── O contacto ── */}
      <Seccao id="contacto">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Mostramos-te a funcionar
            </h2>
            <p className="mt-4 text-lg text-white/60">
              Quinze minutos ao telefone, com o painel aberto. Vês a tua frota
              lá dentro antes de decidires alguma coisa.
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
            titulo="Quero ver a plataforma"
            subtitulo="Deixa o contacto e combinamos."
          />
        </div>
      </Seccao>

      <RodapePublico />
    </div>
  );
}
