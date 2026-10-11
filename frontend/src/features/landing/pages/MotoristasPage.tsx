// src/features/landing/pages/MotoristasPage.tsx
//
// A página para quem quer conduzir.
//
// ─── O QUE ESTA PÁGINA PODE E NÃO PODE PROMETER ─────────────────────────────
//
// Não há aqui um único número de rendimento, e isso é deliberado. "Ganha até
// X por mês" é uma promessa a sério: depende das horas, da zona, da época e
// do carro, e quem a lê lembra-se dela quando a primeira semana corre mal.
// Promete-se o que se controla — o carro, as condições, a papelada tratada,
// a app — e esses são factos, não previsões.
//
// Os números que FALTAM (aluguer, comissão) estão em `conteudo.ts`, marcados
// com «aspas destas». São do Diogo e só ele os sabe.
//
// ─── A ORDEM DA PÁGINA ──────────────────────────────────────────────────────
//
// 1. A dobra: uma frase e um botão. Quem já decidiu não precisa de ler mais.
// 2. Os dois caminhos: com carro, sem carro. É aqui que a pessoa se reconhece.
// 3. O que a app faz por ele — a parte verificável, e o que nos distingue de
//    um anúncio no OLX.
// 4. Os passos, para a decisão parecer pequena.
// 5. O formulário. No fim, porque quem chega aqui já está convencido; e
//    também no topo, em botão, para quem não precisava de nada disto.

import { Car, CheckCircle2, MessageCircle } from 'lucide-react';
import {
  TopoPublico, RodapePublico, Seccao, TituloDaSeccao,
  BotaoPrincipal, BotaoSecundario, linkWhatsApp, VERDE,
} from '../components/Chrome';
import { FormularioContacto } from '../components/FormularioContacto';
import { Calculadora } from '../components/Calculadora';
import { MOTORISTAS, MENSAGEM_WHATSAPP, CONTACTO } from '../conteudo';

export function MotoristasPage() {
  const whatsapp = linkWhatsApp(MENSAGEM_WHATSAPP.motorista);

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
            <Car className="h-4 w-4" style={{ color: VERDE }} />
            Para motoristas
          </div>

          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.1] text-white sm:text-6xl">
            Conduz.
            <br />
            <span style={{ color: VERDE }}>Do resto tratamos nós.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg text-white/60 sm:text-xl">
            Licenças, contratos, faturas, Uber e Bolt. Tu pões-te ao volante e
            vês o teu dinheiro na app — ao cêntimo, sem perguntar a ninguém.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <BotaoPrincipal href={whatsapp}>
              <MessageCircle className="h-5 w-5" />
              Falar agora no WhatsApp
            </BotaoPrincipal>
            <BotaoSecundario href="#contacto">Deixar o meu contacto</BotaoSecundario>
          </div>

          <p className="mt-4 text-sm text-white/40">
            Ou liga: {CONTACTO.telefoneVisivel}
          </p>
        </div>
      </section>

      {/* ── Os dois caminhos ── */}
      <Seccao fundo="menos-escuro">
        <TituloDaSeccao
          sobretitulo="Dois caminhos"
          titulo="Com carro ou sem carro"
          texto="Os dois servem. O que muda são as condições — e essas falamos ao telefone."
        />

        <div className="grid gap-5 md:grid-cols-2">
          {MOTORISTAS.caminhos.map((c) => (
            <div
              key={c.titulo}
              className="rounded-2xl border border-white/10 bg-white/5 p-7"
            >
              <h3 className="text-2xl font-bold text-white">{c.titulo}</h3>
              <p className="mt-2 text-white/60">{c.resumo}</p>

              <ul className="mt-6 space-y-3">
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
            </div>
          ))}
        </div>
      </Seccao>

      {/* ── A calculadora ──
          A seguir aos dois caminhos e antes da app: quem acabou de se
          reconhecer num dos casos tem a seguir a pergunta do dinheiro, e é
          melhor respondê-la com uma conta aberta do que deixá-la a adivinhar
          até ao telefonema. */}
      <Seccao>
        <TituloDaSeccao
          sobretitulo="As contas"
          titulo="Ganhas o que trabalhares"
          texto="Não há ordenado fixo. Há condições claras — e podes vê-las aqui antes de falar connosco."
        />
        <div className="mx-auto max-w-2xl">
          <Calculadora />
        </div>
      </Seccao>

      {/* ── A app ──
          É a parte que nos distingue de um anúncio no OLX, e a única em que
          se pode ser concreto sem prometer rendimentos. */}
      <Seccao fundo="menos-escuro">
        <TituloDaSeccao
          sobretitulo="A aplicação"
          titulo="Nunca mais perguntas quanto tens a receber"
          texto="Está tudo no telemóvel, actualizado, e com o porquê de cada linha."
        />

        <div className="grid gap-5 sm:grid-cols-2">
          {MOTORISTAS.plataforma.map((f) => (
            <div key={f.titulo} className="rounded-xl border border-white/10 bg-white/5 p-6">
              <h3 className="font-semibold text-white">{f.titulo}</h3>
              <p className="mt-2 text-white/60">{f.texto}</p>
            </div>
          ))}
        </div>
      </Seccao>

      {/* ── Os passos ── */}
      <Seccao>
        <TituloDaSeccao sobretitulo="Como é" titulo="Quatro passos" />

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {MOTORISTAS.passos.map((p, i) => (
            <div key={p.titulo} className="relative rounded-xl border border-white/10 bg-white/5 p-6">
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

      {/* ── O contacto ── */}
      <Seccao id="contacto">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Vamos falar?
            </h2>
            <p className="mt-4 text-lg text-white/60">
              Deixa o contacto e ligamos-te. Ou manda mensagem já, se tiveres
              pressa — é mais rápido.
            </p>

            <div className="mt-8">
              <BotaoPrincipal href={whatsapp}>
                <MessageCircle className="h-5 w-5" />
                WhatsApp
              </BotaoPrincipal>
            </div>
          </div>

          <FormularioContacto
            tipo="MOTORISTA"
            titulo="Quero conduzir"
            subtitulo="Dois campos. O resto falamos."
          />
        </div>
      </Seccao>

      <RodapePublico />
    </div>
  );
}
