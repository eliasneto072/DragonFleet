// src/modules/documents/documents.service.ts
import { AppError } from '../../shared/errors/AppError';
import { DocumentStatus, DocumentType, UserRole } from '../../shared/types/enums';
import { usersRepository } from '../users/users.repository';
import { vehiclesRepository } from '../vehicles/vehicles.repository';
import { documentsRepository } from './documents.repository';
import { CreateDocumentData, UpdateDocumentData, ReplaceDocumentData } from './documents.repository.types';
import { CreateDocumentInput, UpdateDocumentInput, UpdateDocumentStatusInput } from './documents.service.types';
import { IDocumentPublic } from './documents.types';
import { emailService } from '../../shared/services/email.service';
import { reevaluateVehicleStatus } from '../vehicles/activation.service';

const DOC_TYPE_LABELS: Record<string, string> = {
  // Motorista
  CARTAO_CIDADAO: 'Cartão de Cidadão',
  REGISTO_CRIMINAL: 'Registo Criminal',
  CARTA_CONDUCAO: 'Carta de Condução',
  CERTIFICADO_TVDE: 'Certificado de Motorista TVDE',
  FOTO_PERFIL: 'Fotografia de Perfil',
  // Veículo
  DUA: 'DUA — Documento Único Automóvel',
  SEGURO_CARTA_VERDE: 'Seguro Automóvel (Carta Verde)',
  SEGURO_CONDICOES_ESPECIAIS: 'Seguro Automóvel (Condições Especiais)',
  INSPECAO_PERIODICA: 'Inspeção Técnica Periódica',
  OTHER: 'Outro',
};

// Tipos que são de veículo (o resto é pessoal).
const VEHICLE_DOC_TYPES: DocumentType[] = [
  DocumentType.DUA,
  DocumentType.SEGURO_CARTA_VERDE,
  DocumentType.SEGURO_CONDICOES_ESPECIAIS,
  DocumentType.INSPECAO_PERIODICA,
];

// Estados em que um documento pode ser reenviado (substituído) pelo motorista.
const REPLACEABLE_STATUSES: DocumentStatus[] = [DocumentStatus.REJECTED, DocumentStatus.EXPIRED];

type Actor = { id: string; role?: UserRole };

function isAdmin(role?: UserRole) { return role === UserRole.ADMIN; }
function isManager(role?: UserRole) { return role === UserRole.MANAGER; }
function canManageDocuments(role?: UserRole) { return isAdmin(role) || isManager(role); }

