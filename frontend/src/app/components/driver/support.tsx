import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Badge } from '@/app/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { MessageCircle, Send, Phone, Mail, Clock } from 'lucide-react';
import { useState } from 'react';

interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  createdAt: string;
  lastUpdate: string;
}

const mockTickets: SupportTicket[] = [
  {
    id: '#12345',
    subject: 'Problema com retirada',
    category: 'Financeiro',
    status: 'in_progress',
    createdAt: '2026-01-10',
    lastUpdate: '2026-01-12',
  },
  {
    id: '#12340',
    subject: 'Upload de documento',
    category: 'Documentos',
    status: 'resolved',
    createdAt: '2026-01-05',
    lastUpdate: '2026-01-06',
  },
];

export function Support() {
  const [formData, setFormData] = useState({
    subject: '',
    category: '',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock submit - aqui conectaria com a API
    alert('Pedido de suporte enviado com sucesso!');
    setFormData({ subject: '', category: '', message: '' });
  };

  const getStatusBadge = (status: SupportTicket['status']) => {
    const variants = {
      open: 'default',
      in_progress: 'secondary',
      resolved: 'outline',
      closed: 'outline',
    } as const;

    const labels = {
      open: 'Aberto',
      in_progress: 'Em Progresso',
      resolved: 'Resolvido',
      closed: 'Fechado',
    };

    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Contact Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-[#1D1D1D] to-[#108865]">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center text-white">
              <Phone className="h-8 w-8 mb-3" />
              <h3 className="font-semibold mb-1">Telefone</h3>
              <p className="text-sm text-gray-200">+351 300 600 278</p>
              <p className="text-xs text-gray-300 mt-2">Seg-Sex: 9h-18h</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[#1D1D1D] to-[#108865]">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center text-white">
              <Mail className="h-8 w-8 mb-3" />
              <h3 className="font-semibold mb-1">Email</h3>
              <p className="text-sm text-gray-200">suporte@dragonfleet.com</p>
              <p className="text-xs text-gray-300 mt-2">Resposta em 24h</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[#1D1D1D] to-[#108865]">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center text-white">
              <Clock className="h-8 w-8 mb-3" />
              <h3 className="font-semibold mb-1">Horário</h3>
              <p className="text-sm text-gray-200">Segunda a Sexta</p>
              <p className="text-xs text-gray-300 mt-2">09:00 - 18:00</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* New Ticket Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Novo Pedido de Suporte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="category">Categoria</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technical">Técnico</SelectItem>
                  <SelectItem value="financial">Financeiro</SelectItem>
                  <SelectItem value="documents">Documentos</SelectItem>
                  <SelectItem value="account">Conta</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="subject">Assunto</Label>
              <Input
                id="subject"
                placeholder="Descreva brevemente o problema"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="message">Mensagem</Label>
              <Textarea
                id="message"
                placeholder="Descreva detalhadamente o seu problema ou dúvida"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="mt-1 min-h-[150px]"
                required
              />
            </div>

            <Button type="submit" className="w-full md:w-auto">
              <Send className="h-4 w-4 mr-2" />
              Enviar Pedido
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Ticket History */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          {mockTickets.length > 0 ? (
            <div className="space-y-3">
              {mockTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-sm text-muted-foreground">
                        {ticket.id}
                      </span>
                      {getStatusBadge(ticket.status)}
                      <Badge variant="outline">{ticket.category}</Badge>
                    </div>
                    <h4 className="font-semibold mb-1">{ticket.subject}</h4>
                    <p className="text-sm text-muted-foreground">
                      Criado: {ticket.createdAt} | Última atualização: {ticket.lastUpdate}
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Ver Detalhes
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Você ainda não tem pedidos de suporte.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Perguntas Frequentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <details className="group">
              <summary className="flex cursor-pointer items-center justify-between py-2 font-semibold">
                Como solicitar uma retirada?
                <span className="transition group-open:rotate-180">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </summary>
              <p className="pt-2 text-sm text-muted-foreground">
                Vá até a aba "Retiradas", insira o valor desejado e clique em "Solicitar Retirada". 
                O pedido será analisado em até 24h.
              </p>
            </details>

            <details className="group">
              <summary className="flex cursor-pointer items-center justify-between py-2 font-semibold">
                Como fazer upload de documentos?
                <span className="transition group-open:rotate-180">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </summary>
              <p className="pt-2 text-sm text-muted-foreground">
                Na aba "Documentos", clique no botão "Upload Documento", selecione o tipo e faça o upload do arquivo. 
                Documentos aceitos: PDF, JPG, PNG (máx. 5MB).
              </p>
            </details>

            <details className="group">
              <summary className="flex cursor-pointer items-center justify-between py-2 font-semibold">
                Quanto tempo demora o processamento?
                <span className="transition group-open:rotate-180">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </summary>
              <p className="pt-2 text-sm text-muted-foreground">
                Retiradas aprovadas são processadas em 24h úteis. Documentos são verificados em até 48h.
              </p>
            </details>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}