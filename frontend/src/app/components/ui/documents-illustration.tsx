// src/app/components/ui/documents-illustration.tsx
//
// Ilustração da pasta de documentos — cartão de estado da tela de Documentos.
// Mesma gramática das restantes: vetor plano, sem gradiente, arestas curvas em
// vez de retângulos empilhados.
//
// Ao contrário de wallet-illustration e payout-illustration, esta NÃO usa o
// eixo tone/surface de illustration-palette. Aquelas colorem por IDENTIDADE
// (verde da marca, azul das retiradas), e essa cor não muda. Esta colore por
// ESTADO de conformidade: o mesmo desenho precisa de aparecer em âmbar, verde
// ou vermelho conforme a situação. Encaixá-la no sistema de tons obrigaria a
// inventar tons "warning" e "danger" que nenhuma outra ilustração usaria.
//
// O papel é branco em todos os estados, de propósito. O cartão de fundo é uma
// tinta clara da mesma família da cor de estado (bg-warning/10, bg-success/10),
// então um papel tingido da mesma cor desaparecia contra ele no tema claro.
// Branco separa nos dois temas.
//
// Animação: o selo assenta com um pequeno impulso e as folhas sobem. Sem loop —
// é um cartão de estado, não um indicador de carregamento.

const CSS = `
@keyframes df-doc-stamp {
  0%   { transform: scale(.4) rotate(-20deg); opacity: 0; }
  70%  { transform: scale(1.08) rotate(4deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg);    opacity: 1; }
}
@keyframes df-doc-rise {
  from { transform: translateY(12px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
.df-doc-sheet  { animation: df-doc-rise .6s cubic-bezier(.22,1,.36,1) both; }
.df-doc-sheet2 { animation-delay: .1s; }
.df-doc-stamp {
  transform-box: fill-box;
  transform-origin: center;
  animation: df-doc-stamp .55s cubic-bezier(.34,1.4,.64,1) .4s both;
}
@media (prefers-reduced-motion: reduce) {
  .df-doc-sheet, .df-doc-stamp { animation: none; opacity: 1; }
}
`;

export type DocumentsIllustrationState = 'complete' | 'incomplete' | 'blocked';

interface Palette {
  /** Corpo da pasta. */
  folder: string;
  /** Aba da frente, em sombra. */
  folderDark: string;
  /** Etiqueta e costura sobre a aba. */
  accent: string;
  /** Folha de cima. Branca em todos os estados — ver nota no topo. */
  paper: string;
  /** Canto dobrado e folha de trás. */
  fold: string;
  /** Linhas de texto na folha. */
  ink: string;
  /** Disco e anel do selo. */
  seal: string;
  /** Marca gravada no selo. */
  sealMark: string;
}

const PALETTES: Record<DocumentsIllustrationState, Palette> = {
  // Tudo aprovado — verde da marca.
  complete: {
    folder: '#108865',     // brand-500
    folderDark: '#0a5440', // brand-700
    accent: '#c2e8d8',     // brand-100
    paper: '#ffffff',
    fold: '#d7ece3',
    ink: '#0a5440',
    seal: '#073d2f',       // brand-800
    sealMark: '#e6f5ef',   // brand-50
  },
  // Falta enviar ou está em análise — âmbar.
  incomplete: {
    folder: '#f59e0b',
    folderDark: '#b45309',
    accent: '#fde68a',
    paper: '#ffffff',
    fold: '#fde9c0',
    ink: '#b45309',
    seal: '#78350f',
    sealMark: '#fef3c7',
  },
  // Conta bloqueada ou inativa — vermelho.
  blocked: {
    folder: '#ef4444',
    folderDark: '#b91c1c',
    accent: '#fecaca',
    paper: '#ffffff',
    fold: '#fbd0d0',
    ink: '#b91c1c',
    seal: '#7f1d1d',
    sealMark: '#fee2e2',
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
      viewBox="6 2 110 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <style>{CSS}</style>

      <ellipse cx="60" cy="93" rx="42" ry="4" fill="#00000015" />

      {/* folha de trás, ligeiramente rodada — dá espessura à pilha */}
      <g className="df-doc-sheet df-doc-sheet2">
        <g transform="rotate(7 66 40)">
          <rect x="42" y="12" width="46" height="56" rx="4" fill={c.fold} />
        </g>
      </g>

      {/* folha da frente, com o canto superior direito dobrado */}
      <g className="df-doc-sheet">
        <path
          d="M35 8 L69 8 L82 21 L82 67 Q82 72 77 72 L35 72 Q30 72 30 67 L30 13 Q30 8 35 8 Z"
          fill={c.paper}
        />
        <path d="M69 8 L82 21 L71.5 21 Q69 21 69 18.5 Z" fill={c.fold} />
        <rect x="38" y="28" width="28" height="3.2" rx="1.6" fill={c.ink} opacity="0.35" />
        <rect x="38" y="37" width="20" height="3.2" rx="1.6" fill={c.ink} opacity="0.35" />
      </g>

      {/* corpo da pasta */}
      <path
        d="M12 44 Q12 36 20 36 L44 36 L50 44 L100 44 Q108 44 108 52 L108 82
           Q108 90 100 90 L20 90 Q12 90 12 82 Z"
        fill={c.folder}
      />

      {/* aba da frente — aresta superior curva, não reta */}
      <path
        d="M12 58 Q60 52 108 58 L108 82 Q108 90 100 90 L20 90 Q12 90 12 82 Z"
        fill={c.folderDark}
      />

      {/* costura acompanhando a curva da aba */}
      <path
        d="M17 58.9 Q60 53.1 103 58.9"
        fill="none"
        stroke={c.accent}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="3 4"
        opacity="0.5"
      />

      {/* etiqueta */}
      <rect x="26" y="69" width="32" height="12" rx="3" fill={c.accent} opacity="0.85" />

      {/* selo — o anel serrilhado é um só traço tracejado, não oito entalhes */}
      <g className="df-doc-stamp">
        <circle
          cx="90" cy="27" r="17.5"
          fill="none" stroke={c.seal} strokeWidth="3.5" strokeDasharray="2.5 4.5"
        />
        <circle cx="90" cy="27" r="14" fill={c.seal} />
        {state === 'complete' ? (
          <path
            d="M83.5 27.5 L88 32 L96.5 22.5"
            fill="none"
            stroke={c.sealMark}
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <rect x="88.4" y="19" width="3.2" height="10.5" rx="1.6" fill={c.sealMark} />
            <circle cx="90" cy="34" r="2.1" fill={c.sealMark} />
          </>
        )}
      </g>
    </svg>
  );
}
