// src/middlewares/escopo-multipart.test.ts
//
// O contexto da frota perde-se quando se lê o corpo do pedido.
//
// ─── PORQUE É QUE ESTE TESTE EXISTE ─────────────────────────────────────────
//
// Porque um utilizador viu «Internal server error» ao anexar um extrato a uma
// resposta, e nos logs estava:
//
//   ErroDeEscopo: SettlementQuery.findFirst correu fora de qualquer frota.
//
// O GET da mesma rota funcionava. O POST não. A diferença era o multer.
//
// Nem os tipos nem os testes puros apanhavam isto: é preciso um servidor de
// HTTP verdadeiro, com um corpo verdadeiro, para o contexto se perder. Por
// isso este teste levanta um — sem express e sem multer, que não são precisos
// para reproduzir o mecanismo e só o tornariam mais difícil de ler.
//
// Se um dia o Node mudar e o contexto passar a atravessar os eventos do
// stream, o primeiro caso aqui falha. Isso é informação, não um incómodo: quer
// dizer que o `reporFrota` deixou de ser preciso.

import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';

type Escopo = { fleetId: string };
const armazem = new AsyncLocalStorage<Escopo>();

const comFrota = <T>(fleetId: string, fn: () => T | Promise<T>) =>
  armazem.run({ fleetId }, async () => await fn());

const frotaAgora = () => armazem.getStore()?.fleetId ?? null;

/**
 * Levanta um servidor, faz-lhe um POST com corpo, e devolve o que foi
 * observado em cada ponto do caminho.
 *
 * `repor` decide se o `reporFrota` corre a seguir à leitura do corpo.
 */
async function correrPedido(repor: boolean): Promise<Record<string, string | null>> {
  const visto: Record<string, string | null> = {};

  const servidor = http.createServer((req, res) => {
    // `escopoDaFrota` põe a frota no pedido E envolve o resto numa frota.
    const comoPedido = req as http.IncomingMessage & { frota?: { fleetId: string } };
    comoPedido.frota = { fleetId: 'frota-1' };

    void comFrota('frota-1', () => {
      visto.antesDoCorpo = frotaAgora();

      // Isto é o multer: consome o stream e só depois chama o `next()`.
      req.on('data', () => { /* o corpo em si não interessa */ });
      req.on('end', () => {
        visto.depoisDoCorpo = frotaAgora();

        const seguir = () => {
          visto.noControlador = frotaAgora();
          // E tem de sobreviver a um `await` — no caso real é o envio para o
          // Cloudinary, que acontece ANTES da primeira consulta ao Prisma.
          void (async () => {
            await new Promise((r) => setTimeout(r, 5));
            visto.depoisDoAwait = frotaAgora();
            res.end('ok');
          })();
        };

        if (!repor) return seguir();

        // ── reporFrota ──
        const fleetId = comoPedido.frota?.fleetId;
        if (!fleetId) return seguir();
        void comFrota(fleetId, () => { seguir(); });
      });
    });
  });

  await new Promise<void>((r) => servidor.listen(0, () => r()));
  const porta = (servidor.address() as { port: number }).port;

  await new Promise<void>((resolver) => {
    const pedido = http.request({ port: porta, method: 'POST' }, (res) => {
      res.resume();
      res.on('end', () => resolver());
    });
    pedido.write('x'.repeat(1024));
    pedido.end();
  });

  servidor.close();
  return visto;
}

describe('a frota não atravessa a leitura do corpo do pedido', () => {
  it('sem repor, o controlador corre SEM frota — era este o Internal server error', async () => {
    const visto = await correrPedido(false);

    // Antes de ler o corpo está tudo bem: é por isso que os GET funcionavam.
    expect(visto.antesDoCorpo).toBe('frota-1');

    // E a partir daqui, nada.
    expect(visto.depoisDoCorpo).toBeNull();
    expect(visto.noControlador).toBeNull();
    expect(visto.depoisDoAwait).toBeNull();
  });

  it('com reporFrota, o controlador volta a ter frota', async () => {
    const visto = await correrPedido(true);

    expect(visto.antesDoCorpo).toBe('frota-1');
    // O contexto perde-se à mesma — o que muda é o que se faz a seguir.
    expect(visto.depoisDoCorpo).toBeNull();
    expect(visto.noControlador).toBe('frota-1');
  });

  it('e a frota sobrevive ao await do envio do ficheiro', async () => {
    const visto = await correrPedido(true);
    // Este é o caso real: o upload para o Cloudinary acontece entre o
    // `reporFrota` e a primeira consulta ao Prisma.
    expect(visto.depoisDoAwait).toBe('frota-1');
  });
});
