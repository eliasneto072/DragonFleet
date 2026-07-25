// src/app/components/driver/vehicle-documents.tsx
//
// Bloco de documentos de um veículo (lado do motorista): mostra os documentos
// obrigatórios, permite enviar os que faltam e reenviar os rejeitados/expirados.
// O motorista só vê/gere os documentos do próprio veículo.
//
// Densidade: cada documento ocupa uma única linha (~28px). O status é
// comunicado por um ícone colorido à esquerda do nome, em vez de um <Badge>
// numa segunda linha — o texto do status continua acessível via title e
// via <span className="sr-only">.

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  FileText, Upload, CheckCircle, XCircle, Clock, Loader2, AlertCircle,
  ExternalLink, Paperclip, X, CalendarClock, RefreshCw, Circle,
} from 'lucide-react';
import { toast } from 'sonner';
import { documentsService } from '@/features/driver/services/documents.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { ApiDocument, DocumentStatus, DocumentType } from '@/shared/types/api';
import { DOCUMENT_TYPE_LABELS } from '@/shared/lib/document-labels';

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB = 10;
const REPLACEABLE: DocumentStatus[] = ['REJECTED', 'EXPIRED'];

// Os documentos obrigatórios do veículo, na ordem em que aparecem.
const VEHICLE_DOC_TYPES: DocumentType[] = [
  'DUA',
  'SEGURO_CARTA_VERDE',
  'SEGURO_CONDICOES_ESPECIAIS',
  'INSPECAO_PERIODICA',
];

// Ponto único de verdade para status de documento. Trocar as classes de cor
// aqui muda o bloco inteiro.
const DOC_STATUS_META: Record<DocumentStatus, { label: string; icon: typeof CheckCircle; cls: string }> = {
  APPROVED: { label: 'Aprovado', icon: CheckCircle, cls: 'text-green-600' },
  PENDING: { label: 'Em análise', icon: Clock, cls: 'text-yellow-600' },
  REJECTED: { label: 'Rejeitado', icon: XCircle, cls: 'text-red-600' },
  EXPIRED: { label: 'Expirado', icon: CalendarClock, cls: 'text-orange-600' },
};

const MISSING_META = { label: 'Não enviado', icon: Circle, cls: 'text-muted-foreground/50' };

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function viewDocument(id: string) {
  documentsService.openFile(id).catch((err: any) => toast.error(err?.message ?? 'Erro ao abrir o documento.'));
}

interface Props {
  vehicleId: string;
  /** Todos os documentos (a lista global já carregada na tela). Filtramos por veículo aqui. */
  documents: ApiDocument[];
}

