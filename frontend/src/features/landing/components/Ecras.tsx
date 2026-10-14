// src/features/landing/components/Ecras.tsx
//
// Os ecrãs do painel, mostrados grandes.
//
// ─── PORQUE É QUE ESTA SECÇÃO VALE MAIS DO QUE AS OUTRAS TODAS ──────────────
//
// Porque antes dela a página pedia à pessoa quinze minutos ao telefone para
// ver o produto. Quase ninguém liga a um desconhecido para ver software: vai-se
// embora, e nós nunca soubemos que esteve aqui.
//
// Quem vende uma ferramenta de trabalho vende o ecrã. O comprador precisa de
// se imaginar a usá-la, e isso não se faz com adjetivos.
//
// ─── O AVISO EM VEZ DO ESPAÇO EM BRANCO ─────────────────────────────────────
//
// As imagens não estão no repositório. Enquanto faltarem, cada uma mostra uma
// caixa a dizer exactamente que ficheiro falta e onde o pôr — em vez de um
// buraco silencioso que se publica sem ninguém reparar.
//
// É a mesma regra do resto do projeto: o que está em falta grita, não se
// esconde. E o aviso é cinzento e discreto de propósito — se por acidente
// chegar a produção, lê-se como um lugar por preencher e não como uma página
// avariada.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { VERDE } from './Chrome';

export interface Ecra {
  ficheiro: string;
  titulo: string;
  texto: string;
}

/** A moldura, para a captura parecer uma janela e não uma imagem solta. */
function Moldura({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/15 bg-[#0b1a15] shadow-2xl">
      {/* A barra de cima. Três círculos e nada mais: dá contexto de "isto é
          uma aplicação" sem imitar um browser concreto. */}
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-black/40 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
      </div>
      {children}
    </div>
  );
}

function PorPreencher({ ficheiro }: { ficheiro: string }) {
  return (
    <div className="flex min-h-[14rem] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <ImageOff className="h-7 w-7 text-white/25" aria-hidden="true" />
      <p className="text-sm font-medium text-white/50">Falta esta captura de ecrã</p>
      <code className="rounded-md bg-black/50 px-2.5 py-1 text-xs text-white/40">
        public/ecras/{ficheiro}
      </code>
    </div>
  );
}

function UmEcra({ ecra, invertido }: { ecra: Ecra; invertido: boolean }) {
  const [carregou, setCarregou] = useState(false);

  return (
    <div className="grid items-center gap-8 lg:grid-cols-5 lg:gap-12">
      {/* A imagem ocupa três quintos: é a protagonista, e o texto está ao
          lado para explicar e não para competir. */}
      <div className={`lg:col-span-3 ${invertido ? 'lg:order-2' : ''}`}>
        <Moldura>
          {/* ─── O AVISO É O ESTADO INICIAL, E NÃO O ESTADO DE ERRO ─────────
              A primeira versão fazia ao contrário: mostrava a imagem e só
              trocava pelo aviso quando o `onError` disparasse. Vi o
              resultado no site: com `loading="lazy"`, uma imagem que ainda
              não foi pedida não dá erro nenhum — e durante esse tempo a
              moldura ficava com a barra de cima e NADA por baixo. Um
              rectângulo vazio, exactamente o espaço em branco calado que
              esta secção foi escrita para evitar.

              Assim o aviso está lá desde o início e só sai quando a imagem
              chegar de facto. Os três estados — por carregar, falhada e
              carregada — ficam cobertos pela mesma linha, e não há instante
              nenhum em que a moldura esteja vazia.

              A imagem fica por cima, invisível e a ocupar a caixa toda, em
              vez de `hidden`: precisa de ter um sítio no ecrã para o
              carregamento preguiçoso saber quando a pedir. */}
          <div className="relative">
            {!carregou && <PorPreencher ficheiro={ecra.ficheiro} />}
            <img
              src={`/ecras/${ecra.ficheiro}`}
              alt={ecra.titulo}
              loading="lazy"
              onLoad={() => setCarregou(true)}
              className={carregou
                ? 'block w-full'
                : 'absolute inset-0 h-full w-full opacity-0'}
            />
          </div>
        </Moldura>
      </div>

      <div className={`lg:col-span-2 ${invertido ? 'lg:order-1' : ''}`}>
        <h3 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
          {ecra.titulo}
        </h3>
        <div className="mt-4 h-0.5 w-10 rounded-full" style={{ background: VERDE }} />
        <p className="mt-4 text-lg leading-relaxed text-white/60">{ecra.texto}</p>
      </div>
    </div>
  );
}

export function Ecras({ ecras }: { ecras: Ecra[] }) {
  return (
    <div className="space-y-20 sm:space-y-28">
      {ecras.map((e, i) => (
        // Alternado: o olho desce em ziguezague em vez de cair a pique por
        // seis blocos iguais, que é o que fazia a página antiga parecer uma
        // lista sem fim.
        <UmEcra key={e.ficheiro} ecra={e} invertido={i % 2 === 1} />
      ))}
    </div>
  );
}
