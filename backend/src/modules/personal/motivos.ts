// src/modules/personal/motivos.ts
//
// O texto que o extrato do motorista mostra quando um débito veio de uma
// despesa pessoal.
//
// Está sozinho num ficheiro porque tem DOIS escritores: o lançamento à mão
// (`personal.service.ts`) e a importação do extrato bancário
// (`extratos.service.ts`). Se os dois escrevessem a sua própria cópia, bastava
// mudar uma para o extrato passar a mostrar duas etiquetas diferentes para a
// mesma coisa — e ninguém, a olhar para o ecrã, saberia porquê.
//
// `BalanceAdjustment` não tem campo de notas: o `reason` é tudo o que o extrato
// mostra. A descrição que vem do banco fica na despesa, não no ajuste.

/** O que o extrato mostra num débito nascido de uma despesa pessoal. */
export const MOTIVO_NO_EXTRATO = 'Despesa pessoal';
