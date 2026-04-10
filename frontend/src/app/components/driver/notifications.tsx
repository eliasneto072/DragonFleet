import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Bell, Check, AlertCircle, Info, CheckCircle, Trash2 } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'Retirada Aprovada',
    message: 'A sua retirada de €500,00 foi aprovada e será processada em 24h.',
    type: 'success',
    read: false,
    createdAt: '2026-01-15T10:30:00',
  },
  {
    id: '2',
    title: 'Documento Expirando',
    message: 'O seu Certificado TVDE expira em 30 dias. Por favor, renove.',
    type: 'warning',
    read: false,
    createdAt: '2026-01-14T15:20:00',
  },
  {
    id: '3',
    title: 'Novo Bónus Disponível',
    message: 'Complete 20 viagens esta semana e ganhe €50 extra!',
    type: 'info',
    read: true,
    createdAt: '2026-01-13T09:00:00',
  },
  {
    id: '4',
    title: 'Meta Atingida',
    message: 'Parabéns! Você completou 100 viagens este mês.',
    type: 'success',
    read: true,
    createdAt: '2026-01-12T18:45:00',
  },
];

export function Notifications() {
  const unreadCount = mockNotifications.filter(n => !n.read).length;

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Agora';
    if (diffHours < 24) return `Há ${diffHours}h`;
    if (diffDays === 1) return 'Ontem';
    return `Há ${diffDays} dias`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Notificações</h2>
          <p className="text-muted-foreground">
            {unreadCount > 0 ? `Você tem ${unreadCount} notificações não lidas` : 'Todas as notificações lidas'}
          </p>
        </div>
        <Button variant="outline">
          <Check className="h-4 w-4 mr-2" />
          Marcar Todas como Lidas
        </Button>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {mockNotifications.map((notification) => (
          <Card
            key={notification.id}
            className={`transition-colors ${
              !notification.read ? 'border-l-4 border-l-[#108865] bg-[#108865]/5' : ''
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="mt-1">{getIcon(notification.type)}</div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        {notification.title}
                        {!notification.read && (
                          <Badge variant="secondary" className="text-xs">
                            Novo
                          </Badge>
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {notification.message}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
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
        ))}
      </div>

      {/* Empty State */}
      {mockNotifications.length === 0 && (
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
