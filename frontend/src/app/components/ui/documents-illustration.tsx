// src/app/components/ui/documents-illustration.tsx
//
// Ilustração da pasta de documentos — cartão de estado da tela de Documentos.
// Mesma gramática das restantes: vetor plano, sem gradiente, três tons mais um
// acento.
//
// Ao contrário de wallet-illustration e payout-illustration, esta NÃO usa o
// eixo tone/surface de illustration-palette. Aquelas duas colorem por
// identidade (verde da marca, azul das retiradas); esta colore por ESTADO de
// conformidade, que é outro eixo — o mesmo desenho precisa de aparecer em
// âmbar, verde ou vermelho conforme a situação do motorista. Forçá-la no
// sistema de tons obrigaria a inventar tons "warning" e "danger" que nenhuma
// outra ilustração usa.
//
// Todas as paletas assumem fundo de cartão tingido e claro (bg-warning,
// bg-success), por isso os tons são os escuros de cada rampa.
//
// Animação: o selo assenta com um pequeno impulso. Sem repetição em loop — é
// um cartão de estado, não um indicador de carregamento.

const CSS = `
@keyframes df-doc-stamp {
  0%   { transform: scale(.4) rotate(-18deg); opacity: 0; }
  70%  { transform: scale(1.08) rotate(3deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg);    opacity: 1; }
}
@keyframes df-doc-rise {
  from { transform: translateY(10px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
.df-doc-paper { animation: df-doc-rise .6s cubic-bezier(.22,1,.36,1) both; }
.df-doc-stamp {
  transform-box: fill-box;
  transform-origin: center;
  animation: df-doc-stamp .55s cubic-bezier(.34,1.4,.64,1) .35s both;
}
@media (prefers-reduced-motion: reduce) {
  .df-doc-paper, .df-doc-stamp { animation: none; opacity: 1; }
}
`;

export type DocumentsIllustrationState = 'complete' | 'incomplete' | 'blocked';

interface Palette {
  folder: string;
  folderDark: string;
  paper: string;
  ink: string;
  stamp: string;
  stampMark: string;
}

const PALETTES: Record<DocumentsIllustrationState, Palette> = {
  // Tudo aprovado — verde da marca.
  complete: {
    folder: '#108865',   // brand-500
    folderDark: '#0a5440', // brand-700
    paper: '#e6f5ef',    // brand-50
    ink: '#0a5440',
    stamp: '#073d2f',    // brand-800
    stampMark: '#e6f5ef',
  },
  // Falta enviar ou está em análise — âmbar.
  incomplete: {
    folder: '#f59e0b',
    folderDark: '#b45309',
    paper: '#fef3c7',
    ink: '#b45309',
    stamp: '#78350f',
    stampMark: '#fef3c7',
  },
  // Conta bloqueada ou inativa — vermelho.
  blocked: {
    folder: '#ef4444',
    folderDark: '#b91c1c',
    paper: '#fee2e2',
    ink: '#b91c1c',
    stamp: '#7f1d1d',
    stampMark: '#fee2e2',
  },
};

interface Props {
  state?: DocumentsIllustrationState;
  className?: string;
}

export function DocumentsIllustration({ state = 'incomplete', className = '' }: Props) {
  const c = PALETTES[state];

  return (
    <svg
      viewBox="8 2 104 96"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <style>{CSS}</style>

      <ellipse cx="60" cy="92" rx="44" ry="4" fill="#00000012" />

      {/* folha a sair da pasta */}
      <g className="df-doc-paper">
        <rect x="34" y="10" width="52" height="64" rx="5" fill={c.paper} />
        <rect x="42" y="22" width="30" height="3.5" rx="1.75" fill={c.ink} opacity="0.45" />
        <rect x="42" y="32" width="22" height="3.5" rx="1.75" fill={c.ink} opacity="0.45" />
        <rect x="42" y="42" width="27" height="3.5" rx="1.75" fill={c.ink} opacity="0.45" />
      </g>

      {/* pasta */}
      <path
        d="M14 44 Q14 36 22 36 L44 36 L50 44 L98 44 Q106 44 106 52 L106 80
           Q106 88 98 88 L22 88 Q14 88 14 80 Z"
        fill={c.folder}
      />
      {/* aba da frente, mais escura, dá profundidade sem sombra */}
      <path
        d="M14 56 L106 56 L106 80 Q106 88 98 88 L22 88 Q14 88 14 80 Z"
        fill={c.folderDark}
      />

      {/* selo */}
      <g className="df-doc-stamp">
        <circle cx="88" cy="30" r="15" fill={c.stamp} />
        {state === 'complete' ? (
          <path
            d="M81 30.5 L86 35.5 L95.5 25.5"
            fill="none"
            stroke={c.stampMark}
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <rect x="86.4" y="21.5" width="3.2" height="10.5" rx="1.6" fill={c.stampMark} />
            <circle cx="88" cy="37" r="2.1" fill={c.stampMark} />
          </>
        )}
      </g>
    </svg>
  );
}
