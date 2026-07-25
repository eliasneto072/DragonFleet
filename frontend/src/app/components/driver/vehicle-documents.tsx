// src/app/components/driver/vehicle-documents.tsx
//
// Bloco de documentos de um veículo, dentro do cartão do veículo.
//
// O envio e os estados vêm agora de componentes partilhados: a dropzone, a
// validação de MIME, o limite de tamanho e a mutação viviam duplicados aqui e
// em documents-management.tsx, e as duas cópias já tinham divergido nos
// rótulos de estado. Este ficheiro passou a tratar só do layout da lista.
//
// A tela de Documentos resume o progresso destes documentos e liga para cá;
// a ação acontece neste sítio, junto do veículo a que pertencem.

import { useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { ExternalLink, FileText, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { documentsService } from '@/features/driver/services/documents.service';
import { DOCUMENT_TYPE_LABELS, VEHICLE_DOCUMENT_TYPES } from '@/shared/lib/document-labels';
import {
  DocumentStatusIcon, documentStateMeta, type DocumentSlotState,
} from '@/app/components/ui/document-status';
import { DocumentUploadDialog } from '@/app/components/ui/document-upload-dialog';
import type { ApiDocument, DocumentType } from '@/shared/types/api';

function openDocument(id: string) {
  documentsService.openFile(id).catch((err: any) =>
    toast.error(err?.message ?? 'Erro ao abrir o documento.'),
  );
}

function cleanNote(notes?: string | null) {
  return notes?.replace('[avisado-7d]', '').trim() ?? '';
}

interface Props {
  vehicleId: string;
  /** Todos os documentos já carregados na tela. Filtramos por veículo aqui. */
  documents: ApiDocument[];
}

export function VehicleDocuments({ vehicleId, documents }: Props) {
  const [uploadType, setUploadType] = useState<DocumentType | null>(null);
  const [isResubmit, setIsResubmit] = useState(false);

  const own = documents.filter((d) => d.vehicleId === vehicleId);

  // Um slot por documento obrigatório. O contador deriva desta mesma lista,
  // por isso nunca diverge do que está a ser renderizado.
  const rows = VEHICLE_DOCUMENT_TYPES.map((type) => {
    const doc = own.find((d) => d.type === type);
    const state: DocumentSlotState = doc ? doc.status : 'MISSING';
    return { type, doc, state };
  });

  const total = rows.length;
  const approved = rows.filter((r) => r.state === 'APPROVED').length;
  const progress = total === 0 ? 0 : Math.round((approved / total) * 100);

  const rejected = rows.filter((r) => r.state === 'REJECTED' && cleanNote(r.doc?.notes));

  function startUpload(type: DocumentType, resubmit: boolean) {
    setUploadType(type);
    setIsResubmit(resubmit);
  }

  return (
    <div className="mt-3 border-t pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          Documentos
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {approved} de {total}
        </span>
      </div>

      <div
        className="mb-1 h-1 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={approved}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Documentos do veículo aprovados"
      >
        <div
          className="h-full rounded-full bg-success transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ul className="-mx-1">
        {rows.map(({ type, doc, state }) => {
          const name = DOCUMENT_TYPE_LABELS[type] ?? type;
          const meta = documentStateMeta(state);
          const canResubmit = state === 'REJECTED' || state === 'EXPIRED';

          return (
            <li
              key={type}
              className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/40"
              title={`${name} — ${meta.label}`}
            >
              <DocumentStatusIcon state={state} className="h-3.5 w-3.5" />

              <span
                className={`min-w-0 flex-1 truncate text-xs ${
                  doc ? 'font-medium' : 'text-muted-foreground'
                }`}
              >
                {name}
              </span>

              <div className="flex shrink-0 items-center gap-1">
                {doc && (
                  <Button
                    size="sm" variant="ghost" className="h-6 w-6 p-0"
                    onClick={() => openDocument(doc.id)}
                    aria-label={`Ver ${name}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
                {state === 'MISSING' && (
                  <Button
                    size="sm" variant="outline" className="h-6 px-2 text-xs"
                    onClick={() => startUpload(type, false)}
                  >
                    <Upload className="mr-1 h-3 w-3" aria-hidden="true" />Enviar
                  </Button>
                )}
                {canResubmit && (
                  <Button
                    size="sm" className="h-6 px-2 text-xs"
                    onClick={() => startUpload(type, true)}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />Reenviar
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {rejected.map(({ type, doc }) => (
        <p
          key={`note-${doc!.id}`}
          className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <span className="font-medium">{DOCUMENT_TYPE_LABELS[type] ?? type}:</span>{' '}
          {cleanNote(doc!.notes)}
        </p>
      ))}

      <DocumentUploadDialog
        open={!!uploadType}
        onClose={() => setUploadType(null)}
        type={uploadType}
        isResubmit={isResubmit}
        vehicleId={vehicleId}
      />
    </div>
  );
}
