// src/features/landing/pages/LandingPage.tsx

import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import {
  Menu, X,
  Calculator, Banknote, FileCheck2, Landmark, Car, Bell,
} from 'lucide-react';
import { DragonFleetLogo } from '@/app/components/DragonFleetLogo';

const floatCSS = [
  '@keyframes float {',
  '  0%, 100% { transform: translateY(0px);  box-shadow: 0 4px 20px rgba(16,136,101,0.25); }',
  '  50%       { transform: translateY(-6px); box-shadow: 0 8px 30px rgba(16,136,101,0.35); }',
  '}',
  '@keyframes float-lg {',
  '  0%, 100% { transform: translateY(0px);  box-shadow: 0 4px 24px rgba(16,136,101,0.3); }',
  '  50%       { transform: translateY(-8px); box-shadow: 0 10px 34px rgba(16,136,101,0.4); }',
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
        background: '#f7f8f7',
        fontFamily: '"DM Sans", "Helvetica Neue", sans-serif',
        color: '#1a1a1a',
        overflowX: 'hidden',
      }}>

        {/* Grid de fundo */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 0,
          backgroundImage: 'linear-gradient(rgba(16,136,101,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(16,136,101,0.05) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        }} />

        {/* Brilho verde */}
        <div style={{
          position: 'fixed', top: '-200px', right: '-200px',
          width: '600px', height: '600px',
          background: 'radial-gradient(circle, rgba(16,136,101,0.10) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* ── Header ── */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderBottom: '1px solid #e4e6e4',
          background: 'rgba(247,248,247,0.85)', backdropFilter: 'blur(8px)',
        }}>
          <div style={{
            maxWidth: '1200px', margin: '0 auto', padding: '0 20px',
            height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {/* Logo.

                Era um SVG do carro desenhado à mão aqui dentro — a marca
                anterior, de antes do dragão. Ficou para trás quando os ícones
                foram trocados, porque esta página não usa o componente e
                ninguém a comparou com o resto. É a única cópia do logótipo
                fora do DragonFleetLogo; passar a usá-lo fecha a divergência. */}
            <DragonFleetLogo size={30} />

            {/* Nav — um link, e verdadeiro.

                Eram quatro (Motoristas, Plataforma, Empresa, Suporte) e os
                quatro apontavam para a mesma âncora, #features. Navegação que
                não navega ensina a não clicar em nada. */}
            <nav style={{ display: 'none', alignItems: 'center', flex: 1, marginLeft: '32px' }}
              className="md-nav">
              <a href="#features" style={{
                color: '#4b5563', textDecoration: 'none',
                fontSize: '14px', fontWeight: 500, padding: '6px 12px',
                borderRadius: '999px', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = '#108865'; (e.target as HTMLElement).style.background = 'rgba(16,136,101,0.08)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = '#4b5563'; (e.target as HTMLElement).style.background = 'transparent'; }}
              >Como funciona</a>
            </nav>

            {/* Botões auth — desktop */}
            <div className="auth-btns" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => navigate('/login')} style={{
                background: 'transparent', border: 'none',
                color: '#4b5563', padding: '8px 14px',
                borderRadius: '999px', fontSize: '14px',
                fontWeight: 500, cursor: 'pointer',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = '#108865'; (e.target as HTMLElement).style.background = 'rgba(16,136,101,0.08)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = '#4b5563'; (e.target as HTMLElement).style.background = 'transparent'; }}
              >Entrar</button>
              <button onClick={() => navigate('/register')} style={{
                background: 'transparent',
                border: '1.5px solid #108865',
                color: '#108865', padding: '7px 18px',
                borderRadius: '999px', fontSize: '14px',
                fontWeight: 600, cursor: 'pointer',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.background = '#108865'; (e.target as HTMLElement).style.color = '#fff'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = '#108865'; }}
              >Criar conta</button>
            </div>

            {/* Hamburguer — mobile (via inline style + useState) */}
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              style={{
                display: 'none',
                background: 'transparent', border: 'none', color: '#1a1a1a',
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
              background: '#fff', borderTop: '1px solid #e4e6e4',
              padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
              <button onClick={() => { navigate('/login'); setMobileMenuOpen(false); }} style={{
                background: 'transparent', border: '1px solid #d1d5db',
                color: '#1a1a1a', padding: '10px', borderRadius: '8px',
                fontSize: '15px', fontWeight: 500, cursor: 'pointer',
              }}>Entrar</button>
              <button onClick={() => { navigate('/register'); setMobileMenuOpen(false); }} style={{
                background: '#108865', border: 'none',
                color: '#fff', padding: '10px', borderRadius: '8px',
                fontSize: '15px', fontWeight: 600, cursor: 'pointer',
              }}>Criar conta</button>
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
                Área do motorista
              </div>

              <h1 style={{
                fontSize: 'clamp(32px, 6vw, 64px)', fontWeight: 800,
                lineHeight: 1.05, letterSpacing: '-2px', margin: '0 0 20px',
              }}>
                As contas da<br />sua semana,<br />
                <span style={{ color: '#108865' }}>à vista.</span>
              </h1>

              <p style={{
                fontSize: 'clamp(15px, 2vw, 18px)', lineHeight: 1.7,
                color: '#6b7280', margin: '0 0 40px', maxWidth: '440px',
              }}>
                Cada semana fechada mostra o que entrou na Uber e na Bolt, o que saiu
                em despesas, e quanto fica para si. Sem contas de cabeça e sem esperar
                pela resposta a uma mensagem.
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
                Entrar →
              </button>
            </div>

            {/* Card preview — esconde em telas muito pequenas */}
            <div style={{ position: 'relative' }} className="hero-card">
              <div style={{
                background: '#fff',
                border: '1px solid #e4e6e4',
                borderRadius: '24px', padding: '28px', boxShadow: '0 8px 30px rgba(16,24,40,0.08)',
              }}>
                <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Fecho da semana · 18–24 ago
                </p>

                <div style={{ marginBottom: '18px' }}>
                  <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>Disponível para retirada</p>
                  <p style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-1px', color: '#108865' }}>€ 884,50</p>
                </div>

                {/* Ilustração, não um extrato.

                    Antes estavam aqui quatro caixas com "Corridas 847",
                    "Avaliação 4.9" e "Meta mensal 84%" — nenhuma dessas três
                    coisas existe no schema nem em qualquer rota.

                    A comissão fica de fora de propósito: os motoristas já
                    sabem como funciona, e abrir a primeira tela com a
                    percentagem à frente desanima sem necessidade. Ela aparece
                    onde tem de aparecer, no fecho semanal dentro da conta.

                    Os números escolhidos fecham na mesma: 620 + 480 menos
                    215,50 dão os 884,50 do topo. Quem fizer a conta de cabeça
                    não encontra uma diferença por explicar. */}
                <div style={{
                  display: 'grid', gap: '1px', background: '#eceeec',
                  border: '1px solid #eceeec', borderRadius: '10px', overflow: 'hidden',
                }}>
                  {[
                    { label: 'Uber',     value: '€ 620,00',   desconto: false },
                    { label: 'Bolt',     value: '€ 480,00',   desconto: false },
                    { label: 'Despesas', value: '− € 215,50', desconto: true  },
                  ].map(({ label, value, desconto }) => (
                    <div key={label} style={{
                      background: '#fff', padding: '10px 12px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>{label}</span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: desconto ? '#b42318' : '#1a1a1a' }}>{value}</span>
                    </div>
                  ))}
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
          borderTop: '1px solid #e4e6e4',
        }}>
          <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', color: '#108865', textAlign: 'center', marginBottom: '12px' }}>
            O que encontra aqui
          </p>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 44px)', fontWeight: 700, textAlign: 'center', letterSpacing: '-1px', margin: '0 0 48px' }}>
            Tudo o que precisa
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '14px',
          }}>
            {/* Emoji fora.

                Cada sistema desenha o seu: o do Windows não é o do Android nem
                o do iPhone, e não há forma de controlar isso. Ícones de traço
                do lucide-react, que já é dependência e já estava importado
                aqui para o menu, dão o mesmo desenho em todo o lado.

                Saíram também as duas entradas de administração — "Gestão de
                frota" e "Analytics avançado". Quem lê esta página é o
                motorista: é para ele que o registo cria conta, com o papel
                fixado no servidor. Anunciar-lhe telas que ele nunca vai ver é
                prometer o que não se entrega. */}
            {[
              { Icone: Calculator, title: 'Fecho semanal',    desc: 'O que entrou em cada plataforma, o que saiu em despesas e a percentagem aplicada. A comissão incide sobre o lucro, não sobre o bruto.' },
              { Icone: Banknote,   title: 'Retiradas',        desc: 'Peça a retirada do saldo disponível. Anexa o recibo verde e o dinheiro segue para o IBAN que registou.' },
              { Icone: FileCheck2, title: 'Documentos',       desc: 'Cartão de cidadão, carta de condução, certificado TVDE e os do veículo. A plataforma avisa antes de cada um caducar.' },
              { Icone: Landmark,   title: 'Dados bancários',  desc: 'Registe o IBAN uma vez, com comprovativo. Fica congelado em cada retirada aprovada, para o histórico não mudar depois de pago.' },
              { Icone: Car,        title: 'A sua viatura',    desc: 'A viatura que lhe está associada e o estado dos documentos dela.' },
              { Icone: Bell,       title: 'Notificações',     desc: 'Fecho publicado, retirada aprovada, documento a caducar.' },
            ].map(({ Icone, title, desc }) => (
              <div key={title} style={{
                background: '#fff',
                border: '1px solid #e4e6e4',
                borderRadius: '18px', padding: '24px', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(16,24,40,0.04)',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(16,136,101,0.4)'; (e.currentTarget as HTMLElement).style.background = 'rgba(16,136,101,0.04)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e4e6e4'; (e.currentTarget as HTMLElement).style.background = '#fff'; }}
              >
                <div style={{ marginBottom: '14px', lineHeight: 0 }}>
                  <Icone size={24} strokeWidth={1.75} color="#108865" />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', letterSpacing: '-0.3px' }}>{title}</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6, margin: 0 }}>{desc}</p>
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
            background: 'linear-gradient(135deg, #0d6b4f, #108865)',
            border: '1px solid #0d6b4f',
            borderRadius: '24px', padding: 'clamp(40px, 8vw, 80px) clamp(20px, 5vw, 48px)',
            textAlign: 'center',
          }}>
            {/* A cor é explícita porque tem de ser: este h2 não a declarava e
                herdava o escuro do corpo da página, ficando quase preto sobre
                o verde do painel. O parágrafo abaixo já tinha branco, o que
                escondia o problema — parecia decisão e era esquecimento. */}
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-1.5px', margin: '0 0 14px', color: '#fff' }}>
              Já conduz connosco?
            </h2>
            <p style={{ fontSize: 'clamp(14px, 2vw, 17px)', color: 'rgba(255,255,255,0.85)', margin: '0 0 32px' }}>
              Crie a sua conta ou entre com a que já tem. A associação à viatura e aos
              fechos é feita pela administração.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="btn-float-lg"
              style={{
                background: '#fff', border: 'none', color: '#0d6b4f',
                padding: '14px 36px', borderRadius: '999px',
                fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              }}
              onMouseEnter={e => (e.target as HTMLElement).style.background = '#f0f0f0'}
              onMouseLeave={e => (e.target as HTMLElement).style.background = '#fff'}
            >
              Entrar →
            </button>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{
          borderTop: '1px solid #e4e6e4',
          padding: '28px 20px', textAlign: 'center',
          color: '#9ca3af', fontSize: '13px',
          position: 'relative', zIndex: 1,
        }}>
          © 2026 DragonFleet. Todos os direitos reservados.
        </footer>
      </div>
    </>
  );
}