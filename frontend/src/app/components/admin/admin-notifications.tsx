// src/app/components/admin/admin-notifications.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card';
import { Button }   from '@/app/components/ui/button';
import { Input }    from '@/app/components/ui/input';
import { Label }    from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Badge }    from '@/app/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { Bell, Send, Users, User, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { notificationsService } from '@/features/driver/services/notifications.service';
import { usersService }         from '@/features/admin/services/users.service';
import { queryKeys }            from '@/shared/lib/query-keys';

export function AdminNotifications() {
  const queryClient = useQueryClient();

  const [target,  setTarget]  = useState<'all' | 'single'>('all');
  const [userId,  setUserId]  = useState('');
  const [title,   setTitle]   = useState('');
  const [message, setMessage] = useState('');

  const usersQ = useQuery({
    queryKey: queryKeys.users.list,
    queryFn:  () => usersService.list(),
  });

  const notifsQ = useQuery({
    queryKey: queryKeys.notifications.list,
    queryFn:  () => notificationsService.list(),
  });

  const sendMutation = useMutation({
    mutationFn: () => {
      if (target === 'all') {
        return notificationsService.broadcast(title, message);
      }
      return notificationsService.create(userId, title, message);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      const count = (data as any)?.count;
      toast.success(
        count !== undefined
          ? `Notificação enviada para ${count} motorista(s)!`
          : 'Notificação enviada com sucesso!'
      );
      setTitle('');
      setMessage('');
      setUserId('');
    },
    onError: () => toast.error('Erro ao enviar notificação.'),
  });

  function handleSend() {
    if (!title.trim() || !message.trim()) {
      toast.error('Preenche o título e a mensagem.');
      return;
    }
    if (target === 'single' && !userId) {
      toast.error('Seleciona um motorista.');
      return;
    }
    sendMutation.mutate();
  }

  const drivers       = (usersQ.data?.users ?? []).filter(u => u.role === 'DRIVER');
  const notifications = notifsQ.data?.notifications ?? [];
  const recent        = [...notifications]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Notificações</h2>
        <p className="text-muted-foreground">Envie notificações aos motoristas — também chegam por email</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total enviadas</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{notifications.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Não lidas</CardTitle>
            <Bell className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {notifications.filter(n => !n.read).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Formulário */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Nova Notificação
          </CardTitle>
          <CardDescription>A notificação aparece no portal e é enviada por email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Destinatário */}
          <div className="space-y-2">
            <Label>Destinatário</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={target === 'all' ? 'default' : 'outline'}
                onClick={() => setTarget('all')}
                className="flex-1"
              >
                <Users className="h-4 w-4 mr-2" />
                Todos os Motoristas
              </Button>
              <Button
                type="button"
                variant={target === 'single' ? 'default' : 'outline'}
                onClick={() => setTarget('single')}
                className="flex-1"
              >
                <User className="h-4 w-4 mr-2" />
                Motorista Específico
              </Button>
            </div>
          </div>

          {/* Select motorista */}
          {target === 'single' && (
            <div className="space-y-1.5">
              <Label>Motorista</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleciona um motorista" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} — {d.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="notif-title">Título</Label>
            <Input
              id="notif-title"
              placeholder="Ex: Documento aprovado, Saque processado…"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Mensagem */}
          <div className="space-y-1.5">
            <Label htmlFor="notif-message">Mensagem</Label>
            <Textarea
              id="notif-message"
              placeholder="Escreve a mensagem da notificação…"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
            />
          </div>

          <Button onClick={handleSend} disabled={sendMutation.isPending}>
            {sendMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />A enviar…</>
              : <><Send className="h-4 w-4 mr-2" />Enviar Notificação</>}
          </Button>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico Recente</CardTitle>
          <CardDescription>Últimas 20 notificações enviadas</CardDescription>
        </CardHeader>
        <CardContent>
          {notifsQ.isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /><span>A carregar…</span>
            </div>
          ) : recent.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma notificação enviada ainda.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recent.map(n => (
                <div key={n.id} className="flex items-start justify-between gap-3 border-b pb-3 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{n.title}</p>
                      {n.read
                        ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100 shrink-0"><CheckCircle className="h-3 w-3 mr-1" />Lida</Badge>
                        : <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 shrink-0">Não lida</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">{n.message}</p>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {new Date(n.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}