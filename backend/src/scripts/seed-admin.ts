// backend/src/scripts/seed-admin.ts
//
// Cria o utilizador administrador a partir das variáveis de ambiente:
//   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD e (opcional) SEED_ADMIN_NAME.
//
// A palavra-passe nunca é impressa. Sem as variáveis, o script pára com uma
// mensagem clara em vez de criar um administrador com credenciais previsíveis.
//
// ─── POR QUE ESTE FICHEIRO ESTÁ EM src/ E NÃO EM prisma/ ─────────────────────
//
// Porque em prisma/ ele não corria em lado nenhum a não ser na máquina de quem
// o escreveu.
//
// O tsconfig compila `src/**/*` para `dist/`, e a imagem de produção leva o
// `dist/` mas não o `src/`. O `tsx`, que sabe correr TypeScript, é uma
// devDependency e a produção instala com `--omit=dev`. Estando o seed em
// prisma/, o ficheiro chegava ao contentor — a pasta é copiada — mas não havia
// nada lá dentro capaz de o executar. Restava o `npx -y tsx`, que descarrega
// cinco megabytes na hora para correr trinta linhas, e falha se a rede estiver
// fechada.
//
// Daqui, compila com o resto e corre com o Node que já lá está:
//
//   node dist/scripts/seed-admin.js
//
// Vale para o contentor local e para o do Render, que são a mesma imagem.
//
// Os outros seeds — seed-demo e seed-perf — ficam em prisma/ de propósito: são
// de desenvolvimento, correm da máquina de quem trabalha, e não têm nada que
// fazer numa imagem de produção.

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
