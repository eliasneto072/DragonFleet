// src/app/components/driver/documents-management.tsx

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { FileText, Upload, CheckCircle, XCircle, Clock, Loader2, AlertCircle, ExternalLink, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { documentsService } from '@/features/driver/services/documents.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { DocumentType, DocumentStatus } from '@/shared/types/api';

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CNH:    'CNH — Carteira Nacional de Habilitação',
  CRLV:   'CRLV — Certificado do Veículo',
  RECIBO: 'Recibo',
  OTHER:  'Outro',
};

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_MB = 10;

function getStatusBadge(status: DocumentStatus) {
  switch (status) {
    case 'APPROVED':
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle className="h-3 w-3 mr-1" />Aprovado
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
          <Clock className="h-3 w-3 mr-1" />Pendente
        </Badge>
      );
    case 'REJECTED':
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          <XCircle className="h-3 w-3 mr-1" />Rejeitado
        </Badge>
      );
    default:
      return null;
  }
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function DocumentsManagement() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen]         = useState(false);
  const [docType, setDocType]   = useState<DocumentType | ''>('');
  const [file, setFile]         = useState<File | null>(null);
  const [fileError, setFileError] = useState('');

  // ── Leitura ───────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.documents.list,
    queryFn:  () => documentsService.list(),
  });

  const documents = data?.documents ?? [];

  // ── Criar documento ───────────────────────────────────────────────────────
  const { mutate: createDocument, isPending } = useMutation({
    mutationFn: () => documentsService.create(docType as DocumentType, file!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      toast.success('Documento enviado! Aguardando aprovação.');
      handleClose();
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao enviar documento.');
    },
  });

  function handleClose() {
    setOpen(false);
    setDocType('');
    setFile(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  function handleDropZoneClick() {
    fileInputRef.current?.click();
  }

  function handleRemoveFile(e: React.MouseEvent) {
    e.stopPropagation();
    setFile(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!docType) { toast.error('Selecione o tipo do documento.'); return; }
    if (!file)    { toast.error('Selecione um arquivo.');          return; }
    createDocument();
  }

  // ── Estados de carregamento / erro ────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando documentos…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar documentos.</p>
        <Button
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Meus Documentos</h2>
          <p className="text-muted-foreground">Gerencie seus documentos e certificações</p>
        </div>

        <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Enviar Documento
            </Button>
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar Novo Documento</DialogTitle>
              <DialogDescription>
                Selecione o tipo e anexe o arquivo (JPEG, PNG, WebP ou PDF — máx. {MAX_SIZE_MB} MB)
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-2">

              {/* Tipo do documento */}
              <div className="space-y-2">
                <Label>Tipo de Documento</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {DOCUMENT_TYPE_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Área de upload */}
              <div className="space-y-2">
                <Label>Arquivo</Label>

                <div
                  onClick={handleDropZoneClick}
                  className={`
                    relative flex flex-col items-center justify-center
                    border-2 border-dashed rounded-lg p-6 cursor-pointer
                    transition-colors select-none
                    ${file
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/30'
                    }
                  `}
                >
                  {file ? (
                    <div className="flex items-center gap-3 w-full">
                      <Paperclip className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="shrink-0 rounded-full p-1 hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">Clique para selecionar o arquivo</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        JPEG, PNG, WebP ou PDF — máx. {MAX_SIZE_MB} MB
                      </p>
                    </>
                  )}
                </div>

                {/* Input real escondido */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {fileError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {fileError}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending || !file || !docType}>
                  {isPending
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando…</>
                    : <><Upload className="h-4 w-4 mr-2" />Enviar</>
                  }
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Grid de documentos */}
      <div className="grid gap-4 md:grid-cols-2">
        {documents.map((doc) => (
          <Card key={doc.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
                    </CardTitle>
                    <CardDescription>
                      {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                    </CardDescription>
                  </div>
                </div>
                {getStatusBadge(doc.status)}
              </div>
            </CardHeader>
            <CardContent>
              {doc.notes && (
                <p className="text-sm text-muted-foreground mb-3">{doc.notes}</p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.open(doc.fileUrl, '_blank')}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Visualizar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty state */}
      {documents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Nenhum documento enviado</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Envie seus documentos para começar a trabalhar na plataforma.
            </p>
            <Button onClick={() => setOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Enviar Primeiro Documento
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}