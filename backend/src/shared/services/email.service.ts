// src/shared/services/email.service.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = 'DragonFleet <onboarding@resend.dev>';

export const emailService = {
  async sendDocumentApproved(to: string, driverName: string, docType: string) {
    await resend.emails.send({
      from:    FROM,
      to,
      subject: '✅ Documento aprovado — DragonFleet',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
          <div style="text-align:center;margin-bottom:24px">
            <h1 style="color:#108865;margin:0">🐉 DragonFleet</h1>
          </div>
          <h2 style="color:#1D1D1D">Olá, ${driverName}!</h2>
          <p style="color:#444;line-height:1.6">
            O seu documento <strong>${docType}</strong> foi <strong style="color:#108865">aprovado</strong> pela nossa equipa.
          </p>
          <p style="color:#444;line-height:1.6">
            Já pode aceder ao portal e continuar a utilizar a plataforma normalmente.
          </p>
          <div style="margin:32px 0;text-align:center">
            <a href="${process.env.FRONTEND_URL ?? 'http://localhost'}/app/driver/documents"
               style="background:#108865;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
              Ver Documentos
            </a>
          </div>
          <p style="color:#999;font-size:12px;text-align:center">DragonFleet — Plataforma de Gestão de Frotas</p>
        </div>
      `,
    });
  },

  async sendDocumentRejected(to: string, driverName: string, docType: string, notes?: string) {
    await resend.emails.send({
      from:    FROM,
      to,
      subject: '❌ Documento rejeitado — DragonFleet',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
          <div style="text-align:center;margin-bottom:24px">
            <h1 style="color:#108865;margin:0">🐉 DragonFleet</h1>
          </div>
          <h2 style="color:#1D1D1D">Olá, ${driverName}!</h2>
          <p style="color:#444;line-height:1.6">
            O seu documento <strong>${docType}</strong> foi <strong style="color:#e53e3e">rejeitado</strong>.
          </p>
          ${notes ? `
          <div style="background:#fff3f3;border-left:4px solid #e53e3e;padding:12px 16px;border-radius:4px;margin:16px 0">
            <p style="margin:0;color:#c53030;font-size:14px"><strong>Motivo:</strong> ${notes}</p>
          </div>` : ''}
          <p style="color:#444;line-height:1.6">
            Por favor, aceda ao portal e faça o upload de um novo documento válido.
          </p>
          <div style="margin:32px 0;text-align:center">
            <a href="${process.env.FRONTEND_URL ?? 'http://localhost'}/app/driver/documents"
               style="background:#108865;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
              Atualizar Documento
            </a>
          </div>
          <p style="color:#999;font-size:12px;text-align:center">DragonFleet — Plataforma de Gestão de Frotas</p>
        </div>
      `,
    });
  },

  async sendWithdrawalApproved(to: string, driverName: string, amount: number) {
    await resend.emails.send({
      from:    FROM,
      to,
      subject: '✅ Saque aprovado — DragonFleet',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
          <div style="text-align:center;margin-bottom:24px">
            <h1 style="color:#108865;margin:0">🐉 DragonFleet</h1>
          </div>
          <h2 style="color:#1D1D1D">Olá, ${driverName}!</h2>
          <p style="color:#444;line-height:1.6">
            O seu pedido de saque de <strong style="color:#108865">€ ${amount.toFixed(2)}</strong> foi <strong style="color:#108865">aprovado</strong>.
          </p>
          <p style="color:#444;line-height:1.6">
            O valor será processado em breve e transferido para a sua conta.
          </p>
          <div style="margin:32px 0;text-align:center">
            <a href="${process.env.FRONTEND_URL ?? 'http://localhost'}/app/driver/withdrawals"
               style="background:#108865;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
              Ver Saques
            </a>
          </div>
          <p style="color:#999;font-size:12px;text-align:center">DragonFleet — Plataforma de Gestão de Frotas</p>
        </div>
      `,
    });
  },

  async sendWithdrawalRejected(to: string, driverName: string, amount: number, notes?: string) {
    await resend.emails.send({
      from:    FROM,
      to,
      subject: '❌ Saque rejeitado — DragonFleet',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
          <div style="text-align:center;margin-bottom:24px">
            <h1 style="color:#108865;margin:0">🐉 DragonFleet</h1>
          </div>
          <h2 style="color:#1D1D1D">Olá, ${driverName}!</h2>
          <p style="color:#444;line-height:1.6">
            O seu pedido de saque de <strong>€ ${amount.toFixed(2)}</strong> foi <strong style="color:#e53e3e">rejeitado</strong>.
          </p>
          ${notes ? `
          <div style="background:#fff3f3;border-left:4px solid #e53e3e;padding:12px 16px;border-radius:4px;margin:16px 0">
            <p style="margin:0;color:#c53030;font-size:14px"><strong>Motivo:</strong> ${notes}</p>
          </div>` : ''}
          <p style="color:#444;line-height:1.6">
            O saldo foi restituído à sua conta. Se tiver dúvidas, contacte o suporte.
          </p>
          <div style="margin:32px 0;text-align:center">
            <a href="${process.env.FRONTEND_URL ?? 'http://localhost'}/app/driver/support"
               style="background:#108865;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
              Contactar Suporte
            </a>
          </div>
          <p style="color:#999;font-size:12px;text-align:center">DragonFleet — Plataforma de Gestão de Frotas</p>
        </div>
      `,
    });
  },
};