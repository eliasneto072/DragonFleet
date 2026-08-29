import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { IDocumentRepository } from './documents.repository.interfaces';
import { CreateDocumentData, UpdateDocumentData, ReplaceDocumentData } from './documents.repository.types';
import { IDocumentPublic } from './documents.types';
import { DocumentType } from '../../shared/types/enums';

export class DocumentsRepository implements IDocumentRepository {
  private readonly publicSelect = {
    id: true,
    type: true,
    fileUrl: true,
    fileKey: true,
    notes: true,
    status: true,
    issuedAt: true,
    expiresAt: true,
    userId: true,
    vehicleId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async findAll(): Promise<IDocumentPublic[]> {
    try {
      return await prisma.document.findMany({
        select: this.publicSelect,
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      logger.error('Erro ao buscar documentos', err);
      throw err;
    }
  }

  async findById(id: string): Promise<IDocumentPublic | null> {
    try {
      return await prisma.document.findUnique({
        where: { id },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error('Erro ao buscar documento por id', err);
      throw err;
    }
  }

  async findByUserId(userId: string): Promise<IDocumentPublic[]> {
    try {
      return await prisma.document.findMany({
        where: { userId },
        select: this.publicSelect,
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      logger.error('Erro ao buscar documentos por utilizador', err);
      throw err;
    }
  }

  // Documento PESSOAL do utilizador (vehicleId = null) de um dado tipo.
  async findByUserIdAndType(userId: string, type: DocumentType): Promise<IDocumentPublic | null> {
    try {
      return await prisma.document.findFirst({
        where: { userId, type, vehicleId: null },
        select: this.publicSelect,
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      logger.error('Erro ao buscar documento por utilizador e tipo', err);
      throw err;
    }
  }

  // Documento de VEÍCULO de um dado tipo (unicidade por veículo+tipo).
  async findByVehicleIdAndType(vehicleId: string, type: DocumentType): Promise<IDocumentPublic | null> {
    try {
      return await prisma.document.findFirst({
        where: { vehicleId, type },
        select: this.publicSelect,
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      logger.error('Erro ao buscar documento por veículo e tipo', err);
      throw err;
    }
  }

  async create(data: CreateDocumentData): Promise<IDocumentPublic> {
    try {
      return await prisma.document.create({
        data: {
          type: data.type,
          fileUrl: data.fileUrl,
          fileKey: data.fileKey,
          status: data.status,
          userId: data.userId,
          vehicleId: data.vehicleId ?? null,
          issuedAt: data.issuedAt ?? null,
          expiresAt: data.expiresAt ?? null,
        },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error('Erro ao criar documento', err);
      throw err;
    }
  }

  async update(id: string, data: UpdateDocumentData): Promise<IDocumentPublic> {
    try {
      return await prisma.document.update({
        where: { id },
        data: {
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.fileUrl !== undefined ? { fileUrl: data.fileUrl } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error('Erro ao atualizar documento', err);
      throw err;
    }
  }

  // Substitui o ficheiro e reinicia o ciclo de validação (re-upload após
  // rejeição/expiração): novo ficheiro, nova validade, status PENDING, notas limpas.
  async replace(id: string, data: ReplaceDocumentData): Promise<IDocumentPublic> {
    try {
      return await prisma.document.update({
        where: { id },
        data: {
          fileUrl: data.fileUrl,
          fileKey: data.fileKey,
          status: data.status,
          issuedAt: data.issuedAt ?? null,
          expiresAt: data.expiresAt ?? null,
          notes: data.notes ?? null,
        },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error('Erro ao substituir documento', err);
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.document.delete({
        where: { id },
      });
    } catch (err) {
      logger.error('Erro ao deletar documento', err);
      throw err;
    }
  }
}

export const documentsRepository = new DocumentsRepository();