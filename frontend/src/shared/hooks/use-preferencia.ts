// src/shared/hooks/use-preferencia.ts
//
// Pequenas escolhas de quem usa, que não se devem perder ao fechar o browser.
//
// ─── O QUE ISTO GUARDA, E O QUE NÃO GUARDA ──────────────────────────────────
//
// Guarda preferências de VISTA: um painel dobrado, um separador escolhido, uma
// ordenação. Coisas que, perdidas, só custam um clique.
//
// Não guarda dados. Nada do que está aqui chega ao servidor, nem sai deste
// browser: quem abrir o DragonFleet no telemóvel tem as suas próprias escolhas,
// e isso é o comportamento certo — um painel dobrado no computador grande não
// tem de estar dobrado num ecrã pequeno.
//
// ─── PORQUE É QUE A CHAVE LEVA O UTILIZADOR ─────────────────────────────────
//
// Porque há browsers partilhados. Dois motoristas que entrem no mesmo
// computador têm de ter escolhas separadas — senão um dobra o gráfico e o outro
// encontra-o dobrado sem perceber porquê.
//
// ─── PORQUE É QUE TUDO ISTO ESTÁ DENTRO DE try ──────────────────────────────
//
// O `localStorage` não é de confiança. Numa janela anónima, com os dados do
// sítio bloqueados, ou com o disco cheio, tanto a leitura como a ESCRITA
// atiram. Sem o try, a tela inteira deixava de carregar por causa de uma
// preferência — e numa janela anónima, sempre.

import { useCallback, useEffect, useState } from 'react';

const PREFIXO = 'dragonfleet:pref:';

function ler<T>(chave: string, inicial: T): T {
  try {
    const guardado = localStorage.getItem(PREFIXO + chave);
    return guardado === null ? inicial : (JSON.parse(guardado) as T);
  } catch {
    // Inclui o JSON.parse a falhar num valor escrito por uma versão anterior.
    return inicial;
  }
}

/**
 * Como o `useState`, mas sobrevive a fechar o browser.
 *
 * A chave deve identificar a preferência E a pessoa, por exemplo
 * `painel:grafico:${user.id}`. Mudar de chave relê — é o que faz a preferência
 * certa aparecer quando a sessão acaba de carregar e o `user.id` deixa de ser
 * indefinido.
 */
export function usePreferenciaGuardada<T>(chave: string, inicial: T): [T, (valor: T) => void] {
  const [valor, setValor] = useState<T>(() => ler(chave, inicial));

  // Relê quando a chave muda. Sem isto, o primeiro desenho acontece antes de a
  // sessão estar carregada, fica com o valor por omissão, e a escolha guardada
  // só apareceria depois de recarregar a página à mão.
  useEffect(() => { setValor(ler(chave, inicial)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const guardar = useCallback((novo: T) => {
    setValor(novo);
    try {
      localStorage.setItem(PREFIXO + chave, JSON.stringify(novo));
    } catch {
      // A escolha vale para esta sessão e perde-se ao fechar. É melhor do que
      // rebentar: o ecrã continua a funcionar.
    }
  }, [chave]);

  return [valor, guardar];
}
