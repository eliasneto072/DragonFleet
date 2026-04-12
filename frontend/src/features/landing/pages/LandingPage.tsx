// src/features/landing/pages/LandingPage.tsx

import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { Navigate } from 'react-router-dom';

// ─── CSS de animação float ────────────────────────────────────────────────────
// Variável string separada para evitar problemas com template literals
// dentro de JSX no Vite/Babel (o erro "\uXXXX" acontecia por isso).
//
// .btn-float    → botão do hero (sobe 6px)
// .btn-float-lg → botão do CTA final (sobe 8px, sombra maior)
// hover pausa a animação para não brigar com o cursor
const floatCSS = [
  '@keyframes float {',
  '  0%, 100% { transform: translateY(0px);  box-shadow: 0 0 30px rgba(16,136,101,0.4); }',
  '  50%       { transform: translateY(-6px); box-shadow: 0 8px 40px rgba(16,136,101,0.6); }',
  '}',
  '@keyframes float-lg {',
  '  0%, 100% { transform: translateY(0px);  box-shadow: 0 0 40px rgba(16,136,101,0.5); }',
  '  50%       { transform: translateY(-8px); box-shadow: 0 12px 50px rgba(16,136,101,0.7); }',
  '}',
  '.btn-float    { animation: float    3s ease-in-out infinite; }',
  '.btn-float-lg { animation: float-lg 3s ease-in-out infinite; }',
  '.btn-float:hover, .btn-float-lg:hover { animation-play-state: paused; }',
].join('\n');

