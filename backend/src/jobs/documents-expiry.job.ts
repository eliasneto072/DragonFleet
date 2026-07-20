// src/jobs/documents-expiry.job.ts
//
// Verificação diária da validade dos documentos (regra dos 90 dias do Registo
// Criminal em Portugal). Duas responsabilidades:
//
//   1. AVISAR — documentos que expiram daqui a exatamente 7 dias geram uma
//      notificação in-app + email ao motorista.
//   2. EXPIRAR — documentos aprovados cuja data de expiração já passou ficam
//      com status EXPIRED, e o motorista passa a AGUARDANDO_REGULARIZACAO.
//
// O job corre sem "actor" (é automático), por isso fala diretamente com o
// prisma e o emailService, sem passar pela camada de permissões.

import { prisma } from '../config/prisma';
import { emailService } from '../shared/services/email.service';
import {
  DocumentStatus,
  DocumentType,
  UserStatus,
} from '../shared/types/enums';

const WARNING_DAYS = 7;
const DOC_LABEL = 'Registo Criminal';

/** Início e fim (UTC) do dia que cai daqui a N dias. */
function dayWindow(daysFromNow: number): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + daysFromNow);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** Cria notificação in-app + envia email (best-effort). */
async function notifyDriver(
  userId: string,
  email: string,
  name: string,
  title: string,
  message: string,
): Promise<void> {
  try {
    await prisma.notification.create({ data: { title, message, userId } });
  } catch (err) {
    console.error('[expiry-job] Falha ao criar notificação in-app:', err);
  }
  try {
    if (email) await emailService.sendNotification(email, name, title, message);
  } catch (err) {
    console.error('[expiry-job] Falha ao enviar email:', err);
  }
}

/** (1) Avisa motoristas cujo Registo Criminal expira daqui a 7 dias. */
export async function warnExpiringSoon(): Promise<number> {
  const { start, end } = dayWindow(WARNING_DAYS);

  const docs = await prisma.document.findMany({
    where: {
      type: DocumentType.REGISTO_CRIMINAL,
      status: DocumentStatus.APPROVED,
      expiresAt: { gte: start, lt: end },
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  for (const doc of docs) {
    const dateStr = doc.expiresAt
      ? new Date(doc.expiresAt).toLocaleDateString('pt-PT')
      : '';
    await notifyDriver(
      doc.user.id,
      doc.user.email,
      doc.user.name,
      'O seu Registo Criminal está a expirar',
      `O seu ${DOC_LABEL} expira a ${dateStr} (em ${WARNING_DAYS} dias). ` +
        'Por favor, submeta um documento atualizado para continuar ativo na plataforma.',
    );
  }

  if (docs.length) console.log(`[expiry-job] ${docs.length} aviso(s) de expiração enviados.`);
  return docs.length;
}

/** (2) Expira documentos vencidos e põe o motorista em regularização. */
export async function expireOverdue(): Promise<number> {
  const now = new Date();

  const docs = await prisma.document.findMany({
    where: {
      type: DocumentType.REGISTO_CRIMINAL,
      status: DocumentStatus.APPROVED,
      expiresAt: { lt: now },
    },
    include: { user: { select: { id: true, name: true, email: true, status: true } } },
  });

  for (const doc of docs) {
    // Marca o documento como expirado e o motorista como "aguardando regularização"
    // numa transação, para os dois ficarem sempre coerentes.
    await prisma.$transaction([
      prisma.document.update({
        where: { id: doc.id },
        data: { status: DocumentStatus.EXPIRED },
      }),
      prisma.user.update({
        where: { id: doc.user.id },
        data: { status: UserStatus.AGUARDANDO_REGULARIZACAO },
      }),
    ]);

    await notifyDriver(
      doc.user.id,
      doc.user.email,
      doc.user.name,
      'Registo Criminal expirado',
      `O seu ${DOC_LABEL} expirou. A sua conta está em modo "aguardando regularização". ` +
        'Submeta um documento atualizado para reativar o seu acesso.',
    );
  }

  if (docs.length) console.log(`[expiry-job] ${docs.length} documento(s) expirado(s).`);
  return docs.length;
}

/** Executa a verificação completa (avisos + expirações). */
export async function runDocumentsExpiryCheck(): Promise<{ warned: number; expired: number }> {
  console.log('[expiry-job] A correr verificação de validade de documentos…');
  const expired = await expireOverdue();
  const warned = await warnExpiringSoon();
  return { warned, expired };
}
