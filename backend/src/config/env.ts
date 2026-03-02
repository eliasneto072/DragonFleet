import dotenv from 'dotenv'

dotenv.config()

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3000),

  // Database
  DATABASE_URL: process.env.DATABASE_URL ?? '',

  // Auth
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '1h',
  JWT_ISSUER: process.env.JWT_ISSUER,
  JWT_AUDIENCE: process.env.JWT_AUDIENCE,
};

// Optional runtime check: require DATABASE_URL outside of local-only setups
export function assertEnv(): void {
  // If you use prisma.config.ts to provide the datasource URL, you can ignore DATABASE_URL.
  // Still, it's good to have it for Docker/CI.
  if (!env.DATABASE_URL) {
    // don't hard-crash in dev by default; uncomment if you want it strict
    // required('DATABASE_URL');
  }
}
