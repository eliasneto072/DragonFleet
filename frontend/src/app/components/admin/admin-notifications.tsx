import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Send, Users, Bell } from 'lucide-react';
import { useState } from 'react';

export function AdminNotifications() {
  const [notificationData, setNotificationData] = useState({
    title: '',
    message: '',
    type: 'info',
    recipients: 'all',
  });

  const handleSend = () => {
    alert('Notificação enviada com sucesso!');
    setNotificationData({
      title: '',
      message: '',
      type: 'info',
      recipients: 'all',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Notificações</h2>
        <p className="text-muted-foreground">Enviar mensagens e alertas aos motoristas</p>
      </div>

      {/* Send Notification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Nova Notificação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="recipients">Destinatários</Label>
              <Select
                value={notificationData.recipients}
                onValueChange={(value) =>
                  setNotificationData({ ...notificationData, recipients: value })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Motoristas</SelectItem>
                  <SelectItem value="active">Apenas Ativos</SelectItem>
                  <SelectItem value="inactive">Apenas Inativos</SelectItem>
                  <SelectItem value="pending">Documentos Pendentes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="type">Tipo de Notificação</Label>
              <Select
                value={notificationData.type}
                onValueChange={(value) =>
                  setNotificationData({ ...notificationData, type: value })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Informação</SelectItem>
                  <SelectItem value="success">Sucesso</SelectItem>
                  <SelectItem value="warning">Aviso</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              placeholder="Título da notificação"
              value={notificationData.title}
              onChange={(e) =>
                setNotificationData({ ...notificationData, title: e.target.value })
              }
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="message">Mensagem</Label>
            <Textarea
              id="message"
              placeholder="Escreva a mensagem da notificação"
              value={notificationData.message}
              onChange={(e) =>
                setNotificationData({ ...notificationData, message: e.target.value })
              }
              className="mt-1 min-h-[150px]"
            />
          </div>

          <Button onClick={handleSend} className="w-full md:w-auto">
            <Send className="h-4 w-4 mr-2" />
            Enviar Notificação
          </Button>
        </CardContent>
      </Card>

      {/* Recent Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notificações Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              {
                title: 'Atualização do Sistema',
                message: 'Nova versão disponível com melhorias de performance',
                date: '2026-01-15',
                recipients: 'Todos',
              },
              {
                title: 'Documentos Expirando',
                message: 'Lembre-se de renovar seus documentos',
                date: '2026-01-14',
                recipients: '23 Motoristas',
              },
              {
                title: 'Novo Bónus Disponível',
                message: 'Complete 20 viagens e ganhe €50',
                date: '2026-01-13',
                recipients: 'Motoristas Ativos',
              },
            ].map((notification, index) => (
              <div key={index} className="p-4 border rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold">{notification.title}</h4>
                  <span className="text-xs text-muted-foreground">{notification.date}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{notification.message}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  Enviado para: {notification.recipients}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
