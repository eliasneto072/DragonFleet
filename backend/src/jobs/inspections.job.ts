// src/jobs/inspections.job.ts
//
// Avisa quando a inspeção periódica de um carro está a chegar ao fim.
//
// ─── PORQUE É QUE ISTO VALE A PENA ──────────────────────────────────────────
//
// Uma inspeção fora de prazo é coima e carro apreendido à primeira paragem —
// ou seja, é o carro parado e o motorista sem trabalhar, que numa frota de
// TVDE custa muito mais do que a coima.
//
// E é o género de prazo que ninguém falha por não saber: falha-se por ser daqui
// a dois meses e não haver onde isso esteja escrito.
//
// ─── PORQUE É QUE AVISA TRÊS VEZES E NÃO TODOS OS DIAS ──────────────────────
//
// Um aviso diário durante sessenta dias ensina a ignorar o aviso, e no dia
// sessenta e um já ninguém olha. Quatro marcos — dois meses, um mês, uma
// semana, e o próprio dia — chegam a tempo de marcar e não gastam a atenção de
// ninguém.
//
// ─── DEPOIS DO PRAZO É QUE AVISA TODOS OS DIAS ──────────────────────────────
//
// E é de propósito. Antes do prazo, insistir é ruído; depois do prazo, o carro
// está ilegal e cada dia que passa é um dia de risco de apreensão. Aqui o que
// se quer mesmo é incomodar até alguém resolver.
//
// Não há coluna a guardar o que já foi avisado: o marco deduz-se dos dias que
// faltam. Como os marcos são dias exactos, o job pode correr várias vezes no
// mesmo dia que o aviso sai uma vez por marco — e nos dias entre marcos não
// sai nada.

import { prisma } from '../config/prisma';
import { logger } from '../shared/utils/logger';
import { UserRole } from '../shared/types/enums';
import { avisar } from '../shared/services/avisos';

/** Os marcos, em dias. Do mais longe para o mais perto. */
const MARCOS = [60, 30, 7, 0];

function soDia(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const curto = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

/** O marco que corresponde a faltarem `dias`, ou null se não é dia de avisar. */
function marcoDe(dias: number): number | null {
  if (dias < 0) return -1;                       // já passou: avisa sempre
  for (const m of MARCOS) if (dias === m) return m;
  return null;
}

export async function runInspectionsCheck(hoje = new Date()): Promise<void> {
  const dia = soDia(hoje);

  const carros = await prisma.vehicle.findMany({
    where: {
      nextInspectionOn: { not: null },
      // Um carro vendido ou desligado não precisa de inspeção.
      status: { in: ['ACTIVE', 'PENDING', 'MAINTENANCE'] },
    },
    select: {
      id: true, plate: true, brand: true, model: true,
      nextInspectionOn: true, userId: true,
    },
  });

  if (carros.length === 0) return;

  const gestao = await prisma.user.findMany({
    where: { role: { in: [UserRole.ADMIN, UserRole.MANAGER] }, status: 'ACTIVE' },
    select: { id: true },
  });

  let enviados = 0;

  for (const c of carros) {
    try {
      const limite = soDia(c.nextInspectionOn!);
      const dias = Math.round((limite.getTime() - dia.getTime()) / 86_400_000);
      const marco = marcoDe(dias);
      if (marco === null) continue;

      const titulo = dias < 0
        ? 'Inspeção FORA DE PRAZO'
        : dias === 0
          ? 'A inspeção é hoje'
          : `Inspeção daqui a ${dias} dia${dias === 1 ? '' : 's'}`;

      const texto = `${c.plate} · ${c.brand} ${c.model}\nVálida até ${curto(limite)}.`
        + (dias < 0
          ? '\nO carro não pode circular até ser inspecionado.'
          : '\nMarque a inspeção para não ficar com o carro parado.');

      // A gestão sempre, e o motorista que tem o carro — é ele que o leva.
      const destinatarios = [...gestao.map((g) => g.id), ...(c.userId ? [c.userId] : [])];
      for (const userId of destinatarios) {
        await avisar(userId, { titulo, mensagem: texto });
        enviados += 1;
      }
    } catch (erro) {
      // Um carro com problema não trava os outros.
      logger.error(`[inspeções] erro no veículo ${c.id}`, erro);
    }
  }

  if (enviados > 0) logger.info(`[inspeções] ${enviados} aviso(s) enviado(s)`);
}
