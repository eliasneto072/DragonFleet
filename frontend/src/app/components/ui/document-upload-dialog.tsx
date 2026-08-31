// src/app/components/ui/document-upload-dialog.tsx
//
// Diálogo de envio e reenvio de documento, partilhado pela tela de documentos
// pessoais e pelo bloco de documentos do veículo.
//
// Antes existiam duas cópias do mesmo fluxo — dropzone, validação de MIME,
// limite de tamanho, mutação, tratamento de erro — em documents-management.tsx
// e vehicle-documents.tsx. As cópias já tinham divergido nos rótulos.
//
// A dropzone que ficou aqui era a terceira cópia dessa mesma área. Passou a
// usar o FilePicker, que nasceu para o comprovativo do IBAN e para o recibo
// verde: agora há UM sítio onde se escolhe um ficheiro em toda a aplicação, e
// a correção do nome comprido a alargar o diálogo vale para os quatro.
//
// Não há selector de tipo aqui, e isso é deliberado: as telas passaram a
// mostrar um slot por documento obrigatório, então o envio parte sempre de uma
// linha cujo tipo já é conhecido. Isso eliminou também a lógica de "tipos
// bloqueados", que existia só para impedir enviar duas vezes o mesmo tipo.

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { FilePicker, MAX_SIZE_MB } from '@/app/components/ui/file-picker';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { documentsService } from '@/features/driver/services/documents.service';
import { invalidateAfterDocument } from '@/shared/lib/invalidate';
import { DOCUMENT_TYPE_LABELS } from '@/shared/lib/document-labels';
import type { DocumentType } from '@/shared/types/api';

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

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');

  // Limpa o formulário sempre que o diálogo abre para um documento diferente,
  // senão o ficheiro escolhido numa tentativa anterior reaparece na seguinte.
  useEffect(() => {
    if (open) {
      setFile(null);
      setFileError('');
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

        <form onSubmit={handleSubmit} className="mt-2 min-w-0 space-y-4">
          <FilePicker
            id="document-file"
            label="Ficheiro"
            file={file}
            onChange={(f) => { setFile(f); if (f) setFileError(''); }}
            error={fileError}
            onError={setFileError}
            disabled={isPending}
          />

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