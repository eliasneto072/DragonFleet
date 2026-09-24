// src/app/components/ui/notification-body.tsx
//
// O corpo de uma notificação, com a forma que o autor lhe deu.
//
// Trabalha sobre os blocos de `notification-format.ts` e não sobre HTML: nada
// do que vem na mensagem chega ao DOM como marcação, por isso não há aqui
// nenhuma porta aberta a HTML injetado num aviso.
//
// ─── O "VER MAIS" ───────────────────────────────────────────────────────────
//
// Um aviso longo numa lista de avisos empurra os outros para fora do ecrã. Mas
// cortar sempre escondia a única frase que interessava nos avisos curtos, que
// são a esmagadora maioria. Por isso só dobra o que é mesmo longo, e o estado
// aberto/fechado é de cada cartão — abrir um não mexe nos outros.

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  analisarMensagem, mensagemEhLonga, partirNegrito, type Bloco,
} from '@/shared/lib/notification-format';
import { cn } from '@/app/components/ui/utils';

function Texto({ texto }: { texto: string }) {
  const pedacos = partirNegrito(texto);
  return (
    <>
      {pedacos.map((p, i) =>
        p.forte
          ? <strong key={i} className="font-semibold text-foreground">{p.texto}</strong>
          : <span key={i}>{p.texto}</span>,
      )}
    </>
  );
}

function Blocos({ blocos }: { blocos: Bloco[] }) {
  return (
    <div className="space-y-2">
      {blocos.map((b, i) => {
        if (b.tipo === 'titulo') {
          return (
            // Sem margem por cima no primeiro: um título logo a seguir ao
            // assunto da notificação não precisa de respirar duas vezes.
            <p key={i} className={cn('font-semibold text-foreground', i > 0 && 'pt-1.5')}>
              <Texto texto={b.texto} />
            </p>
          );
        }
        if (b.tipo === 'lista') {
          return (
            <ul key={i} className="space-y-1">
              {b.itens.map((item, j) => (
                <li key={j} className="flex gap-2">
                  <span aria-hidden="true" className="select-none text-brand-600 dark:text-brand-400">•</span>
                  <span className="min-w-0 flex-1"><Texto texto={item} /></span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          // `whitespace-pre-line` guarda as quebras simples que o autor
          // escreveu dentro do parágrafo — era exatamente isto que o <p> antigo
          // deitava fora.
          <p key={i} className="whitespace-pre-line">
            <Texto texto={b.texto} />
          </p>
        );
      })}
    </div>
  );
}

export function NotificationBody({ texto, dobravel = false, className }: {
  texto: string;
  /** Numa lista, dobra as mensagens longas atrás de um "Ver mais". */
  dobravel?: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const blocos = analisarMensagem(texto);
  if (!blocos.length) return null;

  const dobra = dobravel && !aberto && mensagemEhLonga(texto);

  return (
    <div className={cn('text-sm text-muted-foreground', className)}>
      <div className={cn(dobra && 'relative max-h-24 overflow-hidden')}>
        <Blocos blocos={blocos} />
        {dobra && (
          // O esbatido diz "há mais por baixo" sem ocupar uma linha a dizê-lo.
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"
          />
        )}
      </div>

      {dobravel && mensagemEhLonga(texto) && (
        <button
          type="button"
          // A lista inteira é clicável e abre o movimento; sem isto, carregar
          // em "Ver mais" saltava para outra página em vez de expandir.
          onClick={(e) => { e.stopPropagation(); setAberto((v) => !v); }}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          {aberto ? 'Ver menos' : 'Ver mais'}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', aberto && 'rotate-180')} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
