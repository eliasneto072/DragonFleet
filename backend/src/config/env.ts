// src/config/env.ts
import dotenv from 'dotenv';
dotenv.config();

export const env = {
  NODE_ENV:       process.env.NODE_ENV ?? 'development',
  PORT:           Number(process.env.PORT ?? 3000),
  DATABASE_URL:   process.env.DATABASE_URL ?? '',

  // Auth
  JWT_SECRET:          process.env.JWT_SECRET ?? 'dev-secret-change-me',
  JWT_EXPIRES_IN:      process.env.JWT_EXPIRES_IN ?? '15m',
  JWT_REFRESH_SECRET:  process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  JWT_ISSUER:   process.env.JWT_ISSUER,
  JWT_AUDIENCE: process.env.JWT_AUDIENCE,
};

export function assertEnv(): void {
  if (!env.DATABASE_URL) {
    // uncomment to enforce: required('DATABASE_URL');
  }
}