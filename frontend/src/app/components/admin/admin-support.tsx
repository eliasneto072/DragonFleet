// src/app/components/admin/admin-support.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card';
import { Button }   from '@/app/components/ui/button';
import { Badge }    from '@/app/components/ui/badge';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { MessageCircle, Send, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supportService } from '@/features/driver/services/support.service';
import { useAuth } from '@/features/auth/context/AuthContext';
import type { ApiTicket, TicketStatus } from '@/features/driver/services/support.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  TECHNICAL: 'Técnico', FINANCIAL: 'Financeiro',
  DOCUMENTS: 'Documentos', ACCOUNT: 'Conta', OTHER: 'Outro',
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; className: string }> = {
  OPEN:        { label: 'Aberto',       className: 'bg-blue-100 text-blue-800'    },
  IN_PROGRESS: { label: 'Em Progresso', className: 'bg-yellow-100 text-yellow-800' },
  RESOLVED:    { label: 'Resolvido',    className: 'bg-green-100 text-green-800'  },
  CLOSED:      { label: 'Fechado',      className: 'bg-gray-100 text-gray-800'    },
};

const QUERY_KEY = ['support', 'tickets'];

function StatusBadge({ status }: { status: TicketStatus }) {
  const { label, className } = STATUS_CONFIG[status];
  return <Badge className={`${className} hover:${className}`}>{label}</Badge>;
}

// ── Modal de detalhe ──────────────────────────────────────────────────────────

function TicketModal({ ticket, onClose }: { ticket: ApiTicket; onClose: () => void }) {
  const { user }          = useAuth();
  const queryClient       = useQueryClient();
  const [reply, setReply] = useState('');

  const replyMutation = useMutation({
    mutationFn: (msg: string) => supportService.addReply(ticket.id, msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setReply('');
      toast.success('Resposta enviada!');
    },
    onError: () => toast.error('Erro ao enviar resposta.'),
  });

  const statusMutation = useMutation({
    mutationFn: (status: TicketStatus) => supportService.updateStatus(ticket.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Status atualizado!');
    },
    onError: () => toast.error('Erro ao atualizar status.'),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <DialogTitle className="text-left">{ticket.subject}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {ticket.user?.name} · {ticket.user?.email}
              </p>
              <div className="flex gap-2 mt-1 flex-wrap">
                <StatusBadge status={ticket.status} />
                <Badge variant="outline">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</Badge>
              </div>
            </div>
            {/* Mudar status */}
            <Select
              value={ticket.status}
              onValueChange={(v) => statusMutation.mutate(v as TicketStatus)}
              disabled={statusMutation.isPending}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(STATUS_CONFIG) as [TicketStatus, { label: string }][]).map(([v, { label }]) => (
                  <SelectItem key={v} value={v}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        {/* Conversa */}
        <div className="flex-1 overflow-y-auto space-y-3 py-2 min-h-0">
          <div className="bg-muted rounded-lg p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Mensagem original</p>
            <p className="text-sm">{ticket.message}</p>
          </div>

          {ticket.replies.map((r) => {
            const isAdmin = r.author.role === 'ADMIN' || r.author.role === 'MANAGER';
            return (
              <div key={r.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg p-3 ${isAdmin ? 'bg-[#108865] text-white' : 'bg-muted'}`}>
                  <p className={`text-xs font-medium mb-1 ${isAdmin ? 'text-white/80' : 'text-muted-foreground'}`}>
                    {isAdmin ? '🛡️ Suporte (tu)' : r.author.name}
                  </p>
                  <p className="text-sm">{r.message}</p>
                  <p className={`text-xs mt-1 ${isAdmin ? 'text-white/60' : 'text-muted-foreground'}`}>
                    {new Date(r.createdAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>
            );
          })}

          {ticket.replies.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma resposta ainda.</p>
          )}
        </div>

        {/* Resposta */}
        <div className="flex gap-2 pt-2 border-t">
          <Textarea
            placeholder="Escreve uma resposta ao motorista…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            className="resize-none"
          />
          <Button
            onClick={() => replyMutation.mutate(reply.trim())}
            disabled={replyMutation.isPending || !reply.trim()}
            className="shrink-0"
          >
            {replyMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function AdminSupport() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ApiTicket | null>(null);
  const [filter, setFilter]     = useState<TicketStatus | 'ALL'>('ALL');

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn:  () => supportService.list(),
  });

  const tickets  = data?.tickets ?? [];
  const filtered = filter === 'ALL' ? tickets : tickets.filter(t => t.status === filter);

  const open       = tickets.filter(t => t.status === 'OPEN').length;
  const inProgress = tickets.filter(t => t.status === 'IN_PROGRESS').length;
  const resolved   = tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length;

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
      <Loader2 className="h-5 w-5 animate-spin" /><span>Carregando tickets…</span>
    </div>
  );

  if (isError) return (
    <div className="flex flex-col items-center py-20 gap-3">
      <AlertCircle className="h-10 w-10 text-red-400" />
      <p className="text-muted-foreground">Erro ao carregar tickets.</p>
      <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: QUERY_KEY })}>
        Tentar novamente
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Suporte</h2>
        <p className="text-muted-foreground">Gerencie os pedidos de suporte dos motoristas</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Abertos</CardTitle>
            <MessageCircle className="h-4 w-4 text-blue-600 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{open}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Em Progresso</CardTitle>
            <MessageCircle className="h-4 w-4 text-yellow-600 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Resolvidos</CardTitle>
            <MessageCircle className="h-4 w-4 text-green-600 shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{resolved}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle>Todos os Tickets</CardTitle>
            <CardDescription>{filtered.length} ticket{filtered.length !== 1 ? 's' : ''}</CardDescription>
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as TicketStatus | 'ALL')}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {(Object.entries(STATUS_CONFIG) as [TicketStatus, { label: string }][]).map(([v, { label }]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum ticket encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Motorista</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((ticket) => (
                    <TableRow key={ticket.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(ticket)}>
                      <TableCell>
                        <p className="font-medium whitespace-nowrap">{ticket.user?.name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{ticket.user?.email}</p>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="truncate">{ticket.subject}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell><StatusBadge status={ticket.status} /></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelected(ticket); }}>
                          Responder
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && <TicketModal ticket={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}