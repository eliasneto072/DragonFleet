// src/features/landing/components/Perguntas.tsx
//
// As perguntas frequentes.
//
// ─── ISTO NÃO É UM APÊNDICE, É ONDE A VENDA SE FECHA ────────────────────────
//
// Quem chega ao fim de uma página de vendas já quer. O que o trava é uma
// dúvida concreta que ninguém lhe respondeu: "tenho de passar tudo para lá?",
// "e se quiser sair, levo os meus dados?", "quem é este tipo?". Essas
// perguntas fazem-se caladas, e uma página que não lhes responde perde a
// venda sem nunca saber porquê.
//
// Responder honestamente a sete objeções convence mais do que acrescentar
// sete funcionalidades à lista.
//
// ─── PORQUE É QUE ISTO USA <details> E NÃO ESTADO EM REACT ──────────────────
//
// Porque o navegador já sabe fazer isto, e fá-lo melhor: abre e fecha com
// teclado, é lido por leitores de ecrã como o que é, e o texto está no HTML
// mesmo fechado — o que importa para quem procura no Google por uma destas
// perguntas. Uma versão feita à mão com useState dava mais código e menos
// coisas.

import { ChevronDown } from 'lucide-react';
import { VERDE } from './Chrome';

export interface Pergunta {
  pergunta: string;
  resposta: string;
}

export function Perguntas({ perguntas }: { perguntas: Pergunta[] }) {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-white/10 overflow-hidden
      rounded-2xl border border-white/10 bg-white/5"
    >
      {perguntas.map((p) => (
        <details key={p.pergunta} className="group">
          <summary
            className="flex cursor-pointer list-none items-center justify-between gap-4
              px-6 py-5 text-left transition hover:bg-white/5
              [&::-webkit-details-marker]:hidden"
          >
            <span className="font-semibold text-white">{p.pergunta}</span>
            <ChevronDown
              className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
              style={{ color: VERDE }}
              aria-hidden="true"
            />
          </summary>
          <p className="px-6 pb-6 leading-relaxed text-white/60">{p.resposta}</p>
        </details>
      ))}
    </div>
  );
}
