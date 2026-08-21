// src/app/components/ui/document-upload-dialog.tsx
//
// Diálogo de envio e reenvio de documento, partilhado pela tela de documentos
// pessoais e pelo bloco de documentos do veículo.
//
// Antes existiam duas cópias do mesmo fluxo — dropzone, validação de MIME,
// limite de tamanho, mutação, tratamento de erro — em documents-management.tsx
// e vehicle-documents.tsx. As cópias já tinham divergido nos rótulos.
//
// Não há selector de tipo aqui, e isso é deliberado: as telas passaram a
// mostrar um slot por documento obrigatório, então o envio parte sempre de uma
// linha cujo tipo já é conhecido. Isso eliminou também a lógica de "tipos
// bloqueados", que existia só para impedir enviar duas vezes o mesmo tipo.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { AlertCircle, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { documentsService } from '@/features/driver/services/documents.service';
import { invalidateAfterDocument } from '@/shared/lib/invalidate';
import { DOCUMENT_TYPE_LABELS } from '@/shared/lib/document-labels';
import type { DocumentType } from '@/shared/types/api';

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB = 10;

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Tipo do documento a enviar. O diálogo não pergunta. */
  type: DocumentType | null;
  /** Reenvio substitui a versão anterior e volta ao estado de análise. */
  isResubmit?: boolean;
  /** Preenchido quando o documento pertence a um veículo. */
  vehicleId?: string;
}

export function DocumentUploadDialog({
  open, onClose, type, isResubmit = false, vehicleId,
}: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');

  // Limpa o formulário sempre que o diálogo abre para um documento diferente,
  // senão o ficheiro escolhido numa tentativa anterior reaparece na seguinte.
  useEffect(() => {
    if (open) {
      setFile(null);
      setFileError('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open, type]);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      // Sem data de emissão: a validade é preenchida pela administração ao
      // rever, lendo do próprio documento. Ver DocumentValidityFields.
      documentsService.create(type as DocumentType, file!, undefined, vehicleId),
    onSuccess: () => {
      // O envio pode desbloquear o motorista e reativar o veículo; o painel
      // do administrador conta os documentos por rever.
      invalidateAfterDocument(queryClient);
      toast.success(
        isResubmit
          ? 'Documento reenviado. Aguarda nova análise.'
          : 'Documento enviado. Aguarda aprovação.',
      );
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao enviar documento.'),
  });

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
      setFileError(`Ficheiro demasiado grande. Máximo ${MAX_SIZE_MB} MB.`);
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
    if (!type || !file) {
      toast.error('Selecione um ficheiro.');
      return;
    }
    mutate();
  }

  const label = type ? (DOCUMENT_TYPE_LABELS[type] ?? type) : '';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isResubmit ? 'Reenviar documento' : 'Enviar documento'}</DialogTitle>
          <DialogDescription>
            {label}
            {isResubmit
              ? ' — substitui a versão anterior e volta para análise.'
              : ` — JPEG, PNG, WebP ou PDF, até ${MAX_SIZE_MB} MB.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-2">
            <Label>Ficheiro</Label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex cursor-pointer select-none flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
                file
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/30'
              }`}
            >
              {file ? (
                <div className="flex w-full items-center gap-3">
                  <Paperclip className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="shrink-0 rounded-full p-1 transition-colors hover:bg-muted"
                    aria-label="Remover ficheiro"
                  >
                    <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium">Clique para selecionar o ficheiro</p>
                  <p className="mt-1 text-center text-xs text-muted-foreground">
                    JPEG, PNG, WebP ou PDF — máx. {MAX_SIZE_MB} MB
                  </p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />

            {fileError && (
              <p className="flex items-start gap-1 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                {fileError}
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              type="button" variant="outline" onClick={onClose} disabled={isPending}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !file} className="w-full sm:w-auto">
              {isPending
                ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />A enviar…</>)
                : (<><Upload className="mr-2 h-4 w-4" />{isResubmit ? 'Reenviar' : 'Enviar'}</>)}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}