// src/app/components/ui/vehicle-illustration.tsx
//
// Ilustração SVG de veículo (leve, ~2KB, sem imagens externas).
// A cor da lataria segue o status do veículo. Dentro de um container com a
// classe "group", o hover anima: o carro desliza e as rodas giram.
//
// Notas de implementação:
// - Os arcos das caixas de roda no path da carroçaria compartilham o mesmo
//   centro dos círculos das rodas (x=52 e x=152). Raio do arco 17 contra raio
//   da roda 12 = 5px de folga uniforme em volta do pneu. Se esses centros
//   divergirem, a roda "vaza" do para-lama.
// - O viewBox é recortado no conteúdo real (y 22→80). O desenho começa em
//   y=27 e termina em y=76; um viewBox iniciado em 0 geraria ~34% de espaço
//   morto vertical dentro do card.
// - As rodas usam transform-box: fill-box, então o eixo de rotação é o centro
//   da bounding box do próprio grupo — imune a alterações no viewBox.
// - As animações ficam sob a variante motion-safe, respeitando
//   prefers-reduced-motion.
//
// Cores: o verde do status ACTIVE usa a escala de marca do theme.css
// (--brand-500/-100/-700). Os demais status usam as cores semânticas
// equivalentes às de STATUS_STYLES em vehicles-management.tsx.

import type { VehicleStatus } from '@/shared/types/api';

const STATUS_COLORS: Record<VehicleStatus, { body: string; window: string; dark: string }> = {
  ACTIVE: { body: '#108865', window: '#c2e8d8', dark: '#0a5440' },
  PENDING: { body: '#f59e0b', window: '#fde68a', dark: '#78350f' },
  MAINTENANCE: { body: '#3b82f6', window: '#bfdbfe', dark: '#1e40af' },
  INACTIVE: { body: '#6b7280', window: '#d1d5db', dark: '#374151' },
  SOLD: { body: '#9ca3af', window: '#e5e7eb', dark: '#4b5563' },
};

// Eixo de rotação das rodas. Mantenha em sincronia com os arcos do path da
// carroçaria: arco traseiro 69→35 (centro 52), dianteiro 169→135 (centro 152).
const WHEEL_STYLE: React.CSSProperties = {
  transformBox: 'fill-box',
  transformOrigin: 'center',
};

interface Props {
  status: VehicleStatus;
  className?: string;
}

export function VehicleIllustration({ status, className = '' }: Props) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.INACTIVE;

  return (
    <div className={`overflow-hidden ${className}`}>
      <svg
        viewBox="0 22 200 58"
        className="w-full transition-transform duration-300 ease-out motion-safe:group-hover:translate-x-2"
        role="img"
        aria-label="Ilustração do veículo"
      >
        {/* sombra no chão */}
        <ellipse cx="100" cy="72" rx="82" ry="4" className="fill-black/5 dark:fill-white/5" />

        {/* carroçaria — os trechos "A17 17" são as caixas de roda */}
        <path
          d="M20 58 Q18 49 28 47 L44 44 Q56 30 82 27 L116 27 Q140 28 154 42 L172 46
             Q183 48 183 56 L183 59 Q183 63 177 63 L169 63 A17 17 0 0 0 135 63
             L69 63 A17 17 0 0 0 35 63 L27 63 Q20 63 20 58 Z"
          fill={c.body}
        />

        {/* vidros */}
        <path d="M63 42 Q71 32 84 30 L99 30 L99 42 Z" fill={c.window} />
        <path d="M105 30 L116 30 Q135 31 146 42 L105 42 Z" fill={c.window} />

        {/* coluna central + maçaneta */}
        <rect x="100" y="30" width="3" height="13" fill={c.dark} />
        <rect x="108" y="46" width="12" height="2.6" rx="1.3" fill={c.dark} />

        {/* farol */}
        <path d="M176 50 L182 51 L182 55 L176 54 Z" fill="#fcd34d" />

        {/* roda traseira — gira no hover do card (.group) */}
        <g
          className="motion-safe:group-hover:animate-spin [animation-duration:1.4s]"
          style={WHEEL_STYLE}
        >
          <circle cx="52" cy="63" r="12" fill="#1D1D1D" />
          <circle cx="52" cy="63" r="5.5" fill="#d1d5db" />
          <rect x="50.8" y="53" width="2.4" height="8" fill="#6b7280" />
        </g>

        {/* roda dianteira */}
        <g
          className="motion-safe:group-hover:animate-spin [animation-duration:1.4s]"
          style={WHEEL_STYLE}
        >
          <circle cx="152" cy="63" r="12" fill="#1D1D1D" />
          <circle cx="152" cy="63" r="5.5" fill="#d1d5db" />
          <rect x="150.8" y="53" width="2.4" height="8" fill="#6b7280" />
        </g>
      </svg>
    </div>
  );
}
