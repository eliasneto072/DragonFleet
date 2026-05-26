// src/app/components/admin/admin-documents.tsx

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import {
  FileText, CheckCircle, Clock, XCircle,
  Loader2, AlertCircle, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { documentsService } from '@/features/driver/services/documents.service';
import { usersService }     from '@/features/admin/services/users.service';
import { queryKeys }        from '@/shared/lib/query-keys';
import type { DocumentStatus, ApiDocument } from '@/shared/types/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  CNH:   'CNH',
  CRLV:  'CRLV',
  RECIBO: 'Recibo Verde',
  OTHER: 'Outro',
};

function getStatusBadge(status: DocumentStatus) {
  switch (status) {
    case 'APPROVED': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Aprovado</Badge>;
    case 'PENDING':  return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    case 'REJECTED': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>;
    default: return null;
  }
}

// ── Componente ────────────────────────────────────────────────────────────────

export function AdminDocuments() {
  const queryClient = useQueryClient();

  const docsQ  = useQuery({ queryKey: queryKeys.documents.list, queryFn: () => documentsService.list() });
  const usersQ = useQuery({ queryKey: queryKeys.users.list,     queryFn: () => usersService.list() });

  const isLoading = docsQ.isLoading || usersQ.isLoading;
  const isError   = docsQ.isError   || usersQ.isError;

  const { mutate: updateStatus, isPending: updating } = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: DocumentStatus; notes?: string }) =>
      documentsService.updateStatus(id, { status, notes }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents.all });
      toast.success(status === 'APPROVED' ? 'Documento aprovado!' : 'Documento rejeitado.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao processar documento.'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /><span>Carregando documentos…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar documentos.</p>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const documents = docsQ.data?.documents  ?? [];
  const users     = usersQ.data?.users     ?? [];

  const pending  = documents.filter(d => d.status === 'PENDING');
  const approved = documents.filter(d => d.status === 'APPROVED');
  const rejected = documents.filter(d => d.status === 'REJECTED');

  function getDriverName(userId: string) {
    const u = users.find(u => u.id === userId);
    return { name: u?.name ?? '—', email: u?.email ?? '' };
  }

  function DocRow({ doc }: { doc: ApiDocument }) {
    const driver = getDriverName(doc.userId);
    return (
      <TableRow>
        <TableCell>
          <p className="font-medium whitespace-nowrap">{driver.name}</p>
          <p className="text-sm text-muted-foreground whitespace-nowrap">{driver.email}</p>
        </TableCell>
        <TableCell className="whitespace-nowrap">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</TableCell>
        <TableCell className="whitespace-nowrap">
          {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
        </TableCell>
        <TableCell>{getStatusBadge(doc.status)}</TableCell>
        <TableCell>
          <div className="flex gap-2 justify-end flex-wrap">
            {/* Ver ficheiro */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(doc.fileUrl, '_blank')}
            >
              <Eye className="h-3 w-3 mr-1" />Ver
            </Button>

            {/* Aprovar — só se não estiver já aprovado */}
            {doc.status !== 'APPROVED' && (
              <Button
                size="sm"
                disabled={updating}
                onClick={() => updateStatus({ id: doc.id, status: 'APPROVED' })}
              >
                {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                Aprovar
              </Button>
            )}

            {/* Rejeitar — só se não estiver já rejeitado */}
            {doc.status !== 'REJECTED' && (
              <Button
                size="sm"
                variant="destructive"
                disabled={updating}
                onClick={() => updateStatus({ id: doc.id, status: 'REJECTED', notes: 'Documento inválido ou ilegível.' })}
              >
                <XCircle className="h-3 w-3 mr-1" />Rejeitar
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  function DocCard({ doc }: { doc: ApiDocument }) {
    const driver = getDriverName(doc.userId);
    return (
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium">{driver.name}</p>
            <p className="text-xs text-muted-foreground">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</p>
            <p className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString('pt-BR')}</p>
          </div>
          <div>{getStatusBadge(doc.status)}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => window.open(doc.fileUrl, '_blank')}>
            <Eye className="h-3 w-3 mr-1" />Ver
          </Button>
          {doc.status !== 'APPROVED' && (
            <Button size="sm" className="flex-1" disabled={updating}
              onClick={() => updateStatus({ id: doc.id, status: 'APPROVED' })}>
              Aprovar
            </Button>
          )}
          {doc.status !== 'REJECTED' && (
            <Button size="sm" variant="destructive" className="flex-1" disabled={updating}
              onClick={() => updateStatus({ id: doc.id, status: 'REJECTED', notes: 'Documento inválido ou ilegível.' })}>
              Rejeitar
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Gestão de Documentos</h2>
        <p className="text-muted-foreground">Analise e valide os documentos enviados pelos motoristas</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pending.length}</div>
            <p className="text-xs text-muted-foreground">Aguardando análise</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Aprovados</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{approved.length}</div>
            <p className="text-xs text-muted-foreground">Validados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Rejeitados</CardTitle>
            <XCircle className="h-4 w-4 text-red-600 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{rejected.length}</div>
            <p className="text-xs text-muted-foreground">Inválidos</p>
          </CardContent>
        </Card>
      </div>

      {/* Pendentes — acção prioritária */}
      <Card>
        <CardHeader>
          <CardTitle>Documentos Pendentes</CardTitle>
          <CardDescription>Requerem análise ({pending.length})</CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum documento pendente.
            </p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motorista</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map(doc => <DocRow key={doc.id} doc={doc} />)}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden space-y-3">
                {pending.map(doc => <DocCard key={doc.id} doc={doc} />)}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Histórico completo */}
      <Card>
        <CardHeader>
          <CardTitle>Todos os Documentos</CardTitle>
          <CardDescription>{documents.length} no total</CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum documento enviado ainda.</p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motorista</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...documents]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map(doc => <DocRow key={doc.id} doc={doc} />)}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden space-y-3">
                {[...documents]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map(doc => <DocCard key={doc.id} doc={doc} />)}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}