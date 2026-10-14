// src/modules/settlements/pedidos.schemas.ts
//
// O zod dos pedidos de esclarecimento.
//
// Os parâmetros do endereço passam por aqui como o corpo. Um `req.params.id`
// lido directamente é a forma mais fácil de deixar entrar o que não se espera
// — e há um guião que recusa o commit por isso (`verificar-chaves.mjs`).

import { z } from 'zod';
import { LINHAS } from './pedidos';

/** As linhas válidas, tiradas do catálogo: um sítio só a definir quais são. */
const linha = z.enum(
  LINHAS.map((l) => l.linha) as [string, ...string[]],
);

export const pedidoIdParamSchema = z.object({
  params: z.object({ pedidoId: z.string().min(1) }),
});

export const fechoIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const criarPedidoSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    line: linha,
    /**
     * O que ele escreveu. Opcional de propósito: obrigar a justificar uma
     * dúvida é a melhor maneira de ninguém a levantar.
     */
    reason: z.string().max(1000).optional().nullable(),
  }),
});

export const responderPedidoSchema = z.object({
  params: z.object({ pedidoId: z.string().min(1) }),
  body: z.object({
    answer: z.string().max(4000).optional().nullable(),
    /**
     * O extrato. Opcional aqui, porque uma resposta pode ser só uma frase —
     * mas texto e ficheiro não podem estar os dois vazios, e essa regra vive
     * no serviço, onde está testada (`respostaCompleta`).
     */
    fileUrl: z.string().max(1000).optional().nullable(),
    fileKey: z.string().max(500).optional().nullable(),
  }),
});

export const listarPedidosSchema = z.object({
  query: z.object({
    status: z.enum(['ABERTO', 'RESPONDIDO']).optional(),
  }),
});
