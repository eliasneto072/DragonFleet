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

/**
 * Enquanto a imagem vem.
 *
 * Neutro de propósito: uma caixa escura com um brilho a passar. NÃO diz que
 * falta nada, porque nesse instante não falta — está a caminho.
 */
function ACarregar() {
  return (
    <div className="absolute inset-0 animate-pulse bg-white/[0.04]" aria-hidden="true" />
  );
}

/** Quando a imagem não existe mesmo. Só depois de o navegador desistir. */
function PorPreencher({ ficheiro }: { ficheiro: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <ImageOff className="h-7 w-7 text-white/25" aria-hidden="true" />
      <p className="text-sm font-medium text-white/50">Falta esta captura de ecrã</p>
      <code className="rounded-md bg-black/50 px-2.5 py-1 text-xs text-white/40">
        public/ecras/{ficheiro}
      </code>
    </div>
  );
}

type Estado = 'a-carregar' | 'pronta' | 'falhou';

function UmEcra({ ecra, invertido, primeira }: {
  ecra: Ecra; invertido: boolean; primeira: boolean;
}) {
  const [estado, setEstado] = useState<Estado>('a-carregar');

  /**
   * Uma segunda tentativa, a saltar a cache do navegador.
   *
   * ─── O CASO QUE ISTO RESOLVE ────────────────────────────────────────────
   *
   * As imagens não vão todas para o site ao mesmo tempo. Quem abrir a página
   * no intervalo em que falta uma recebe um «não existe» — e o navegador
   * guarda essa resposta durante quatro horas. A partir daí, mesmo depois de
   * a imagem estar publicada e a funcionar, aquela pessoa continua a ver o
   * aviso de que falta, porque nem chega a perguntar outra vez.
   *
   * Aconteceu, e a seguir deu uma hora de procura num problema que não
   * existia: o ficheiro estava no sítio, o deploy tinha corrido bem, e só o
   * navegador de quem olhava é que ainda tinha o «não» guardado.
   *
   * Com um parâmetro diferente no endereço, o navegador trata-o como outro
   * ficheiro e vai mesmo buscá-lo. Uma vez só: se a segunda também falhar, é
   * porque falta de verdade, e aí o aviso está certo.
   */
  const [segundaTentativa, setSegundaTentativa] = useState(false);

  function falhou() {
    if (segundaTentativa) setEstado('falhou');
    else setSegundaTentativa(true);
  }

  return (
    <div className="grid items-center gap-8 lg:grid-cols-5 lg:gap-12">
      {/* A imagem ocupa três quintos: é a protagonista, e o texto está ao
          lado para explicar e não para competir. */}
      <div className={`lg:col-span-3 ${invertido ? 'lg:order-2' : ''}`}>
        <Moldura>
          {/* ╔══════════════════════════════════════════════════════════════╗
              ║  TRÊS ESTADOS, TRÊS COISAS DIFERENTES NO ECRÃ                ║
              ╚══════════════════════════════════════════════════════════════╝

              Esta parte esteve errada duas vezes, e das duas o erro foi o
              mesmo: tratar «ainda não chegou» e «não existe» como se fossem
              a mesma coisa.

              Na primeira versão, o aviso aparecia só no `onError`. Mas uma
              imagem com `loading="lazy"` que ainda não foi pedida não dá
              erro nenhum — e nesse tempo a moldura ficava vazia.

              Na segunda, pus o aviso como estado inicial. Pior: as seis
              imagens estavam publicadas e a funcionar, e a página dizia a
              quem a visse «falta esta captura de ecrã» durante todo o tempo
              em que a imagem estava a descarregar. Uma página a acusar-se de
              estar incompleta, sem estar.

              Agora são três estados a sério: um brilho neutro enquanto vem,
              a imagem quando chega, e o aviso SÓ quando o navegador desiste.

              ─── E A CAIXA TEM O TAMANHO CERTO DESDE O INÍCIO ──────────────

              O `aspect-[1562/915]` é a proporção das capturas. Antes a caixa
              tinha 210px de altura à espera e saltava para 420 quando a
              imagem entrava: a página inteira dava um pulo a cada uma, e —
              pior — o carregamento preguiçoso calculava as distâncias com a
              página encolhida a metade, por isso as imagens só começavam a
              vir muito depois de já se estar a olhar para elas.

              A primeira não é preguiçosa: é a que se vê sem descer nada, e
              esperar por ela é esperar à frente de toda a gente. */}
          <div className="relative aspect-[1562/915] bg-black/20">
            {estado === 'a-carregar' && <ACarregar />}
            {estado === 'falhou' && <PorPreencher ficheiro={ecra.ficheiro} />}
            <img
              // A `key` muda com a tentativa para o React trocar mesmo o
              // elemento: mudar só o `src` nem sempre refaz o pedido.
              key={segundaTentativa ? 'outra' : 'primeira'}
              src={`/ecras/${ecra.ficheiro}${segundaTentativa ? '?r=1' : ''}`}
              alt={ecra.titulo}
              loading={primeira ? 'eager' : 'lazy'}
              decoding="async"
              onLoad={() => setEstado('pronta')}
              onError={falhou}
              className={`absolute inset-0 h-full w-full object-contain transition-opacity
                duration-300 ${estado === 'pronta' ? 'opacity-100' : 'opacity-0'}`}
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
        <UmEcra key={e.ficheiro} ecra={e} invertido={i % 2 === 1} primeira={i === 0} />
      ))}
    </div>
  );
}
