// src/app/components/driver/support.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button }   from '@/app/components/ui/button';
import { Input }    from '@/app/components/ui/input';
import { Label }    from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Badge }    from '@/app/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  MessageCircle, Send, Phone, Mail, Clock,
  Loader2, AlertCircle, ChevronRight,
} from 'lucide-react';
import { toast }           from 'sonner';
import { supportService }  from '@/features/driver/services/support.service';
import { useAuth }         from '@/features/auth/context/AuthContext';
import type { ApiTicket, TicketCategory, TicketStatus } from '@/features/driver/services/support.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  TECHNICAL:  'Técnico',
  FINANCIAL:  'Financeiro',
  DOCUMENTS:  'Documentos',
  ACCOUNT:    'Conta',
  OTHER:      'Outro',
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; className: string }> = {
  OPEN:        { label: 'Aberto',      className: 'bg-blue-100 text-blue-800'   },
  IN_PROGRESS: { label: 'Em Progresso',className: 'bg-yellow-100 text-yellow-800' },
  RESOLVED:    { label: 'Resolvido',   className: 'bg-green-100 text-green-800' },
  CLOSED:      { label: 'Fechado',     className: 'bg-gray-100 text-gray-800'   },
};

const QUERY_KEY = ['support', 'tickets'];

function StatusBadge({ status }: { status: TicketStatus }) {
  const { label, className } = STATUS_CONFIG[status] ?? STATUS_CONFIG.OPEN;
  return <Badge className={`${className} hover:${className}`}>{label}</Badge>;
}

// ── Modal de detalhe do ticket ────────────────────────────────────────────────

