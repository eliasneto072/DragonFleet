// src/features/invest/components/project-timeline.tsx
//
// O diário de bordo de um projeto, visto pelo investidor.
//
// ─── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
//
// Entre o financiamento fechar e o carro render passam semanas. Nesse tempo o
// investidor tem dinheiro parado num projeto que não distribui nada, e a única
// forma de saber o que se passa é telefonar. É esse telefonema que isto
// substitui.
//
// ─── DUAS PEÇAS, DUAS PERGUNTAS ─────────────────────────────────────────────
//
// A ESCADA responde a "onde estamos" de relance: oito degraus, os cumpridos
// acesos. A LINHA DO TEMPO responde a "o que aconteceu e quando" — com datas,
// porque um projeto parado há três semanas não se distingue de um que anda
// depressa se não houver datas ao lado.
//
// A escada mostra só as etapas que marcam avanço. Uma avaria ou uma multa
// aparecem na linha do tempo mas não são degraus: contá-las faria um projeto
// com um problema parecer mais adiantado do que está.

import {
  ESCADA, NOME_DA_ETAPA, type ProjectUpdate, type UpdateStage,
} from '@/shared/services/projects.service';
import { Check, CircleDot, Wrench, AlertTriangle, FileText } from 'lucide-react';
import { dia } from './invest-bits';

/** As etapas que já foram registadas neste projeto. */
function etapasFeitas(updates: ProjectUpdate[]): Set<UpdateStage> {
  return new Set(updates.map((u) => u.stage));
}

export function ProjectLadder({ updates }: { updates: ProjectUpdate[] }) {
  const feitas = etapasFeitas(updates);
  const cumpridos = ESCADA.filter((e) => feitas.has(e)).length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="inv-label">Onde estamos</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {cumpridos} de {ESCADA.length}
        </p>
      </div>

      <ol className="mt-4 space-y-0">
        {ESCADA.map((etapa, i) => {
          const feito = feitas.has(etapa);
          // O degrau atual: o primeiro por cumprir a seguir aos cumpridos.
          const atual = !feito && ESCADA.slice(0, i).every((e) => feitas.has(e));

          return (
            <li key={etapa} className="flex gap-3">
              {/* A coluna do risco vertical. O último não leva risco, senão
                  ficava uma linha a apontar para o nada. */}
              <div className="flex flex-col items-center">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px]"
                  style={{
                    borderColor: feito ? 'rgba(201,162,39,0.55)' : 'var(--border)',
                    background: feito ? 'rgba(201,162,39,0.14)' : 'transparent',
                    color: feito ? 'var(--gold-200)' : 'var(--muted-foreground)',
                  }}
                  aria-hidden="true"
                >
                  {feito ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {i < ESCADA.length - 1 && (
                  <span
                    className="w-px flex-1"
                    style={{
                      minHeight: '1.25rem',
                      background: feito ? 'rgba(201,162,39,0.35)' : 'var(--border)',
                    }}
                  />
                )}
              </div>

              <p
                className={`pb-4 text-sm ${atual ? 'font-medium' : ''}`}
                style={{
                  color: feito
                    ? 'var(--foreground)'
                    : atual
                      ? 'var(--gold-200)'
                      : 'var(--muted-foreground)',
                }}
              >
                {NOME_DA_ETAPA[etapa]}
                {atual && (
                  <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">
                    a decorrer
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function IconeDaEtapa({ stage }: { stage: UpdateStage }) {
  const Icon = stage === 'MAINTENANCE' ? Wrench
    : stage === 'INCIDENT' ? AlertTriangle
      : stage === 'OTHER' ? FileText
        : CircleDot;
  return <Icon className="h-3.5 w-3.5" aria-hidden="true" />;
}

export function ProjectTimeline({ updates }: { updates: ProjectUpdate[] }) {
  if (updates.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Ainda não há novidades neste projeto. Assim que houver, aparecem aqui e
        recebe um aviso.
      </p>
    );
  }

  return (
    <ol className="space-y-0">
      {updates.map((u, i) => (
        <li key={u.id} className="flex gap-4">
          <div className="flex flex-col items-center pt-1">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
              style={{
                borderColor: 'rgba(201,162,39,0.35)',
                background: 'rgba(201,162,39,0.10)',
                color: 'var(--gold-200)',
              }}
            >
              <IconeDaEtapa stage={u.stage} />
            </span>
            {i < updates.length - 1 && (
              <span className="w-px flex-1" style={{ background: 'var(--border)' }} />
            )}
          </div>

          <div className="min-w-0 flex-1 pb-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{u.title}</p>
              <p className="text-[11px] text-[var(--muted-foreground)]">{dia(u.happenedOn)}</p>
            </div>

            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
              {NOME_DA_ETAPA[u.stage]}
            </p>

            {u.body && (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--muted-foreground)]">
                {u.body}
              </p>
            )}

            {u.imageUrl && (
              <img
                src={u.imageUrl}
                alt={u.title}
                loading="lazy"
                className="mt-3 max-h-64 w-full rounded-lg object-cover"
                style={{ border: '1px solid var(--border)' }}
              />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
