// src/app/components/ui/vehicle-illustration.tsx
//
// Ilustração SVG de veículo (leve, ~2KB, sem imagens externas).
// A cor da lataria segue o status do veículo. Dentro de um container com a
// classe "group", o hover anima: o carro desliza e as rodas giram
// (Tailwind group-hover + animate-spin).

import type { VehicleStatus } from '@/shared/types/api';

const STATUS_COLORS: Record<VehicleStatus, { body: string; window: string; dark: string }> = {
  ACTIVE: { body: '#1D9E75', window: '#9FE1CB', dark: '#0F6E56' },
  PENDING: { body: '#EF9F27', window: '#FAC775', dark: '#854F0B' },
  MAINTENANCE: { body: '#378ADD', window: '#B5D4F4', dark: '#185FA5' },
  INACTIVE: { body: '#888780', window: '#D3D1C7', dark: '#5F5E5A' },
  SOLD: { body: '#B4B2A9', window: '#D3D1C7', dark: '#5F5E5A' },
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
        viewBox="0 0 200 80"
        className="w-full transition-transform duration-300 ease-out group-hover:translate-x-2"
        role="img"
        aria-label="Ilustração do veículo"
      >
        {/* sombra no chão */}
        <ellipse cx="100" cy="72" rx="82" ry="4" className="fill-black/5 dark:fill-white/5" />

        {/* carroçaria */}
        <path
          d="M20 58 Q18 49 28 47 L44 44 Q56 30 82 27 L116 27 Q140 28 154 42 L172 46 Q183 48 183 56 L183 59 Q183 63 177 63 L169 63 A17 17 0 0 0 135 63 L88 63 A17 17 0 0 0 54 63 L27 63 Q20 63 20 58 Z"
          fill={c.body}
        />

        {/* vidros */}
        <path d="M63 42 Q71 32 84 30 L99 30 L99 42 Z" fill={c.window} />
        <path d="M105 30 L116 30 Q135 31 146 42 L105 42 Z" fill={c.window} />

        {/* coluna central + maçaneta */}
        <rect x="100" y="30" width="3" height="13" fill={c.dark} />
        <rect x="108" y="46" width="12" height="2.6" rx="1.3" fill={c.dark} />

        {/* farol */}
        <path d="M176 50 L182 51 L182 55 L176 54 Z" fill="#FAC775" />

        {/* rodas — giram no hover do card (.group) */}
        <g className="group-hover:animate-spin" style={{ transformOrigin: '52px 63px' }}>
          <circle cx="52" cy="63" r="12" fill="#2C2C2A" />
          <circle cx="52" cy="63" r="5.5" fill="#B4B2A9" />
          <rect x="50.8" y="53" width="2.4" height="8" fill="#5F5E5A" />
        </g>
        <g className="group-hover:animate-spin" style={{ transformOrigin: '152px 63px' }}>
          <circle cx="152" cy="63" r="12" fill="#2C2C2A" />
          <circle cx="152" cy="63" r="5.5" fill="#B4B2A9" />
          <rect x="150.8" y="53" width="2.4" height="8" fill="#5F5E5A" />
        </g>
      </svg>
    </div>
  );
}