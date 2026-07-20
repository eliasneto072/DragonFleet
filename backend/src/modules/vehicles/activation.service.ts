// src/modules/vehicles/activation.service.ts
//
// Ativação HÍBRIDA do veículo.
//
// Regra automática: o veículo fica ACTIVE quando os 4 documentos obrigatórios
// estão APPROVED; caso contrário, volta a PENDING. Esta reavaliação é chamada
// sempre que um documento do veículo muda de estado (aprovado, rejeitado,
// expirado, ou novo upload pendente).
//
// Exceção manual: se o admin forçou a ativação (activationForced = true), o
// veículo mantém-se ACTIVE mesmo sem todos os documentos — a reavaliação
// automática respeita essa exceção e não o rebaixa. Estados manuais como
// MAINTENANCE e SOLD também não são tocados pela automação.

import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { DocumentStatus, DocumentType, VehicleStatus } from '../../shared/types/enums';

// Os 4 documentos obrigatórios do veículo.
export const REQUIRED_VEHICLE_DOCS: DocumentType[] = [
  DocumentType.DUA,
  DocumentType.SEGURO_CARTA_VERDE,
  DocumentType.SEGURO_CONDICOES_ESPECIAIS,
  DocumentType.INSPECAO_PERIODICA,
];

// Estados que a automação NÃO deve alterar (são decisões manuais).
const MANUAL_STATES: VehicleStatus[] = [VehicleStatus.MAINTENANCE, VehicleStatus.SOLD];

/** True se os 4 documentos obrigatórios do veículo estão aprovados. */
export async function hasAllRequiredDocsApproved(vehicleId: string): Promise<boolean> {
  const approved = await prisma.document.findMany({
    where: {
      vehicleId,
      type: { in: REQUIRED_VEHICLE_DOCS },
      status: DocumentStatus.APPROVED,
    },
    select: { type: true },
  });

  const approvedTypes = new Set(approved.map((d) => d.type));
  return REQUIRED_VEHICLE_DOCS.every((t) => approvedTypes.has(t));
}

/**
 * Reavalia e ajusta o status do veículo com base nos documentos.
 * Chamado após qualquer mudança num documento do veículo.
 * Retorna o novo status (ou o atual, se nada mudou).
 */
export async function reevaluateVehicleStatus(vehicleId: string): Promise<VehicleStatus | null> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, status: true, activationForced: true },
  });

  if (!vehicle) return null;

  // Não mexer em estados manuais (manutenção/vendido).
  if (MANUAL_STATES.includes(vehicle.status)) return vehicle.status;

  // Exceção: admin forçou a ativação → mantém ACTIVE, não rebaixa.
  if (vehicle.activationForced) {
    if (vehicle.status !== VehicleStatus.ACTIVE) {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { status: VehicleStatus.ACTIVE } });
      return VehicleStatus.ACTIVE;
    }
    return VehicleStatus.ACTIVE;
  }

  const allApproved = await hasAllRequiredDocsApproved(vehicleId);
  const target = allApproved ? VehicleStatus.ACTIVE : VehicleStatus.PENDING;

  if (vehicle.status !== target) {
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { status: target } });
    logger.info(`[activation] Veículo ${vehicleId}: ${vehicle.status} → ${target}`);
    return target;
  }

  return vehicle.status;
}

/**
 * Admin força a ativação de um veículo (exceção manual). Marca o flag e ativa.
 */
export async function forceActivation(vehicleId: string, forced: boolean): Promise<VehicleStatus> {
  if (forced) {
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { activationForced: true, status: VehicleStatus.ACTIVE },
    });
    logger.info(`[activation] Veículo ${vehicleId}: ativação FORÇADA pelo admin`);
    return VehicleStatus.ACTIVE;
  }

  // Remover a exceção: volta a seguir a regra automática.
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { activationForced: false },
  });
  const status = await reevaluateVehicleStatus(vehicleId);
  return status ?? VehicleStatus.PENDING;
}
