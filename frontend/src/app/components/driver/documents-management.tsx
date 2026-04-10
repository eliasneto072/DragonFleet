import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { FileText, Upload, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { toast } from 'sonner';

interface DocumentsManagementProps {
  driver: any;
}

export function DocumentsManagement({ driver }: DocumentsManagementProps) {
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState(driver.documents);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Aprovado</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>;
      default:
        return null;
    }
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Documento enviado com sucesso! Aguardando aprovação.');
    setOpen(false);
  };

  return (
    <div className="space-y-6">
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
                Selecione o tipo de documento e faça o upload do arquivo
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="docType">Tipo de Documento</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cnh">CNH - Carteira Nacional de Habilitação</SelectItem>
                    <SelectItem value="crlv">CRLV - Certificado do Veículo</SelectItem>
                    <SelectItem value="antecedentes">Certidão de Antecedentes Criminais</SelectItem>
                    <SelectItem value="comprovante">Comprovante de Residência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="file">Arquivo</Label>
                <Input id="file" type="file" accept=".pdf,.jpg,.jpeg,.png" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry">Data de Validade (opcional)</Label>
                <Input id="expiry" type="date" />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Enviar</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {documents.map((doc: any) => (
          <Card key={doc.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{doc.name}</CardTitle>
                    <CardDescription>{doc.type}</CardDescription>
                  </div>
                </div>
                {getStatusBadge(doc.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data de Upload:</span>
                  <span>{new Date(doc.uploadDate).toLocaleDateString('pt-BR')}</span>
                </div>
                {doc.expiryDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Válido até:</span>
                    <span>{new Date(doc.expiryDate).toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  Visualizar
                </Button>
                {doc.status === 'rejected' && (
                  <Button variant="default" size="sm" className="flex-1">
                    Reenviar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {documents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Nenhum documento enviado</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Envie seus documentos para começar a trabalhar na plataforma
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