export function VehicleDocuments({ vehicleId, documents }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [isResubmit, setIsResubmit] = useState(false);

  const vehicleDocs = documents.filter((d) => d.vehicleId === vehicleId);

  // Resolve um documento por tipo obrigatório. O contador é derivado desta
  // mesma lista, então nunca diverge do que está sendo renderizado.
  const rows = VEHICLE_DOC_TYPES.map((type) => ({
    type,
    doc: vehicleDocs.find((d) => d.type === type),
  }));
  const totalCount = rows.length;
  const approvedCount = rows.filter((r) => r.doc?.status === 'APPROVED').length;
  const progress = totalCount === 0 ? 0 : Math.round((approvedCount / totalCount) * 100);

  const { mutate: sendDocument, isPending } = useMutation({
    mutationFn: () => documentsService.create(docType as DocumentType, file!, undefined, vehicleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success(isResubmit ? 'Documento reenviado! Aguardando nova análise.' : 'Documento enviado! Aguardando aprovação.');
      handleClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao enviar documento.'),
  });

  function handleClose() {
    setOpen(false);
    setDocType(null);
    setFile(null);
    setFileError('');
    setIsResubmit(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function openUpload(type: DocumentType, resubmit: boolean) {
    setDocType(type);
    setIsResubmit(resubmit);
    setFile(null);
    setFileError('');
    setOpen(true);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFileError('');
    setFile(null);
    if (!selected) return;
    if (!ACCEPTED_MIME_TYPES.includes(selected.type)) {
      setFileError('Formato inválido. Use JPEG, PNG, WebP ou PDF.');
      return;
    }
    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setFileError(`Arquivo muito grande. Máximo ${MAX_SIZE_MB} MB.`);
      return;
    }
    setFile(selected);
  }

  function handleRemoveFile(e: React.MouseEvent) {
    e.stopPropagation();
    setFile(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!docType || !file) { toast.error('Selecione um arquivo.'); return; }
    sendDocument();
  }

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          Documentos
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {approvedCount} de {totalCount}
        </span>
      </div>

      {/* Progresso de aprovação */}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-muted mb-1"
        role="progressbar"
        aria-valuenow={approvedCount}
        aria-valuemin={0}
        aria-valuemax={totalCount}
        aria-label="Documentos aprovados"
      >
        <div
          className="h-full rounded-full bg-green-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ul className="-mx-1">
        {rows.map(({ type, doc }) => {
          const meta = doc ? DOC_STATUS_META[doc.status] ?? MISSING_META : MISSING_META;
          const Icon = meta.icon;
          const canResubmit = !!doc && REPLACEABLE.includes(doc.status);
          const name = DOCUMENT_TYPE_LABELS[type] ?? type;

          return (
            <li
              key={type}
              className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/40"
              title={`${name} — ${meta.label}`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.cls}`} aria-hidden="true" />
              <span className="sr-only">{meta.label}:</span>
              <span className={`min-w-0 flex-1 truncate text-xs ${doc ? 'font-medium' : 'text-muted-foreground'}`}>
                {name}
              </span>

              <div className="flex shrink-0 items-center gap-1">
                {doc && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => viewDocument(doc.id)}
                    aria-label={`Ver ${name}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                )}
                {!doc && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => openUpload(type, false)}
                  >
                    <Upload className="mr-1 h-3 w-3" />Enviar
                  </Button>
                )}
                {canResubmit && (
                  <Button
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => openUpload(type, true)}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />Reenviar
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Motivo de rejeição, quando houver */}
      {rows
        .filter(({ doc }) => doc?.status === 'REJECTED' && doc.notes?.trim())
        .map(({ type, doc }) => (
          <div
            key={`note-${doc!.id}`}
            className="mt-2 rounded-md border border-red-100 bg-red-50 p-2 text-xs text-red-600"
          >
            <span className="font-medium">{DOCUMENT_TYPE_LABELS[type] ?? type}:</span>{' '}
            {doc!.notes?.replace('[avisado-7d]', '').trim()}
          </div>
        ))}

      {/* Dialog de upload/reenvio */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isResubmit ? 'Reenviar documento' : 'Enviar documento'}</DialogTitle>
            <DialogDescription>
              {docType ? (DOCUMENT_TYPE_LABELS[docType] ?? docType) : ''}
              {isResubmit ? ' — substitui a versão anterior e volta para análise.' : ` — JPEG, PNG, WebP ou PDF (máx. ${MAX_SIZE_MB} MB).`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Arquivo</Label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors select-none ${file ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/30'}`}
              >
                {file ? (
                  <div className="flex items-center gap-3 w-full">
                    <Paperclip className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                    </div>
                    <button type="button" onClick={handleRemoveFile} className="shrink-0 rounded-full p-1 hover:bg-muted transition-colors">
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Clique para selecionar o arquivo</p>
                    <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, WebP ou PDF — máx. {MAX_SIZE_MB} MB</p>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={handleFileChange} />
              {fileError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />{fileError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>Cancelar</Button>
              <Button type="submit" disabled={isPending || !file}>
                {isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando…</>
                  : <><Upload className="h-4 w-4 mr-2" />{isResubmit ? 'Reenviar' : 'Enviar'}</>}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}