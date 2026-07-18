import { DocumentType, DocumentStatus } from "../../shared/types/enums"
import { IUserPublic } from "../users/users.types"

export interface IDocument {
    id: string
    type: DocumentType
    fileUrl: string
    fileKey: string
    notes?: string
    status: DocumentStatus
    userId: string
    createdAt: Date
    updatedAt: Date
}

export type IDocumentPublic = IDocument

export type IDocumentWithUser = IDocument & {
    user?: IUserPublic
} 