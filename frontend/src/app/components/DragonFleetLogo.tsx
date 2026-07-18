// src/app/components/DragonFleetLogo.tsx
//
// Uso:
//   <DragonFleetLogo />               → ícone + nome (padrão)
//   <DragonFleetLogo iconOnly />      → só o ícone quadrado
//   <DragonFleetLogo size={48} />     → tamanho do ícone em px (padrão 48)

interface DragonFleetLogoProps {
  iconOnly?: boolean;
  size?: number;
}

export function DragonFleetLogo({ iconOnly = false, size = 48 }: DragonFleetLogoProps) {
  const r = size * 0.22; // border-radius proporcional

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.25 }}>

      {/* Ícone */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="df-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a4a3a"/>
            <stop offset="100%" stopColor="#0d6b4f"/>
          </linearGradient>
        </defs>

        {/* Fundo */}
        <rect width="100" height="100" rx={r * 4.5} fill="url(#df-bg)"/>

        {/* Carroceria inferior */}
        <rect x="14" y="54" width="72" height="20" rx="8" fill="white"/>

        {/* Cabine */}
        <path
          d="M28 54 C28 54, 32 32, 44 28 L62 28 C72 28, 76 42, 78 54 Z"
          fill="white"
        />

        {/* Janela (recorte) */}
        <path
          d="M34 52 C34 52, 37 36, 46 33 L60 33 C67 33, 70 43, 72 52 Z"
          fill="url(#df-bg)"
        />

        {/* Roda esquerda */}
        <circle cx="30" cy="76" r="11" fill="url(#df-bg)"/>
        <circle cx="30" cy="76" r="7"  fill="white"/>
        <circle cx="30" cy="76" r="3"  fill="url(#df-bg)"/>

        {/* Roda direita */}
        <circle cx="70" cy="76" r="11" fill="url(#df-bg)"/>
        <circle cx="70" cy="76" r="7"  fill="white"/>
        <circle cx="70" cy="76" r="3"  fill="url(#df-bg)"/>
      </svg>

      {/* Nome */}
      {!iconOnly && (
        <div style={{ lineHeight: 1, userSelect: 'none' }}>
          <div style={{
            fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
            fontWeight: 800,
            fontSize: size * 0.46,
            letterSpacing: '-0.03em',
            color: '#1D1D1D',
          }}>
            Dragon<span style={{ color: '#108865' }}>Fleet</span>
          </div>
        </div>
      )}

    </div>
  );
}