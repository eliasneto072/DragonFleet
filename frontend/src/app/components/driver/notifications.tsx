// src/app/components/driver/notifications.tsx

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Bell, Check, AlertCircle, Info, CheckCircle, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { notificationsService } from '@/features/driver/services/notifications.service';
import { queryKeys } from '@/shared/lib/query-keys';
import type { ApiNotification } from '@/shared/types/api';

// O backend não tem campo "type" — inferimos pelo título como fallback visual
function inferType(title: string): 'info' | 'success' | 'warning' | 'error' {
  const t = title.toLowerCase();
  if (t.includes('aprovad') || t.includes('concluíd') || t.includes('parabéns')) return 'success';
  if (t.includes('expir') || t.includes('atenção') || t.includes('pendente')) return 'warning';
  if (t.includes('rejeitad') || t.includes('erro') || t.includes('bloqueado')) return 'error';
  return 'info';
}

function getIcon(type: ReturnType<typeof inferType>) {
  switch (type) {
    case 'success': return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'warning': return <AlertCircle className="h-5 w-5 text-orange-500" />;
    case 'error':   return <AlertCircle className="h-5 w-5 text-red-500" />;
    default:        return <Info className="h-5 w-5 text-blue-500" />;
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  if (diffHours < 1)  return 'Agora';
  if (diffHours < 24) return `Há ${diffHours}h`;
  if (diffDays === 1) return 'Ontem';
  return `Há ${diffDays} dias`;
}

export function Notifications() {
  const queryClient = useQueryClient();

  // ── Leitura ──────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.notifications.list,
    queryFn:  () => notificationsService.list(),
  });

  const notifications = data?.notifications ?? [];
  const unreadCount   = notifications.filter(n => !n.read).length;

  // ── Marcar uma como lida (otimista) ──────────────────────────────────────
  const { mutate: markAsRead } = useMutation({
    mutationFn: (id: string) => notificationsService.markAsRead(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.list });
      const previous = queryClient.getQueryData(queryKeys.notifications.list);

      queryClient.setQueryData(
        queryKeys.notifications.list,
        (old: { notifications: ApiNotification[] } | undefined) => ({
          notifications: old?.notifications.map(n =>
            n.id === id ? { ...n, read: true } : n
          ) ?? [],
        }),
      );

      return { previous };
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(queryKeys.notifications.list, ctx?.previous);
      toast.error('Erro ao marcar notificação como lida.');
    },
  });

  // ── Marcar todas como lidas ───────────────────────────────────────────────
  const { mutate: markAllRead, isPending: markingAll } = useMutation({
    mutationFn: () =>
      Promise.all(
        notifications.filter(n => !n.read).map(n => notificationsService.markAsRead(n.id))
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      toast.success('Todas as notificações marcadas como lidas.');
    },
    onError: () => toast.error('Erro ao marcar notificações.'),
  });

  // ── Remover ───────────────────────────────────────────────────────────────
  const { mutate: remove } = useMutation({
    mutationFn: (id: string) => notificationsService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      toast.success('Notificação removida.');
    },
    onError: () => toast.error('Erro ao remover notificação.'),
  });

  // ── Estados de carregamento / erro ────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando notificações…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-muted-foreground">Erro ao carregar notificações.</p>
        <Button variant="outline" onClick={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
        }>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Notificações</h2>
          <p className="text-muted-foreground">
            {unreadCount > 0
              ? `Você tem ${unreadCount} notificação${unreadCount > 1 ? 'ões' : ''} não lida${unreadCount > 1 ? 's' : ''}`
              : 'Todas as notificações lidas'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={() => markAllRead()} disabled={markingAll}>
            {markingAll
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Check className="h-4 w-4 mr-2" />}
            Marcar Todas como Lidas
          </Button>
        )}
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {notifications.map((notification) => {
          const type = inferType(notification.title);
          return (
            <Card
              key={notification.id}
              className={`transition-colors cursor-pointer ${
                !notification.read ? 'border-l-4 border-l-[#108865] bg-[#108865]/5' : ''
              }`}
              onClick={() => !notification.read && markAsRead(notification.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="mt-1">{getIcon(type)}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          {notification.title}
                          {!notification.read && (
                            <Badge variant="secondary" className="text-xs">Novo</Badge>
                          )}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {notification.message}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(notification.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(notification.createdAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Empty state */}
      {notifications.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma Notificação</h3>
            <p className="text-sm text-muted-foreground text-center">
              Quando você receber notificações, elas aparecerão aqui.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}