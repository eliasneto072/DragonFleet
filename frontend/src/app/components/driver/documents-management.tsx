// src/app/components/driver/documents-management.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { FileText, Upload, CheckCircle, XCircle, Clock, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
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

function getStatusBadge(status: DocumentStatus) {
  switch (status) {
    case 'APPROVED':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Aprovado</Badge>;
    case 'PENDING':
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    case 'REJECTED':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>;
    default:
      return null;
  }
}

export function DocumentsManagement() {
  const queryClient = useQueryClient();
  const [open, setOpen]       = useState(false);
  const [docType, setDocType] = useState<DocumentType | ''>('');
  const [fileUrl, setFileUrl] = useState('');

  // ── Leitura ───────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.documents.list,
    queryFn:  () => documentsService.list(),
  });

  const documents = data?.documents ?? [];

  // ── Criar documento ───────────────────────────────────────────────────────
  const { mutate: createDocument, isPending } = useMutation({
    mutationFn: () =>
      documentsService.create({
        type:    docType as DocumentType,
        fileUrl: fileUrl,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      toast.success('Documento enviado! Aguardando aprovação.');
      setOpen(false);
      setDocType('');
      setFileUrl('');
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao enviar documento.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!docType) { toast.error('Selecione o tipo do documento.'); return; }
    if (!fileUrl) { toast.error('Informe a URL do arquivo.');      return; }
    createDocument();
  }

  // ── Estados ───────────────────────────────────────────────────────────────
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
        <Button variant="outline" onClick={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })
        }>
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
          <h2 className="text-2xl font-bold">Meus Documentos</h2>
          <p className="text-muted-foreground">Gerencie seus documentos e certificações</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
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
                Selecione o tipo e informe a URL pública do arquivo
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Tipo de Documento</Label>
                <Select
                  value={docType}
                  onValueChange={(v) => setDocType(v as DocumentType)}
                >
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

              <div className="space-y-2">
                <Label htmlFor="fileUrl">URL do Arquivo</Label>
                <Input
                  id="fileUrl"
                  type="url"
                  placeholder="https://..."
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Faça upload em um serviço de storage (ex: S3, Google Drive) e cole a URL aqui.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Enviar
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
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
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
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => window.open(doc.fileUrl, '_blank')}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Visualizar
                </Button>
              </div>
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