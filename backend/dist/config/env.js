"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.assertEnv = assertEnv;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function required(name) {
    const v = process.env[name];
    if (!v)
        throw new Error(`Missing environment variable: ${name}`);
    return v;
}
exports.env = {
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
function assertEnv() {
    // If you use prisma.config.ts to provide the datasource URL, you can ignore DATABASE_URL.
    // Still, it's good to have it for Docker/CI.
    if (!exports.env.DATABASE_URL) {
        // don't hard-crash in dev by default; uncomment if you want it strict
        // required('DATABASE_URL');
    }
}