export function LandingPage() {
  const { isAuthenticated, user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) return null;

  if (isAuthenticated && user) {
    const dest = user.role === 'DRIVER' ? '/app/driver' : '/app/admin';
    return <Navigate to={dest} replace />;
  }

  return (
    <>
      {/* Injeta os keyframes no documento de forma segura */}
      <style dangerouslySetInnerHTML={{ __html: floatCSS }} />

      <div style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        fontFamily: '"DM Sans", "Helvetica Neue", sans-serif',
        color: '#fff',
        overflowX: 'hidden',
      }}>

        {/* Grid de fundo */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0,
          backgroundImage: 'linear-gradient(rgba(16,136,101,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,136,101,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        }} />

        {/* Brilho verde */}
        <div style={{
          position: 'fixed', top: '-200px', right: '-200px',
          width: '600px', height: '600px',
          background: 'radial-gradient(circle, rgba(16,136,101,0.15) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* ── Header ── */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: '#0a0a0a',
        }}>
          <div style={{
            maxWidth: '1200px', margin: '0 auto', padding: '0 32px',
            height: '72px', display: 'flex', alignItems: 'center', gap: '40px',
          }}>

            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '8px', flexShrink: 0 }}>
              <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
                <defs>
                  <linearGradient id="h-bg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a4a3a"/>
                    <stop offset="100%" stopColor="#0d6b4f"/>
                  </linearGradient>
                </defs>
                <rect width="100" height="100" rx="22" fill="url(#h-bg)"/>
                <rect x="14" y="54" width="72" height="20" rx="8" fill="white"/>
                <path d="M28 54 C28 54, 32 32, 44 28 L62 28 C72 28, 76 42, 78 54 Z" fill="white"/>
                <path d="M34 52 C34 52, 37 36, 46 33 L60 33 C67 33, 70 43, 72 52 Z" fill="url(#h-bg)"/>
                <circle cx="30" cy="76" r="11" fill="url(#h-bg)"/>
                <circle cx="30" cy="76" r="7" fill="white"/>
                <circle cx="30" cy="76" r="3" fill="url(#h-bg)"/>
                <circle cx="70" cy="76" r="11" fill="url(#h-bg)"/>
                <circle cx="70" cy="76" r="7" fill="white"/>
                <circle cx="70" cy="76" r="3" fill="url(#h-bg)"/>
              </svg>
              <span style={{ fontWeight: 700, fontSize: '17px', letterSpacing: '-0.3px', color: '#fff' }}>
                Dragon<span style={{ color: '#108865' }}>Fleet</span>
              </span>
            </div>

            {/* Nav links centrais */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
              {[
                { label: 'Motoristas',  href: '#features' },
                { label: 'Plataforma',  href: '#features' },
                { label: 'Empresa',     href: '#features' },
                { label: 'Suporte',     href: '#features' },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  style={{
                    color: 'rgba(255,255,255,0.75)',
                    textDecoration: 'none',
                    fontSize: '15px',
                    fontWeight: 500,
                    padding: '6px 14px',
                    borderRadius: '999px',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.target as HTMLElement).style.color = '#fff';
                    (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                  }}
                  onMouseLeave={e => {
                    (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.75)';
                    (e.target as HTMLElement).style.background = 'transparent';
                  }}
                >
                  {label}
                </a>
              ))}
            </nav>

            {/* Auth buttons — à direita */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>

              {/* Fazer login */}
              <button
                onClick={() => navigate('/login')}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'rgba(255,255,255,0.75)', padding: '8px 16px',
                  borderRadius: '999px', fontSize: '15px',
                  fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.target as HTMLElement).style.color = '#fff';
                  (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                }}
                onMouseLeave={e => {
                  (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.75)';
                  (e.target as HTMLElement).style.background = 'transparent';
                }}
              >
                Fazer login
              </button>

              {/* Cadastre-se — destaque com borda */}
              <button
                onClick={() => navigate('/register')}
                style={{
                  background: 'transparent',
                  border: '1.5px solid rgba(255,255,255,0.85)',
                  color: '#fff', padding: '8px 20px',
                  borderRadius: '999px', fontSize: '15px',
                  fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.target as HTMLElement).style.background = '#fff';
                  (e.target as HTMLElement).style.color = '#0a0a0a';
                }}
                onMouseLeave={e => {
                  (e.target as HTMLElement).style.background = 'transparent';
                  (e.target as HTMLElement).style.color = '#fff';
                }}
              >
                Cadastre-se
              </button>
            </div>

          </div>
        </header>

        {/* ── Hero ── */}
        <section style={{
          position: 'relative', zIndex: 1,
          maxWidth: '1100px', margin: '0 auto',
          padding: '120px 24px 100px',
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '80px', alignItems: 'center',
        }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'rgba(16,136,101,0.12)',
              border: '1px solid rgba(16,136,101,0.3)',
              borderRadius: '999px', padding: '6px 14px',
              fontSize: '12px', color: '#4ecca0', marginBottom: '32px',
              fontWeight: 500, letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#108865', display: 'inline-block' }} />
              Plataforma de gestão de frota
            </div>

            <h1 style={{
              fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 800,
              lineHeight: 1.05, letterSpacing: '-2px', margin: '0 0 24px',
            }}>
              Gerencie sua<br />frota com<br />
              <span style={{ color: '#108865' }}>precisão.</span>
            </h1>

            <p style={{
              fontSize: '18px', lineHeight: 1.7,
              color: 'rgba(255,255,255,0.5)', margin: '0 0 48px', maxWidth: '440px',
            }}>
              Uma plataforma completa para motoristas e gestores. Ganhos, saques,
              documentos e frota — tudo em um só lugar.
            </p>

            {/* ← btn-float: classe definida no floatCSS (flutua 6px, pausa no hover) */}
            <button
              onClick={() => navigate('/login')}
              className="btn-float"
              style={{
                background: '#108865', border: 'none', color: '#fff',
                padding: '14px 32px', borderRadius: '999px',
                fontSize: '15px', fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.target as HTMLElement).style.background = '#0d7557'}
              onMouseLeave={e => (e.target as HTMLElement).style.background = '#108865'}
            >
              Acessar plataforma →
            </button>
          </div>

          {/* Card preview */}
          <div style={{ position: 'relative' }}>
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '24px', padding: '32px',
            }}>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Visão geral do motorista
              </p>
              <div style={{ marginBottom: '24px' }}>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>Saldo disponível</p>
                <p style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-1px', color: '#4ecca0' }}>R$ 3.240,75</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                {[
                  { label: 'Ganhos do mês', value: 'R$ 8.420' },
                  { label: 'Corridas',      value: '847'       },
                  { label: 'Avaliação',     value: '4.9 ★'    },
                  { label: 'Documentos',    value: '3 ativos'  },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '12px', padding: '14px',
                  }}>
                    <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>{label}</p>
                    <p style={{ fontSize: '18px', fontWeight: 600 }}>{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Meta mensal</span>
                  <span style={{ fontSize: '12px', color: '#4ecca0' }}>84%</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px' }}>
                  <div style={{ width: '84%', height: '100%', background: '#108865', borderRadius: '999px' }} />
                </div>
              </div>
            </div>

            <div style={{
              position: 'absolute', bottom: '-20px', left: '-20px',
              background: '#111', border: '1px solid rgba(16,136,101,0.3)',
              borderRadius: '16px', padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: '10px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            }}>
              <div style={{
                width: '32px', height: '32px', background: 'rgba(16,136,101,0.15)',
                borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
              }}>✅</div>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>Saque aprovado</p>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>R$ 1.500,00 · agora mesmo</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section style={{
          position: 'relative', zIndex: 1,
          maxWidth: '1100px', margin: '0 auto',
          padding: '80px 24px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '2px', color: '#108865', textAlign: 'center', marginBottom: '16px' }}>
            Funcionalidades
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700, textAlign: 'center', letterSpacing: '-1.5px', margin: '0 0 64px' }}>
            Tudo que você precisa
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {[
              { icon: '💰', title: 'Controle de ganhos',   desc: 'Registre e acompanhe seus ganhos por plataforma — Uber, Bolt e muito mais.' },
              { icon: '🏦', title: 'Saques simplificados', desc: 'Solicite retiradas com poucos cliques. Aprovação rápida e histórico completo.' },
              { icon: '📄', title: 'Gestão de documentos', desc: 'Envie e acompanhe o status da sua CNH, CRLV e demais documentos obrigatórios.' },
              { icon: '🚗', title: 'Gestão de frota',      desc: 'Admins têm visão completa da frota: status, manutenção e associação de motoristas.' },
              { icon: '📊', title: 'Analytics avançado',   desc: 'Dashboards com gráficos de receita, corridas por plataforma e top motoristas.' },
              { icon: '🔔', title: 'Notificações',         desc: 'Fique por dentro de aprovações, vencimentos de documentos e metas atingidas.' },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '20px', padding: '28px', transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(16,136,101,0.3)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(16,136,101,0.05)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '16px' }}>{icon}</div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '10px', letterSpacing: '-0.3px' }}>{title}</h3>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA final ── */}
        <section style={{
          position: 'relative', zIndex: 1,
          maxWidth: '1100px', margin: '0 auto',
          padding: '80px 24px 120px',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(16,136,101,0.15), rgba(16,136,101,0.05))',
            border: '1px solid rgba(16,136,101,0.25)',
            borderRadius: '32px', padding: '80px 48px', textAlign: 'center',
          }}>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-2px', margin: '0 0 16px' }}>
              Pronto para começar?
            </h2>
            <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.5)', margin: '0 0 40px' }}>
              Acesse sua conta e tenha controle total da sua operação.
            </p>

            {/* ← btn-float-lg: classe definida no floatCSS (flutua 8px, sombra maior, pausa no hover) */}
            <button
              onClick={() => navigate('/login')}
              className="btn-float-lg"
              style={{
                background: '#108865', border: 'none', color: '#fff',
                padding: '16px 40px', borderRadius: '999px',
                fontSize: '16px', fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.target as HTMLElement).style.background = '#0d7557'}
              onMouseLeave={e => (e.target as HTMLElement).style.background = '#108865'}
            >
              Acessar plataforma →
            </button>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '32px 24px', textAlign: 'center',
          color: 'rgba(255,255,255,0.25)', fontSize: '13px',
          position: 'relative', zIndex: 1,
        }}>
          © 2026 DragonFleet. Todos os direitos reservados.
        </footer>

      </div>
    </>
  );
}