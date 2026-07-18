// src/modules/documents/documents.service.ts
import { AppError }           from '../../shared/errors/AppError';
import { DocumentStatus, DocumentType, UserRole } from '../../shared/types/enums';
import { usersRepository }    from '../users/users.repository';
import { documentsRepository } from './documents.repository';
import { CreateDocumentData, UpdateDocumentData } from './documents.repository.types';
import { CreateDocumentInput, UpdateDocumentInput, UpdateDocumentStatusInput } from './documents.service.types';
import { IDocumentPublic }    from './documents.types';
import { emailService }       from '../../shared/services/email.service';

const DOC_TYPE_LABELS: Record<string, string> = {
  CNH:    'CNH',
  CRLV:   'CRLV',
  RECIBO: 'Recibo Verde',
  OTHER:  'Outro',
};

type Actor = { id: string; role?: UserRole };

function isAdmin(role?: UserRole)   { return role === UserRole.ADMIN; }
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

    const existing = await documentsRepository.findByUserIdAndType(actor.id, input.type);
    if (existing) {
      throw new AppError('Document type already exists for this user', 409, 'DOCUMENT_TYPE_ALREADY_EXISTS');
    }

    const data: CreateDocumentData = {
      type:    input.type,
      fileUrl: input.fileUrl,
      fileKey: input.fileKey,
      status:  DocumentStatus.PENDING,
      userId:  actor.id,
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
      ...(input.type    !== undefined ? { type:    input.type    } : {}),
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

    // ── Disparar email ao driver ──────────────────────────────────────────
    try {
      const user    = await usersRepository.findById(doc.userId);
      const docLabel = DOC_TYPE_LABELS[doc.type] ?? doc.type;

      if (user?.email) {
        if (input.status === DocumentStatus.APPROVED) {
          await emailService.sendDocumentApproved(user.email, user.name, docLabel);
        } else if (input.status === DocumentStatus.REJECTED) {
          await emailService.sendDocumentRejected(user.email, user.name, docLabel, input.notes);
        }
      }
    } catch (emailErr) {
      // Não falha a operação principal se o email não enviar
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