// src/app/components/ui/filter-combobox.tsx
//
// Um seletor de filtro com busca.
//
// ─── PORQUE NÃO É UM <Select> ────────────────────────────────────────────────
//
// O Diogo pediu "drop down selection" para filtrar documentos por motorista e
// por matrícula. Um `<Select>` simples resolveria para uma frota de trinta
// pessoas e seria inutilizável para duas mil — e a base de teste tem duas mil.
//
// Em vez de escolher entre os dois casos (e de ter de perguntar qual é o número
// real antes de escrever uma linha), este componente tem sempre busca.
//
// A primeira versão só a mostrava acima de oito opções, para não pôr uma caixa
// de texto onde bastavam os olhos. Estava errado por uma razão que se vê num
// segundo de uso: os dois filtros ficam LADO A LADO, e a frota tinha mais de
// oito motoristas e menos de oito carros. Um tinha busca, o outro não, e quem
// usou reparou logo — foi a primeira coisa que disse.
//
// Um controlo que muda de comportamento com o número de linhas na base é um
// controlo em que não se confia. A caixa de busca fica sempre.
//
// ─── O `hint` NÃO É DECORAÇÃO ────────────────────────────────────────────────
//
// Duas pessoas com o mesmo nome é um problema que este projeto já conhece: a
// importação de ganhos recusa-se a escolher entre dois motoristas homónimos, em
// vez de adivinhar. Um dropdown de nomes tem exatamente o mesmo problema, e
// aqui o engano é silencioso — quem escolhe o "João Silva" errado vê os
// documentos de outra pessoa sem nada que o avise.
//
// Daí a segunda linha em cada opção: o email no caso dos motoristas, a marca e
// modelo no caso dos carros. É o que torna a escolha inequívoca.

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/app/components/ui/utils';
import { Button } from '@/app/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/app/components/ui/command';

export interface FilterOption {
  value: string;
  label: string;
  /** Segunda linha, para desambiguar homónimos. Ver nota no topo. */
  hint?: string;
}

interface FilterComboboxProps {
  options: FilterOption[];
  /** O valor selecionado, ou `allValue` quando não há filtro. */
  value: string;
  onChange: (value: string) => void;
  /** Texto do botão quando nada está selecionado. */
  placeholder: string;
  /** Rótulo da opção que desliga o filtro. */
  allLabel: string;
  allValue?: string;
  className?: string;
  /** Texto quando a busca não encontra nada. */
  emptyLabel?: string;
}

export function FilterCombobox({
  options,
  value,
  onChange,
  placeholder,
  allLabel,
  allValue = 'all',
  className,
  emptyLabel = 'Nada encontrado.',
}: FilterComboboxProps) {
  const [open, setOpen] = useState(false);

  const selecionada = options.find((o) => o.value === value);
  const ativo = value !== allValue;

  function escolher(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          // `justify-between` e `font-normal` para não parecer um botão de
          // ação no meio de uma fila de filtros — tem de ler-se como um
          // `<Select>`, que e o que as outras colunas desta barra usam.
          className={cn('justify-between font-normal', className)}
        >
          <span className={cn('truncate', !ativo && 'text-muted-foreground')}>
            {ativo ? (selecionada?.label ?? placeholder) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Escrever para procurar…" />

          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>

            <CommandGroup>
              <CommandItem value={allLabel} onSelect={() => escolher(allValue)}>
                <Check
                  className={cn('mr-2 h-4 w-4', ativo ? 'opacity-0' : 'opacity-100')}
                  aria-hidden="true"
                />
                {allLabel}
              </CommandItem>

              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  // O `value` do CommandItem e o que a busca compara. Junta-se o
                  // hint para se poder procurar tambem pelo email ou pelo
                  // modelo, e nao so pelo nome.
                  value={`${o.label} ${o.hint ?? ''}`}
                  onSelect={() => escolher(o.value)}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4 shrink-0', value === o.value ? 'opacity-100' : 'opacity-0')}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {o.hint}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
