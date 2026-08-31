// src/config/env.ts
import dotenv from 'dotenv';
dotenv.config();

/**
 * Segredos com valor por omissão são uma porta aberta.
 *
 * O JWT_SECRET tinha `?? 'dev-secret-change-me'`. Num sistema em produção sem
 * a variável definida, qualquer pessoa que conheça esse texto — e ele estava
 * no código, num repositório público — consegue assinar um token de
 * administrador e entrar como tal.
 *
 * Em desenvolvimento o valor por omissão é conveniente e continua a existir.
 * Em produção, ARRANCAR SEM ELE É PIOR DO QUE NÃO ARRANCAR: um sistema
 * inseguro que responde parece que está bem, e ninguém vai lá ver.
 */
const EM_PRODUCAO = process.env.NODE_ENV === 'production';

function segredo(nome: string, porOmissao: string): string {
  const valor = process.env[nome];

  if (valor && valor.trim()) {
    // Um segredo de desenvolvimento copiado por engano para produção é o
    // mesmo problema com outra roupa.
    if (EM_PRODUCAO && valor.includes('change-me')) {
      throw new Error(
        `[env] ${nome} ainda tem o valor de desenvolvimento.\n` +
        'Gere um segredo novo: openssl rand -base64 48',
      );
    }
    if (EM_PRODUCAO && valor.length < 32) {
      throw new Error(
        `[env] ${nome} é demasiado curto (${valor.length} caracteres).\n` +
        'Use pelo menos 32: openssl rand -base64 48',
      );
    }
    return valor;
  }

  if (EM_PRODUCAO) {
    throw new Error(
      `[env] ${nome} não está definida e o NODE_ENV é production.\n` +
      'Gere um segredo com: openssl rand -base64 48',
    );
  }

  return porOmissao;
}

/**
 * Origens que o browser pode usar para chamar esta API.
 *
 * Vazio em desenvolvimento significa "qualquer uma", que é o que se quer numa
 * máquina local com o frontend noutra porta. Em produção é obrigatório: sem
 * isto, qualquer site conseguia fazer pedidos autenticados em nome de quem
 * tivesse sessão aberta.
 */
function origensPermitidas(): string[] {
  const bruto = process.env.CORS_ORIGINS ?? '';
  const lista = bruto.split(',').map((o) => o.trim()).filter(Boolean);

  if (EM_PRODUCAO && lista.length === 0) {
    throw new Error(
      '[env] CORS_ORIGINS não está definida e o NODE_ENV é production.\n' +
      'Indique o endereço do frontend, por exemplo:\n' +
      '  CORS_ORIGINS=https://app.dragonfleet.pt',
    );
  }
  return lista;
}

export const env = {
  NODE_ENV:       process.env.NODE_ENV ?? 'development',
  PORT:           Number(process.env.PORT ?? 3000),
  DATABASE_URL:   process.env.DATABASE_URL ?? '',

  // Auth
  JWT_SECRET:          segredo('JWT_SECRET', 'dev-secret-change-me'),
  JWT_EXPIRES_IN:      process.env.JWT_EXPIRES_IN ?? '15m',
  JWT_REFRESH_SECRET:  segredo('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  JWT_ISSUER:   process.env.JWT_ISSUER,
  JWT_AUDIENCE: process.env.JWT_AUDIENCE,

  CORS_ORIGINS: origensPermitidas(),
};

/**
 * Verificações que só fazem sentido ao arrancar o servidor.
 *
 * Chamada no server.ts e não aqui: os testes e os seeds importam este ficheiro
 * e não devem morrer por falta de configuração que não usam.
 */
export function assertEnv(): void {
  if (!env.DATABASE_URL) {
    throw new Error('[env] DATABASE_URL não está definida.');
  }

  if (EM_PRODUCAO) {
    // O segredo e o CORS já rebentaram acima se estivessem mal. Aqui fica o
    // que é aviso e não impedimento.
    if (!process.env.CLOUD_NAME) {
      throw new Error(
        '[env] Cloudinary não configurado e o NODE_ENV é production.\n' +
        'Sem CLOUD_NAME, API_KEY e API_SECRET, os recibos e comprovativos não\n' +
        'são guardados em lado nenhum.',
      );
    }
  }
}
