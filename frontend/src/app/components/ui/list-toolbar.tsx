// src/app/components/ui/list-toolbar.tsx
//
// Barra de pesquisa e filtros, e a paginação, para todas as listagens do
// administrador.
//
// ─── UMA BARRA, NÃO SETE ─────────────────────────────────────────────────────
//
// Cada tela tinha o seu arranjo de caixas de seleção soltas por cima da lista,
// e nenhuma dizia de relance o que estava aplicado. Com pesquisa e paginação a
// juntarem-se, isso passava a entulho.
//
// Aqui a pesquisa fica em destaque — é a operação mais frequente com 2000
// motoristas — e os filtros aparecem como FICHAS removíveis ao lado. Uma ficha
// diz o que está a limitar a lista e desfaz-se num clique, o que uma caixa de
// seleção em "Todos" nunca consegue mostrar.

import { Input } from '@/app/components/ui/input';
import { Button } from '@/app/components/ui/button';
import { Search, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface FilterChip {
  key: string;
  /** O que aparece na ficha: "Bloqueados", "Uber", "Última semana". */
  label: string;
  onRemove: () => void;
}

export function ListToolbar({
  searchInput, onSearchChange, placeholder, chips, onClearAll, children,
}: {
  searchInput: string;
  onSearchChange: (v: string) => void;
  placeholder: string;
  /** Só os filtros ATIVOS. Um filtro em "Todos" não é uma ficha. */
  chips: FilterChip[];
  onClearAll: () => void;
  /** Os seletores de filtro, que cada tela define. */
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            className="pl-9 pr-9"
            // `search` e não `text`: no telemóvel muda a tecla de Enter para
            // "Procurar" e dá o botão de limpar do próprio sistema.
            type="search"
            aria-label={placeholder}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Limpar pesquisa"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        {children}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onRemove}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs transition-colors hover:bg-muted"
            >
              {c.label}
              <X className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={onClearAll}
            className="px-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Limpar tudo
          </button>
        </div>
      )}
    </div>
  );
}

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Páginas numeradas, para as telas onde se PROCURA.
 *
 * Escolhida em vez do "carregar mais" porque com dezenas de milhares de
 * registos ninguém chega ao fim a carregar num botão, e porque saber em que
 * página se está — e poder saltar para a última — é o que se espera de uma
 * listagem de trabalho.
 *
 * Os botões ficam desativados enquanto o pedido seguinte não chega, para não
 * se acumularem cliques que disparam três pedidos e mostram o do meio.
 */
export function Pagination({
  info, onChange, busy = false, compact = false,
}: {
  info: PageInfo;
  onChange: (page: number) => void;
  busy?: boolean;
  /**
   * Variante para o TOPO da lista.
   *
   * A paginação aparece em cima e em baixo — com 25 linhas, obrigar a rolar
   * até ao fim para mudar de página é atrito a cada consulta. Mas duas barras
   * idênticas competem uma com a outra: a de cima larga o "1 / 3529" e o
   * primeiro/último, e fica só com o essencial para avançar.
   */
  compact?: boolean;
}) {
  if (info.totalPages <= 1) return null;

  const primeiro = (info.page - 1) * info.pageSize + 1;
  const ultimo = Math.min(info.page * info.pageSize, info.total);

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs tabular-nums text-muted-foreground">
          {primeiro}–{ultimo} de {info.total}
        </p>
        <div className="flex items-center gap-1">
          <Button
            size="sm" variant="outline" className="h-8 px-2"
            disabled={info.page <= 1 || busy}
            onClick={() => onChange(info.page - 1)} aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            size="sm" variant="outline" className="h-8 px-2"
            disabled={!info.hasMore || busy}
            onClick={() => onChange(info.page + 1)} aria-label="Página seguinte"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      {/* "26–50 de 2000" e não só "página 2 de 80": diz onde se está na lista
          e não apenas na navegação. */}
      <p className="text-xs tabular-nums text-muted-foreground">
        {primeiro}–{ultimo} de {info.total}
      </p>

      <div className="flex items-center gap-1">
        <Button
          size="sm" variant="outline" className="h-8 px-2"
          disabled={info.page <= 1 || busy}
          onClick={() => onChange(1)} aria-label="Primeira página"
        >
          <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          size="sm" variant="outline" className="h-8 px-2"
          disabled={info.page <= 1 || busy}
          onClick={() => onChange(info.page - 1)} aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>

        <span className="px-2 text-xs tabular-nums text-muted-foreground">
          {info.page} / {info.totalPages}
        </span>

        <Button
          size="sm" variant="outline" className="h-8 px-2"
          disabled={!info.hasMore || busy}
          onClick={() => onChange(info.page + 1)} aria-label="Página seguinte"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          size="sm" variant="outline" className="h-8 px-2"
          disabled={!info.hasMore || busy}
          onClick={() => onChange(info.totalPages)} aria-label="Última página"
        >
          <ChevronsRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/**
 * O que aparece quando a pesquisa não devolve nada.
 *
 * Uma tabela vazia deixa a pessoa sem saber se procurou mal, se o filtro está
 * a esconder o resultado, ou se o sistema falhou. Isto diz o que foi procurado
 * e dá a saída.
 */
export function EmptyResults({
  search, onClear,
}: {
  search: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Search className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">
        {search ? <>Nada encontrado para “{search}”</> : 'Nada corresponde a estes filtros'}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Verifique a escrita ou remova algum filtro.
      </p>
      <Button variant="outline" size="sm" className="mt-1" onClick={onClear}>
        Limpar tudo
      </Button>
    </div>
  );
}
