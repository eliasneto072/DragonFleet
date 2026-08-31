// src/app/components/DragonFleetLogo.tsx
//
// Uso:
//   <DragonFleetLogo />               → ícone + nome (padrão)
//   <DragonFleetLogo iconOnly />      → só a marca
//   <DragonFleetLogo size={48} />     → altura da marca em px (padrão 48)
//
// A marca é um PNG e não um SVG desenhado em código, como era a versão
// anterior. O desenho tem gradientes e recortes que ficariam extensos e
// frágeis em paths escritos à mão; o ficheiro tem 1024px de origem, o
// suficiente para qualquer tamanho de ecrã.
//
// Servida a partir de /public, sem passar pelo bundler: assim o mesmo ficheiro
// alimenta o componente e as tags do index.html, em vez de existirem duas
// cópias que podem divergir.

interface DragonFleetLogoProps {
  iconOnly?: boolean;
  size?: number;
}

export function DragonFleetLogo({ iconOnly = false, size = 48 }: DragonFleetLogoProps) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.22 }}>
      <img
        src="/dragonfleet-mark.png"
        srcSet="/dragonfleet-mark.png 1x, /dragonfleet-mark@2x.png 2x"
        // A marca é mais alta que larga; fixar a altura e deixar a largura
        // seguir evita a distorção que um quadrado forçado produziria.
        height={size}
        style={{ height: size, width: 'auto', display: 'block' }}
        alt=""
        aria-hidden="true"
      />

      {!iconOnly && (
        <div style={{ lineHeight: 1, userSelect: 'none' }}>
          <div
            style={{
              fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
              fontWeight: 800,
              fontSize: size * 0.46,
              letterSpacing: '-0.03em',
              color: 'var(--foreground)',
            }}
          >
            Dragon<span style={{ color: 'var(--brand-500)' }}>Fleet</span>
          </div>
        </div>
      )}
    </div>
  );
}
