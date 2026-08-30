// src/shared/hooks/use-list-state.ts
//
// Estado de uma listagem: pesquisa, filtros e página, guardados NO ENDEREÇO.
//
// ─── POR QUE NO URL E NÃO EM useState ────────────────────────────────────────
//
// Guardar isto em estado local é o caminho óbvio e custa três coisas ao
// administrador, todos os dias:
//
//   - recarregar a página perde o que estava a fazer e atira-o para o princípio;
//   - o botão "voltar" do browser sai da tela em vez de desfazer o último filtro;
//   - e não há forma de mandar a alguém "vê isto" — o endereço é sempre o mesmo,
//     independentemente do que está no ecrã.
//
// Com o estado no URL, as três resolvem-se sozinhas, e o browser passa a fazer
// o trabalho de histórico em vez de o duplicarmos em código.
//
// ─── O ATRASO NA ESCRITA ─────────────────────────────────────────────────────
//
// Cada tecla não pode ser um pedido. Escrever "Mónica" dispara seis, e as
// respostas podem chegar trocadas — a lista acaba a mostrar resultados de
// "Móni" porque essa chegou depois. O termo só é aplicado quando a pessoa
// pára de escrever.
//
// O que fica no URL é o termo JÁ ATRASADO, não o que está a ser escrito: um
// registo de histórico por letra tornaria o botão "voltar" inutilizável.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Tempo de silêncio antes de a pesquisa valer. */
const DEBOUNCE_MS = 300;

export interface ListState {
  /** O que está na caixa, atualizado a cada tecla. */
  searchInput: string;
  setSearchInput: (v: string) => void;
  /** O termo já estabilizado — é este que vai para o servidor. */
  search: string;

  filters: Record<string, string>;
  setFilter: (key: string, value: string | null) => void;

  page: number;
  setPage: (p: number) => void;

  /** Há alguma coisa aplicada além do estado inicial? */
  hasFilters: boolean;
  clearAll: () => void;
}

export function useListState(opts: {
  /** Filtros conhecidos e o valor que conta como "sem filtro". */
  defaults?: Record<string, string>;
} = {}): ListState {
  const defaults = useMemo(() => opts.defaults ?? {}, [opts.defaults]);
  const [params, setParams] = useSearchParams();

  const search = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const filters = useMemo(() => {
    const out: Record<string, string> = { ...defaults };
    for (const chave of Object.keys(defaults)) {
      const valor = params.get(chave);
      if (valor) out[chave] = valor;
    }
    return out;
  }, [params, defaults]);

  // A caixa tem estado próprio, para responder a cada tecla sem esperar.
  const [searchInput, setSearchInput] = useState(search);

  // Se o URL mudar por fora — botão "voltar", um link colado — a caixa segue.
  useEffect(() => { setSearchInput(search); }, [search]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchInput === search) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setParams((atual) => {
        const p = new URLSearchParams(atual);
        if (searchInput.trim()) p.set('q', searchInput.trim());
        else p.delete('q');
        // Procurar volta sempre ao princípio: senão ficava-se na página 12 de
        // um resultado que agora tem duas.
        p.delete('page');
        return p;
        // `replace` e não `push`: escrever não deve encher o histórico. Só a
        // navegação entre páginas e filtros merece um passo para trás.
      }, { replace: true });
    }, DEBOUNCE_MS);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [searchInput, search, setParams]);

  const setFilter = useCallback((key: string, value: string | null) => {
    setParams((atual) => {
      const p = new URLSearchParams(atual);
      if (value === null || value === defaults[key]) p.delete(key);
      else p.set(key, value);
      p.delete('page');
      return p;
    });
  }, [setParams, defaults]);

  const setPage = useCallback((p: number) => {
    setParams((atual) => {
      const q = new URLSearchParams(atual);
      if (p <= 1) q.delete('page');
      else q.set('page', String(p));
      return q;
    });
  }, [setParams]);

  const clearAll = useCallback(() => {
    setSearchInput('');
    setParams(new URLSearchParams());
  }, [setParams]);

  const hasFilters =
    search.length > 0 ||
    Object.entries(filters).some(([k, v]) => v !== defaults[k]);

  return {
    searchInput, setSearchInput, search,
    filters, setFilter,
    page, setPage,
    hasFilters, clearAll,
  };
}
