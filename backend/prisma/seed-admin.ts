// backend/prisma/seed-admin.ts
// Cria um utilizador admin a partir das variáveis de ambiente.
// Uso: npm run seed:admin
//
// FIX: as credenciais deixaram de estar hardcoded. Agora vêm do .env:
//   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD e (opcional) SEED_ADMIN_NAME.
// A password nunca é impressa no terminal. Se as variáveis não estiverem
// definidas, o script falha com uma mensagem clara em vez de criar um admin
// com credenciais previsíveis.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(
      `\n[seed-admin] Variável de ambiente ${name} não definida.\n` +
      `Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no seu .env antes de correr o seed.\n`,
    );
    process.exit(1);
  }
  return value.trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  const email    = requireEnv('SEED_ADMIN_EMAIL');
  const password = requireEnv('SEED_ADMIN_PASSWORD');
  const name     = process.env.SEED_ADMIN_NAME?.trim() || 'Administrador';

  if (!isValidEmail(email)) {
    console.error(`[seed-admin] SEED_ADMIN_EMAIL inválido: "${email}"`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('[seed-admin] SEED_ADMIN_PASSWORD deve ter pelo menos 8 caracteres.');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed-admin] Utilizador já existe: ${email} (nada a fazer).`);
    return;
  }

  const hash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { name, email, password: hash, role: 'ADMIN', status: 'ACTIVE' },
  });

  // Nunca imprimir a password. Mostrar apenas dados não sensíveis.
  console.log('[seed-admin] Admin criado com sucesso!');
  console.log(`  Email: ${user.email}`);
  console.log(`  Role:  ${user.role}`);
  console.log('  Password: (definida a partir de SEED_ADMIN_PASSWORD)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
