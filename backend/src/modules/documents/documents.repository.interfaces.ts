import { IDocumentPublic } from './documents.types';
import { CreateDocumentData, UpdateDocumentData, ReplaceDocumentData } from './documents.repository.types';
import { DocumentType } from '../../shared/types/enums';

export interface IDocumentRepository {
  findAll(): Promise<IDocumentPublic[]>;
  findById(id: string): Promise<IDocumentPublic | null>;
  findByUserId(userId: string): Promise<IDocumentPublic[]>;
  findByUserIdAndType(userId: string, type: DocumentType): Promise<IDocumentPublic | null>;
  findByVehicleIdAndType(vehicleId: string, type: DocumentType): Promise<IDocumentPublic | null>;
  create(data: CreateDocumentData): Promise<IDocumentPublic>;
  update(id: string, data: UpdateDocumentData): Promise<IDocumentPublic>;
  replace(id: string, data: ReplaceDocumentData): Promise<IDocumentPublic>;
  delete(id: string): Promise<void>;
}