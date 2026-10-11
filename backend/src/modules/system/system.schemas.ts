// src/modules/system/system.schemas.ts
//
// O que o painel do dono aceita receber.
//
// ─── A PALAVRA-PASSE DO PRIMEIRO GESTOR ─────────────────────────────────────
//
// Oito caracteres é o mínimo que o resto do projeto já exige, e é aqui que faz
// mais diferença: esta é a conta com todas as chaves da casa de um cliente. A
// regra é a mesma para não haver duas respostas diferentes à mesma pergunta.

import { z } from 'zod';

const nome = z.string().trim().min(2, 'Escreva o nome.').max(120);
const emailOpcional = z.string().trim().email('Email inválido.').max(160).optional().nullable();
const textoOpcional = (max: number) =>
  z.string().trim().max(max).optional().nullable();

/**
 * O NIF não é validado por dígito de controlo.
 *
 * De propósito: isto grava também NIFs estrangeiros, e um cliente espanhol com
 * um número que o algoritmo português recusa não pode ficar sem conta por
 * causa de uma validação que só serve de cá. Nove a quinze caracteres apanha o
 * erro de dedo sem recusar quem é de fora.
 */
const nif = z.string().trim().min(9).max(15).optional().nullable();

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const criarFrotaSchema = z.object({
  body: z.object({
    nome,
    nif,
    telefone: textoOpcional(30),
    email: emailOpcional,
    notas: textoOpcional(2000),
    planoId: z.string().min(1).optional().nullable(),
    // Dias à medida. Zero é válido e quer dizer "criar sem activar".
    dias: z.coerce.number().int().min(0).max(3650).optional(),
    gestor: z.object({
      nome,
      email: z.string().trim().email('Email inválido.').max(160),
      password: z.string().min(8, 'A palavra-passe precisa de 8 caracteres.').max(200),
      telefone: textoOpcional(30),
    }),
  }),
});

export const actualizarFrotaSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    nome: nome.optional(),
    nif,
    telefone: textoOpcional(30),
    email: emailOpcional,
    notas: textoOpcional(2000),
    planoId: z.string().optional().nullable(),
    activa: z.boolean().optional(),
  }),
});

export const renovarSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    // Sem isto, vale a duração do plano da frota.
    dias: z.coerce.number().int().min(1).max(3650).optional(),
  }),
});

/**
 * Os códigos das funcionalidades não são validados contra o catálogo aqui.
 *
 * Quem limpa a lista é `normalizarFuncionalidades`, no serviço: ignora os que
 * não conhece em vez de recusar o pedido inteiro. Recusar aqui tornava
 * impossível guardar uma alteração num plano antigo que ainda tenha o código
 * de uma funcionalidade que já saiu do catálogo — ver a nota lá.
 */
const funcionalidades = z.array(z.string().trim().min(1).max(40)).max(100);

export const criarPlanoSchema = z.object({
  body: z.object({
    nome,
    duracaoDias: z.coerce.number().int().min(1, 'Pelo menos um dia.').max(3650),
    preco: z.coerce.number().min(0).max(1_000_000),
    funcionalidades,
    notas: textoOpcional(1000),
    activo: z.boolean().optional(),
  }),
});

export const actualizarPlanoSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    nome: nome.optional(),
    duracaoDias: z.coerce.number().int().min(1).max(3650).optional(),
    preco: z.coerce.number().min(0).max(1_000_000).optional(),
    funcionalidades: funcionalidades.optional(),
    notas: textoOpcional(1000),
    activo: z.boolean().optional(),
  }),
});

export const fecharPedidoSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    // DONE: resolveu-se. DISMISSED: não avançou. As duas fecham; a diferença
    // é o que a lista conta daqui a seis meses.
    estado: z.enum(['DONE', 'DISMISSED']),
    nota: z.string().trim().max(2000).optional().nullable(),
  }),
});
