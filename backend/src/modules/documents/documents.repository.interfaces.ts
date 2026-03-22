import { IDocumentPublic } from './documents.types';
import { CreateDocumentData, UpdateDocumentData } from './documents.repository.types';
import { DocumentType } from '../../shared/types/enums';

export interface IDocumentRepository {
  findAll(): Promise<IDocumentPublic[]>;
  findById(id: string): Promise<IDocumentPublic | null>;
  findByUserId(userId: string): Promise<IDocumentPublic[]>;
  findByUserIdAndType(userId: string, type: DocumentType): Promise<IDocumentPublic | null>;
  create(data: CreateDocumentData): Promise<IDocumentPublic>;
  update(id: string, data: UpdateDocumentData): Promise<IDocumentPublic>;
  delete(id: string): Promise<void>;
}