function TicketDetailModal({ ticket, onClose }: { ticket: ApiTicket; onClose: () => void }) {
  const { user }        = useAuth();
  const queryClient     = useQueryClient();
  const [reply, setReply] = useState('');

  const replyMutation = useMutation({
    mutationFn: (message: string) => supportService.addReply(ticket.id, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setReply('');
      toast.success('Resposta enviada!');
    },
    onError: () => toast.error('Erro ao enviar resposta.'),
  });

  function handleReply() {
    if (!reply.trim()) return;
    replyMutation.mutate(reply.trim());
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <DialogTitle className="text-left">{ticket.subject}</DialogTitle>
              <div className="flex gap-2 mt-1 flex-wrap">
                <StatusBadge status={ticket.status} />
                <Badge variant="outline">{CATEGORY_LABELS[ticket.category]}</Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </DialogHeader>

        {/* Conversa */}
        <div className="flex-1 overflow-y-auto space-y-3 py-2 min-h-0">
          {/* Mensagem original */}
          <div className="bg-muted rounded-lg p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Mensagem original</p>
            <p className="text-sm">{ticket.message}</p>
          </div>

          {/* Respostas */}
          {ticket.replies.map((r) => {
            const isMe = r.author.id === user?.id;
            const isAdmin = r.author.role === 'ADMIN' || r.author.role === 'MANAGER';
            return (
              <div key={r.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg p-3 ${isMe ? 'bg-[#108865] text-white' : 'bg-muted'}`}>
                  <p className={`text-xs font-medium mb-1 ${isMe ? 'text-white/80' : 'text-muted-foreground'}`}>
                    {isAdmin && !isMe ? '🛡️ Suporte DragonFleet' : r.author.name}
                  </p>
                  <p className="text-sm">{r.message}</p>
                  <p className={`text-xs mt-1 ${isMe ? 'text-white/60' : 'text-muted-foreground'}`}>
                    {new Date(r.createdAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>
            );
          })}

          {ticket.replies.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aguardando resposta da equipa de suporte.
            </p>
          )}
        </div>

        {/* Campo de resposta — só se não estiver fechado/resolvido */}
        {ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED' && (
          <div className="flex gap-2 pt-2 border-t">
            <Textarea
              placeholder="Escreve uma resposta…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              className="resize-none"
            />
            <Button
              onClick={handleReply}
              disabled={replyMutation.isPending || !reply.trim()}
              className="shrink-0"
            >
              {replyMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function Support() {
  const queryClient = useQueryClient();
  const [selectedTicket, setSelectedTicket] = useState<ApiTicket | null>(null);
  const [form, setForm] = useState({ subject: '', category: '' as TicketCategory | '', message: '' });

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn:  () => supportService.list(),
  });

  const createMutation = useMutation({
    mutationFn: () => supportService.create({
      subject:  form.subject,
      category: form.category as TicketCategory,
      message:  form.message,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setForm({ subject: '', category: '', message: '' });
      toast.success('Pedido de suporte criado com sucesso!');
    },
    onError: () => toast.error('Erro ao criar pedido. Tenta novamente.'),
  });

  function handleSubmit() {
    if (!form.subject || !form.category || !form.message) {
      toast.error('Preenche todos os campos.');
      return;
    }
    createMutation.mutate();
  }

  const tickets = data?.tickets ?? [];

  return (
    <div className="space-y-6">

      {/* Contactos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Phone, title: 'Telefone',  value: '+351 300 600 278', sub: 'Seg-Sex: 9h-18h' },
          { icon: Mail,  title: 'Email',     value: 'suporte@dragonfleet.com', sub: 'Resposta em 24h' },
          { icon: Clock, title: 'Horário',   value: 'Segunda a Sexta', sub: '09:00 - 18:00' },
        ].map(({ icon: Icon, title, value, sub }) => (
          <Card key={title} className="bg-gradient-to-br from-[#1D1D1D] to-[#108865]">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center text-white">
                <Icon className="h-8 w-8 mb-3" />
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-gray-200">{value}</p>
                <p className="text-xs text-gray-300 mt-2">{sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Formulário */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Novo Pedido de Suporte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Categoria</Label>
            <Select
              value={form.category}
              onValueChange={(v) => setForm({ ...form, category: v as TicketCategory })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(CATEGORY_LABELS) as [TicketCategory, string][]).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="subject">Assunto</Label>
            <Input
              id="subject"
              placeholder="Descreve brevemente o problema"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="message">Mensagem</Label>
            <Textarea
              id="message"
              placeholder="Descreve detalhadamente o teu problema ou dúvida"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="mt-1 min-h-[120px]"
            />
          </div>

          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />A enviar…</>
              : <><Send className="h-4 w-4 mr-2" />Enviar Pedido</>}
          </Button>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle>Os Meus Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /><span>A carregar…</span>
            </div>
          )}
          {isError && (
            <div className="flex flex-col items-center py-8 gap-2">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-sm text-muted-foreground">Erro ao carregar pedidos.</p>
            </div>
          )}
          {!isLoading && !isError && tickets.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Ainda não tens pedidos de suporte.</p>
            </div>
          )}
          {!isLoading && tickets.length > 0 && (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className="w-full text-left flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <StatusBadge status={ticket.status} />
                      <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[ticket.category]}</Badge>
                    </div>
                    <p className="font-medium truncate">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
                      {ticket.replies.length > 0 && ` · ${ticket.replies.length} resposta${ticket.replies.length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader><CardTitle>Perguntas Frequentes</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { q: 'Como solicitar uma retirada?', a: 'Vá até a aba "Retiradas", insira o valor desejado e clique em "Solicitar Retirada". O pedido será analisado em até 24h.' },
              { q: 'Como fazer upload de documentos?', a: 'Na aba "Documentos", clique em "Upload Documento", selecione o tipo e faça o upload. Aceitos: PDF, JPG, PNG (máx. 5MB).' },
              { q: 'Quanto tempo demora o processamento?', a: 'Retiradas aprovadas são processadas em 24h úteis. Documentos são verificados em até 48h.' },
            ].map(({ q, a }) => (
              <details key={q} className="group">
                <summary className="flex cursor-pointer items-center justify-between py-2 font-semibold">
                  {q}
                  <span className="transition group-open:rotate-180">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </summary>
                <p className="pt-2 pb-1 text-sm text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modal de detalhe */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}