export class DocumentsService {
  private async ensureDocumentExists(id: string): Promise<IDocumentPublic> {
    const doc = await documentsRepository.findById(id);
    if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
    return doc;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await usersRepository.findById(userId);
    if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  private ensureOwnerOrManager(actor: Actor, ownerId: string) {
    if (!canManageDocuments(actor.role) && actor.id !== ownerId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
  }

  // Calcula issuedAt/expiresAt conforme o tipo. O Registo Criminal exige data de
  // emissão e expira 90 dias depois (prazo legal em Portugal). Os demais não têm
  // expiração automática por agora.
  private resolveValidity(type: DocumentType, issuedAtInput?: string): { issuedAt: Date | null; expiresAt: Date | null } {
    let issuedAt: Date | null = null;
    let expiresAt: Date | null = null;

    if (type === DocumentType.REGISTO_CRIMINAL) {
      if (!issuedAtInput) {
        throw new AppError('A data de emissão é obrigatória para o Registo Criminal.', 400, 'ISSUE_DATE_REQUIRED');
      }
      issuedAt = new Date(issuedAtInput);
      if (isNaN(issuedAt.getTime())) {
        throw new AppError('Data de emissão inválida.', 400, 'INVALID_ISSUE_DATE');
      }
      if (issuedAt.getTime() > Date.now()) {
        throw new AppError('A data de emissão não pode ser futura.', 400, 'ISSUE_DATE_IN_FUTURE');
      }
      expiresAt = new Date(issuedAt);
      expiresAt.setDate(expiresAt.getDate() + 90);
    } else if (issuedAtInput) {
      const d = new Date(issuedAtInput);
      if (!isNaN(d.getTime())) issuedAt = d;
    }

    return { issuedAt, expiresAt };
  }

  async list(actor: Actor): Promise<IDocumentPublic[]> {
    if (canManageDocuments(actor.role)) return documentsRepository.findAll();
    return documentsRepository.findByUserId(actor.id);
  }

  async getById(actor: Actor, id: string): Promise<IDocumentPublic> {
    const doc = await this.ensureDocumentExists(id);
    this.ensureOwnerOrManager(actor, doc.userId);
    return doc;
  }

  async create(actor: Actor, input: CreateDocumentInput): Promise<IDocumentPublic> {
    await this.ensureUserExists(actor.id);

    const { issuedAt, expiresAt } = this.resolveValidity(input.type, input.issuedAt);

    // ── Documento de VEÍCULO ────────────────────────────────────────────────
    if (input.vehicleId) {
      if (!VEHICLE_DOC_TYPES.includes(input.type)) {
        throw new AppError('Este tipo de documento não pertence a um veículo.', 400, 'INVALID_VEHICLE_DOCUMENT_TYPE');
      }

      const vehicle = await vehiclesRepository.findById(input.vehicleId);
      if (!vehicle) {
        throw new AppError('Veículo não encontrado.', 404, 'VEHICLE_NOT_FOUND');
      }

      // Só o dono do veículo (ou admin/manager) pode enviar documentos dele.
      if (!canManageDocuments(actor.role) && vehicle.userId !== actor.id) {
        throw new AppError('Este veículo não pertence a si.', 403, 'FORBIDDEN');
      }

      const existing = await documentsRepository.findByVehicleIdAndType(input.vehicleId, input.type);

      if (existing) {
        if (!REPLACEABLE_STATUSES.includes(existing.status)) {
          const label = DOC_TYPE_LABELS[input.type] ?? input.type;
          const motivo =
            existing.status === DocumentStatus.APPROVED
              ? `O documento "${label}" deste veículo já está aprovado.`
              : `O documento "${label}" deste veículo já foi enviado e aguarda análise.`;
          throw new AppError(motivo, 409, 'DOCUMENT_TYPE_ALREADY_EXISTS');
        }

        const replaceData: ReplaceDocumentData = {
          fileUrl: input.fileUrl,
          fileKey: input.fileKey,
          status: DocumentStatus.PENDING,
          issuedAt,
          expiresAt,
          notes: null,
        };
        const replaced = await documentsRepository.replace(existing.id, replaceData);

        try {
          await reevaluateVehicleStatus(input.vehicleId);
        } catch (actErr) {
          console.error('[activation] Falha ao reavaliar status do veículo:', actErr);
        }

        return replaced;
      }

      // O documento pertence ao veículo, mas registamos também quem enviou (userId).
      const data: CreateDocumentData = {
        type: input.type,
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
        status: DocumentStatus.PENDING,
        userId: vehicle.userId ?? actor.id,
        vehicleId: input.vehicleId,
        issuedAt,
        expiresAt,
      };
      const created = await documentsRepository.create(data);

      try {
        await reevaluateVehicleStatus(input.vehicleId);
      } catch (actErr) {
        console.error('[activation] Falha ao reavaliar status do veículo:', actErr);
      }

      return created;
    }

    // ── Documento PESSOAL ───────────────────────────────────────────────────
    if (VEHICLE_DOC_TYPES.includes(input.type)) {
      throw new AppError('Este tipo de documento pertence a um veículo. Envie-o a partir do veículo.', 400, 'VEHICLE_DOCUMENT_REQUIRES_VEHICLE');
    }

    const existing = await documentsRepository.findByUserIdAndType(actor.id, input.type);

    if (existing) {
      if (!REPLACEABLE_STATUSES.includes(existing.status)) {
        const label = DOC_TYPE_LABELS[input.type] ?? input.type;
        const motivo =
          existing.status === DocumentStatus.APPROVED
            ? `O documento "${label}" já está aprovado.`
            : `O documento "${label}" já foi enviado e aguarda análise.`;
        throw new AppError(motivo, 409, 'DOCUMENT_TYPE_ALREADY_EXISTS');
      }

      const replaceData: ReplaceDocumentData = {
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
        status: DocumentStatus.PENDING,
        issuedAt,
        expiresAt,
        notes: null,
      };
      return documentsRepository.replace(existing.id, replaceData);
    }

    const data: CreateDocumentData = {
      type: input.type,
      fileUrl: input.fileUrl,
      fileKey: input.fileKey,
      status: DocumentStatus.PENDING,
      userId: actor.id,
      vehicleId: null,
      issuedAt,
      expiresAt,
    };

    return documentsRepository.create(data);
  }

  async update(actor: Actor, id: string, input: UpdateDocumentInput): Promise<IDocumentPublic> {
    const doc = await this.ensureDocumentExists(id);
    this.ensureOwnerOrManager(actor, doc.userId);

    if (!canManageDocuments(actor.role) && doc.status !== DocumentStatus.PENDING) {
      throw new AppError('Forbidden', 403, 'CANNOT_EDIT_DOCUMENT_AFTER_REVIEW');
    }

    if (input.type && input.type !== doc.type) {
      const existing = await documentsRepository.findByUserIdAndType(doc.userId, input.type as DocumentType);
      if (existing) {
        throw new AppError('Document type already exists for this user', 409, 'DOCUMENT_TYPE_ALREADY_EXISTS');
      }
    }

    const data: UpdateDocumentData = {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.fileUrl !== undefined ? { fileUrl: input.fileUrl } : {}),
    };

    return documentsRepository.update(id, data);
  }

  async updateStatus(actor: Actor, id: string, input: UpdateDocumentStatusInput): Promise<IDocumentPublic> {
    if (!canManageDocuments(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const doc = await this.ensureDocumentExists(id);

    const data: UpdateDocumentData = {
      status: input.status,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };

    const updated = await documentsRepository.update(id, data);

    // ── Reavaliar ativação do veículo (se for documento de veículo) ────────
    if (doc.vehicleId) {
      try {
        await reevaluateVehicleStatus(doc.vehicleId);
      } catch (actErr) {
        console.error('[activation] Falha ao reavaliar status do veículo:', actErr);
      }
    }

    // ── Disparar email ao driver ──────────────────────────────────────────
    try {
      const user = await usersRepository.findById(doc.userId);
      const docLabel = DOC_TYPE_LABELS[doc.type] ?? doc.type;

      if (user?.email) {
        if (input.status === DocumentStatus.APPROVED) {
          await emailService.sendDocumentApproved(user.email, user.name, docLabel);
        } else if (input.status === DocumentStatus.REJECTED) {
          await emailService.sendDocumentRejected(user.email, user.name, docLabel, input.notes);
        }
      }
    } catch (emailErr) {
      console.error('[email] Failed to send document status email:', emailErr);
    }

    return updated;
  }

  async remove(actor: Actor, id: string): Promise<void> {
    if (!canManageDocuments(actor.role)) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    await this.ensureDocumentExists(id);
    return documentsRepository.delete(id);
  }
}

export const documentsService = new DocumentsService();