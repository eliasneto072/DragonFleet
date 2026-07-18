// src/shared/services/email.service.ts
//
// FIX for "notifications not arriving by email":
//  1. Sender is now configurable via MAIL_FROM (was hardcoded to
//     onboarding@resend.dev). Resend only delivers FROM that test address to
//     your OWN Resend account email — so emails to real drivers were silently
//     dropped. Set MAIL_FROM to an address on a domain you verified in Resend.
//  2. Every send goes through dispatch(), which validates config and LOGS the
//     real result (success id or the Resend error) instead of failing silently.
//  3. Missing/blank RESEND_API_KEY is detected and logged at startup; sends are
//     skipped gracefully instead of throwing deep inside Resend.
//
// See docs/EMAIL_SETUP.md for the domain-verification steps.

import { Resend } from 'resend';

const API_KEY = process.env.RESEND_API_KEY ?? '';
const FROM = process.env.MAIL_FROM ?? 'DragonFleet <onboarding@resend.dev>';
const APP_URL = process.env.FRONTEND_URL ?? 'http://localhost';

const isConfigured = API_KEY.trim().length > 0;
const usingTestSender = FROM.includes('onboarding@resend.dev');

if (!isConfigured) {
  console.warn(
    '[email] RESEND_API_KEY não definida — os emails NÃO serão enviados. ' +
    'Adicione a chave ao ambiente para ativar as notificações por email.',
  );
} else if (usingTestSender) {
  console.warn(
    '[email] A usar onboarding@resend.dev como remetente. A Resend só entrega ' +
    'deste endereço para o email da sua própria conta (modo de teste). Verifique ' +
    'um domínio e defina MAIL_FROM para enviar a motoristas reais. Ver docs/EMAIL_SETUP.md.',
  );
}

const resend = isConfigured ? new Resend(API_KEY) : null;

interface DispatchResult { ok: boolean; id?: string; error?: string }

/** Único ponto de envio: valida configuração e regista o resultado. */
async function dispatch(to: string, subject: string, html: string): Promise<DispatchResult> {
  if (!resend) {
    console.warn(`[email] Ignorado "${subject}" para ${to} — serviço de email não configurado.`);
    return { ok: false, error: 'EMAIL_NOT_CONFIGURED' };
  }
  if (!to || !to.includes('@')) {
    console.warn(`[email] Ignorado "${subject}" — destinatário inválido: "${to}"`);
    return { ok: false, error: 'INVALID_RECIPIENT' };
  }

  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error(`[email] Resend rejeitou "${subject}" para ${to}:`, error);
      return { ok: false, error: error.message ?? 'RESEND_ERROR' };
    }
    console.log(`[email] Enviado "${subject}" para ${to} (id: ${data?.id})`);
    return { ok: true, id: data?.id };
  } catch (err: any) {
    console.error(`[email] Exceção ao enviar "${subject}" para ${to}:`, err?.message ?? err);
    return { ok: false, error: err?.message ?? 'UNKNOWN' };
  }
}

const euro = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

// ── Layout partilhado (mantém o visual dos emails atuais) ────────────────────
function shell(driverName: string, bodyHtml: string, cta?: { href: string; label: string }) {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <h1 style="color:#108865;margin:0">🐉 DragonFleet</h1>
      </div>
      <h2 style="color:#1D1D1D">Olá, ${driverName}!</h2>
      ${bodyHtml}
      ${cta ? `
      <div style="margin:32px 0;text-align:center">
        <a href="${cta.href}" style="background:#108865;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
          ${cta.label}
        </a>
      </div>` : ''}
      <p style="color:#999;font-size:12px;text-align:center">DragonFleet — Plataforma de Gestão de Frotas</p>
    </div>
  `;
}

export const emailService = {
  /** True quando há chave de API configurada. */
  get enabled() { return isConfigured; },

  async sendDocumentApproved(to: string, driverName: string, docType: string) {
    return dispatch(to, '✅ Documento aprovado — DragonFleet', shell(
      driverName,
      `<p style="color:#444;line-height:1.6">O seu documento <strong>${docType}</strong> foi <strong style="color:#108865">aprovado</strong> pela nossa equipa.</p>
       <p style="color:#444;line-height:1.6">Já pode aceder ao portal e continuar a utilizar a plataforma normalmente.</p>`,
      { href: `${APP_URL}/app/driver/documents`, label: 'Ver Documentos' },
    ));
  },

  async sendDocumentRejected(to: string, driverName: string, docType: string, notes?: string) {
    return dispatch(to, '❌ Documento rejeitado — DragonFleet', shell(
      driverName,
      `<p style="color:#444;line-height:1.6">O seu documento <strong>${docType}</strong> foi <strong style="color:#e53e3e">rejeitado</strong>.</p>
       ${notes ? `<div style="background:#fff3f3;border-left:4px solid #e53e3e;padding:12px 16px;border-radius:4px;margin:16px 0">
         <p style="margin:0;color:#c53030;font-size:14px"><strong>Motivo:</strong> ${notes}</p></div>` : ''}
       <p style="color:#444;line-height:1.6">Por favor, aceda ao portal e faça o upload de um novo documento válido.</p>`,
      { href: `${APP_URL}/app/driver/documents`, label: 'Atualizar Documento' },
    ));
  },

  async sendWithdrawalApproved(to: string, driverName: string, amount: number) {
    return dispatch(to, '✅ Saque aprovado — DragonFleet', shell(
      driverName,
      `<p style="color:#444;line-height:1.6">O seu pedido de saque de <strong style="color:#108865">${euro(amount)}</strong> foi <strong style="color:#108865">aprovado</strong>.</p>
       <p style="color:#444;line-height:1.6">O valor será processado em breve e transferido para a sua conta.</p>`,
      { href: `${APP_URL}/app/driver/withdrawals`, label: 'Ver Saques' },
    ));
  },

  async sendWithdrawalRejected(to: string, driverName: string, amount: number, notes?: string) {
    return dispatch(to, '❌ Saque rejeitado — DragonFleet', shell(
      driverName,
      `<p style="color:#444;line-height:1.6">O seu pedido de saque de <strong>${euro(amount)}</strong> foi <strong style="color:#e53e3e">rejeitado</strong>.</p>
       ${notes ? `<div style="background:#fff3f3;border-left:4px solid #e53e3e;padding:12px 16px;border-radius:4px;margin:16px 0">
         <p style="margin:0;color:#c53030;font-size:14px"><strong>Motivo:</strong> ${notes}</p></div>` : ''}
       <p style="color:#444;line-height:1.6">O saldo foi restituído à sua conta. Se tiver dúvidas, contacte o suporte.</p>`,
      { href: `${APP_URL}/app/driver/support`, label: 'Contactar Suporte' },
    ));
  },

  async sendNotification(to: string, driverName: string, title: string, message: string) {
    return dispatch(to, `🔔 ${title} — DragonFleet`, shell(
      driverName,
      `<div style="background:#fff;border-left:4px solid #108865;padding:16px;border-radius:4px;margin:16px 0">
         <h3 style="margin:0 0 8px;color:#1D1D1D">${title}</h3>
         <p style="margin:0;color:#444;line-height:1.6">${message}</p>
       </div>`,
      { href: `${APP_URL}/app/driver/notifications`, label: 'Ver Notificações' },
    ));
  },
};
