// src/features/landing/pages/LandingPage.tsx

import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { Menu, X } from 'lucide-react';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) return null;

  if (isAuthenticated && user) {
    return <Navigate to={user.role === 'DRIVER' ? '/app/driver' : '/app/admin'} replace />;
  }

  return (
    <>
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
            maxWidth: '1200px', margin: '0 auto', padding: '0 20px',
            height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <svg width="28" height="28" viewBox="0 0 100 100" fill="none">
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
              <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '-0.3px', color: '#fff' }}>
                Dragon<span style={{ color: '#108865' }}>Fleet</span>
              </span>
            </div>

            {/* Nav links — só desktop */}
            <nav style={{ display: 'none', alignItems: 'center', gap: '4px', flex: 1, marginLeft: '32px' }}
              className="md-nav">
              {['Motoristas', 'Plataforma', 'Empresa', 'Suporte'].map(label => (
                <a key={label} href="#features" style={{
                  color: 'rgba(255,255,255,0.75)', textDecoration: 'none',
                  fontSize: '14px', fontWeight: 500, padding: '6px 12px',
                  borderRadius: '999px', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.color = '#fff'; (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.75)'; (e.target as HTMLElement).style.background = 'transparent'; }}
                >{label}</a>
              ))}
            </nav>

            {/* Botões auth — desktop */}
            <div className="auth-btns" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => navigate('/login')} style={{
                background: 'transparent', border: 'none',
                color: 'rgba(255,255,255,0.75)', padding: '8px 14px',
                borderRadius: '999px', fontSize: '14px',
                fontWeight: 500, cursor: 'pointer',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = '#fff'; (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.75)'; (e.target as HTMLElement).style.background = 'transparent'; }}
              >Entrar</button>
              <button onClick={() => navigate('/register')} style={{
                background: 'transparent',
                border: '1.5px solid rgba(255,255,255,0.85)',
                color: '#fff', padding: '7px 18px',
                borderRadius: '999px', fontSize: '14px',
                fontWeight: 600, cursor: 'pointer',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.background = '#fff'; (e.target as HTMLElement).style.color = '#0a0a0a'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#fff'; }}
              >Cadastrar</button>
            </div>

            {/* Hamburguer — mobile (via inline style + useState) */}
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              style={{
                display: 'none',
                background: 'transparent', border: 'none', color: '#fff',
                cursor: 'pointer', padding: '4px',
              }}
              className="hamburger-btn"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>

          {/* Menu mobile */}
          {mobileMenuOpen && (
            <div style={{
              background: '#111', borderTop: '1px solid rgba(255,255,255,0.08)',
              padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
              <button onClick={() => { navigate('/login'); setMobileMenuOpen(false); }} style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff', padding: '10px', borderRadius: '8px',
                fontSize: '15px', fontWeight: 500, cursor: 'pointer',
              }}>Entrar</button>
              <button onClick={() => { navigate('/register'); setMobileMenuOpen(false); }} style={{
                background: '#108865', border: 'none',
                color: '#fff', padding: '10px', borderRadius: '8px',
                fontSize: '15px', fontWeight: 600, cursor: 'pointer',
              }}>Cadastrar</button>
            </div>
          )}

          {/* CSS para esconder/mostrar elementos responsivos */}
          <style>{`
            @media (min-width: 768px) {
              .md-nav { display: flex !important; }
              .hamburger-btn { display: none !important; }
            }
            @media (max-width: 767px) {
              .auth-btns { display: none !important; }
              .hamburger-btn { display: block !important; }
            }
          `}</style>
        </header>

        {/* ── Hero ── */}
        <section style={{
          position: 'relative', zIndex: 1,
          maxWidth: '1100px', margin: '0 auto',
          padding: '60px 20px 60px',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '48px',
            alignItems: 'center',
          }}>
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: 'rgba(16,136,101,0.12)',
                border: '1px solid rgba(16,136,101,0.3)',
                borderRadius: '999px', padding: '6px 14px',
                fontSize: '11px', color: '#4ecca0', marginBottom: '28px',
                fontWeight: 500, letterSpacing: '0.5px', textTransform: 'uppercase',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#108865', display: 'inline-block' }} />
                Plataforma de gestão de frota
              </div>

              <h1 style={{
                fontSize: 'clamp(32px, 6vw, 64px)', fontWeight: 800,
                lineHeight: 1.05, letterSpacing: '-2px', margin: '0 0 20px',
              }}>
                Gerencie sua<br />frota com<br />
                <span style={{ color: '#108865' }}>precisão.</span>
              </h1>

              <p style={{
                fontSize: 'clamp(15px, 2vw, 18px)', lineHeight: 1.7,
                color: 'rgba(255,255,255,0.5)', margin: '0 0 40px', maxWidth: '440px',
              }}>
                Uma plataforma completa para motoristas e gestores. Ganhos, saques,
                documentos e frota — tudo em um só lugar.
              </p>

              <button
                onClick={() => navigate('/login')}
                className="btn-float"
                style={{
                  background: '#108865', border: 'none', color: '#fff',
                  padding: '13px 28px', borderRadius: '999px',
                  fontSize: '15px', fontWeight: 600,
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.target as HTMLElement).style.background = '#0d7557'}
                onMouseLeave={e => (e.target as HTMLElement).style.background = '#108865'}
              >
                Acessar plataforma →
              </button>
            </div>

            {/* Card preview — esconde em telas muito pequenas */}
            <div style={{ position: 'relative' }} className="hero-card">
              <div style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '24px', padding: '28px',
              }}>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Visão geral do motorista
                </p>
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>Saldo disponível</p>
                  <p style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-1px', color: '#4ecca0' }}>R$ 3.240,75</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                  {[
                    { label: 'Ganhos do mês', value: 'R$ 8.420' },
                    { label: 'Corridas',      value: '847'       },
                    { label: 'Avaliação',     value: '4.9 ★'    },
                    { label: 'Documentos',    value: '3 ativos'  },
                  ].map(({ label, value }) => (
                    <div key={label} style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '10px', padding: '12px',
                    }}>
                      <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>{label}</p>
                      <p style={{ fontSize: '16px', fontWeight: 600 }}>{value}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Meta mensal</span>
                    <span style={{ fontSize: '11px', color: '#4ecca0' }}>84%</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px' }}>
                    <div style={{ width: '84%', height: '100%', background: '#108865', borderRadius: '999px' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <style>{`@media(max-width:480px){ .hero-card { display: none; } }`}</style>
        </section>

        {/* ── Features ── */}
        <section id="features" style={{
          position: 'relative', zIndex: 1,
          maxWidth: '1100px', margin: '0 auto',
          padding: '60px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', color: '#108865', textAlign: 'center', marginBottom: '12px' }}>
            Funcionalidades
          </p>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 44px)', fontWeight: 700, textAlign: 'center', letterSpacing: '-1px', margin: '0 0 48px' }}>
            Tudo que você precisa
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '14px',
          }}>
            {[
              { icon: '💰', title: 'Controle de ganhos',   desc: 'Registre e acompanhe seus ganhos por plataforma — Uber, Bolt e muito mais.' },
              { icon: '🏦', title: 'Saques simplificados', desc: 'Solicite retiradas com poucos cliques. Aprovação rápida e histórico completo.' },
              { icon: '📄', title: 'Gestão de documentos', desc: 'Envie e acompanhe o status da sua CNH, CRLV e demais documentos obrigatórios.' },
              { icon: '🚗', title: 'Gestão de frota',      desc: 'Admins têm visão completa da frota: status, manutenção e associação de motoristas.' },
              { icon: '📊', title: 'Analytics avançado',   desc: 'Dashboards com gráficos de receita, corridas por plataforma e top motoristas.' },
              { icon: '🔔', title: 'Notificações',         desc: 'Fique por dentro de aprovações, vencimentos de documentos e metas atingidas.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '18px', padding: '24px', transition: 'all 0.2s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(16,136,101,0.3)'; (e.currentTarget as HTMLElement).style.background = 'rgba(16,136,101,0.05)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
              >
                <div style={{ fontSize: '26px', marginBottom: '14px' }}>{icon}</div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', letterSpacing: '-0.3px' }}>{title}</h3>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section style={{
          position: 'relative', zIndex: 1,
          maxWidth: '1100px', margin: '0 auto',
          padding: '40px 20px 80px',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(16,136,101,0.15), rgba(16,136,101,0.05))',
            border: '1px solid rgba(16,136,101,0.25)',
            borderRadius: '24px', padding: 'clamp(40px, 8vw, 80px) clamp(20px, 5vw, 48px)',
            textAlign: 'center',
          }}>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-1.5px', margin: '0 0 14px' }}>
              Pronto para começar?
            </h2>
            <p style={{ fontSize: 'clamp(14px, 2vw, 17px)', color: 'rgba(255,255,255,0.5)', margin: '0 0 32px' }}>
              Acesse sua conta e tenha controle total da sua operação.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="btn-float-lg"
              style={{
                background: '#108865', border: 'none', color: '#fff',
                padding: '14px 36px', borderRadius: '999px',
                fontSize: '15px', fontWeight: 600, cursor: 'pointer',
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
          padding: '28px 20px', textAlign: 'center',
          color: 'rgba(255,255,255,0.25)', fontSize: '13px',
          position: 'relative', zIndex: 1,
        }}>
          © 2026 DragonFleet. Todos os direitos reservados.
        </footer>
      </div>
    </>
  );
}