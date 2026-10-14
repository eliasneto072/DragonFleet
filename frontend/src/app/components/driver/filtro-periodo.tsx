// src/app/components/driver/filtro-periodo.tsx
//
// O filtro de período, partilhado pelas telas das finanças pessoais.
//
// ─── PORQUE É QUE O FILTRO É UM COMPONENTE E NÃO ESTÁ EM CADA TELA ──────────
//
// Porque senão as telas discordam. Se cada uma calculasse «este mês» à sua
// maneira, mais cedo ou mais tarde uma incluía o dia 31 e a outra não — e o
// total das despesas deixava de bater com o que a lista mostra, sem nada à
// vista a explicar porquê.
//
// As contas das datas vivem em `periodo.ts`, testadas. Isto é só os botões.

import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { CalendarRange } from 'lucide-react';
import {
  type Preset, type Periodo, periodoDe, descreverPeriodo,
} from '@/features/driver/periodo';

const PRESETS: { chave: Preset; rotulo: string }[] = [
  { chave: 'semana', rotulo: 'Semana' },
  { chave: 'mes', rotulo: 'Mês' },
  { chave: 'ano', rotulo: 'Ano' },
  { chave: 'tudo', rotulo: 'Tudo' },
  { chave: 'personalizado', rotulo: 'Datas' },
];

export interface EstadoDoFiltro {
  preset: Preset;
  periodo: Periodo;
}

/** O estado inicial. «Mês» por omissão: é o período em que se pensa dinheiro. */
export function filtroInicial(preset: Preset = 'mes'): EstadoDoFiltro {
  return { preset, periodo: periodoDe(preset) };
}

export function FiltroDePeriodo({
  valor, aoMudar, children,
}: {
  valor: EstadoDoFiltro;
  aoMudar: (e: EstadoDoFiltro) => void;
  /** O que mostrar à direita — normalmente o total do período. */
  children?: React.ReactNode;
}) {
  function escolher(preset: Preset) {
    if (preset === 'personalizado') {
      // Entra com o período que estava à vista, e não vazio: assim os dois
      // campos já trazem datas para ajustar, em vez de limparem a lista até
      // alguém preencher as duas.
      aoMudar({ preset, periodo: valor.periodo });
      return;
    }
    aoMudar({ preset, periodo: periodoDe(preset) });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <Button
              key={p.chave}
              size="sm"
              variant={valor.preset === p.chave ? 'default' : 'ghost'}
              onClick={() => escolher(p.chave)}
            >
              {p.chave === 'personalizado' && (
                <CalendarRange className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              )}
              {p.rotulo}
            </Button>
          ))}
        </div>

        {children}
      </div>

      {valor.preset === 'personalizado' && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="de" className="text-xs text-muted-foreground">De</label>
            <Input
              id="de" type="date" className="h-9"
              value={valor.periodo.de ?? ''}
              onChange={(e) => aoMudar({
                ...valor, periodo: { ...valor.periodo, de: e.target.value || null },
              })}
            />
          </div>
          <div>
            <label htmlFor="ate" className="text-xs text-muted-foreground">Até</label>
            <Input
              id="ate" type="date" className="h-9"
              value={valor.periodo.ate ?? ''}
              onChange={(e) => aoMudar({
                ...valor, periodo: { ...valor.periodo, ate: e.target.value || null },
              })}
            />
          </div>
          {/* Dito por escrito: os dois dias ENTRAM. Sem isto, quem escolhe
              1 a 31 fica sem saber se o 31 conta — e a diferença de um dia
              num total é exactamente o que faz desconfiar da conta toda. */}
          <p className="pb-2 text-xs text-muted-foreground">
            Os dois dias contam.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {descreverPeriodo(valor.periodo)}
      </p>
    </div>
  );
}
