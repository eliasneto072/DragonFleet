import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { IDocumentRepository } from './documents.repository.interfaces';
import { CreateDocumentData, UpdateDocumentData } from './documents.repository.types';
import { IDocumentPublic } from './documents.types';
import { DocumentType } from '../../shared/types/enums';

export class DocumentsRepository implements IDocumentRepository {
  private readonly publicSelect = {
    id: true,
    type: true,
    fileUrl: true,
    fileKey: true, // novo
    status: true,
    userId: true,
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
      logger.error('Erro ao buscar documentos por usuário', err);
      throw err;
    }
  }

  async findByUserIdAndType(userId: string, type: DocumentType): Promise<IDocumentPublic | null> {
    try {
      // Como não existe unique composto (userId, type) no schema atual,
      // usamos findFirst.
      return await prisma.document.findFirst({
        where: { userId, type },
        select: this.publicSelect,
        orderBy: { createdAt: 'desc' },
      });
    } catch (err) {
      logger.error('Erro ao buscar documento por usuário e tipo', err);
      throw err;
    }
  }

  async create(data: CreateDocumentData): Promise<IDocumentPublic> {
    try {
      return await prisma.document.create({
        data: {
          type: data.type,
          fileUrl: data.fileUrl,
          fileKey: data.fileKey, //novo
          status: data.status,
          userId: data.userId,
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
        },
        select: this.publicSelect,
      });
    } catch (err) {
      logger.error('Erro ao atualizar documento', err);
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