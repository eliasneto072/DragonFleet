// src/app/components/system/requests-admin.tsx
//
// Os clientes que pediram mais do que têm.
//
// ─── PORQUE É QUE FECHAR UM PEDIDO NÃO MUDA O PLANO ─────────────────────────
//
// Porque são duas decisões diferentes. Fechar é dizer que a conversa acabou;
// mudar o plano é passar a cobrar outro valor a alguém. Um botão que fizesse
// as duas coisas faria a segunda sem querer — e o sintoma seria uma fatura
// que o cliente não estava à espera.
//
// Então: fecha-se aqui com uma nota, e muda-se o plano nas Frotas. A tela diz
// isso por escrito, e dá o atalho.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Inbox, Loader2, MessageSquare, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Textarea } from '@/app/components/ui/textarea';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency, formatDate } from '@/shared/lib/format';
import { systemService, type PedidoDePlano } from '@/features/system/services/system.service';

const ESTADO: Record<string, { texto: string; cls: string }> = {
  OPEN: { texto: 'À espera', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  DONE: { texto: 'Resolvido', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  DISMISSED: { texto: 'Não avançou', cls: 'bg-secondary text-muted-foreground' },
};

function FecharDialog({
  pedido, onClose,
}: { pedido: PedidoDePlano | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [nota, setNota] = useState('');

  const m = useMutation({
    mutationFn: (estado: 'DONE' | 'DISMISSED') =>
      systemService.fecharPedido(pedido!.id, estado, nota.trim() || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sistema.all });
      toast.success('Pedido fechado.');
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível fechar.'),
  });

  if (!pedido) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fechar o pedido de {pedido.frota.nome}</DialogTitle>
          <DialogDescription>
            Fechar não muda o plano da frota — isso faz-se nas Frotas, de
            propósito: uma coisa é dar a conversa por terminada, outra é passar
            a cobrar outro valor a alguém.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>O que ficou combinado</Label>
          <Textarea
            rows={3}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Passou para o plano Completo a partir de novembro, com 10% de desconto…"
          />
          <p className="text-xs text-muted-foreground">
            É isto que responde, daqui a um ano, à pergunta "porque é que este
            cliente está neste preço".
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant="outline"
            onClick={() => m.mutate('DISMISSED')}
            disabled={m.isPending}
          >
            <X className="h-4 w-4 mr-2" />
            Não avançou
          </Button>
          <Button onClick={() => m.mutate('DONE')} disabled={m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Check className="h-4 w-4 mr-2" />
            Resolvido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequestsAdmin() {
  const [todos, setTodos] = useState(false);
  const [aFechar, setAFechar] = useState<PedidoDePlano | null>(null);

  const q = useQuery({
    queryKey: queryKeys.sistema.pedidos(todos),
    queryFn: () => systemService.pedidos(todos),
  });

  const pedidos = q.data?.pedidos ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        subtitle="Clientes que pediram um plano diferente do que têm."
        icon={<Inbox className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="todos" className="text-sm text-muted-foreground">
              Ver fechados
            </Label>
            <Switch id="todos" checked={todos} onCheckedChange={setTodos} />
          </div>
        }
      />

      {q.isLoading && <Skeleton className="h-32 w-full" />}

      {!q.isLoading && pedidos.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center space-y-1">
            <p className="font-medium">
              {todos ? 'Nenhum pedido até hoje.' : 'Nenhum pedido à espera.'}
            </p>
            <p className="text-sm text-muted-foreground">
              Os clientes pedem a partir de "O meu plano", no painel deles.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {pedidos.map((p) => {
          const e = ESTADO[p.estado] ?? ESTADO.OPEN;
          return (
            <Card key={p.id}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-semibold">{p.frota.nome}</span>
                      <Badge className={e.cls} variant="secondary">{e.texto}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.pedidoPor ? `${p.pedidoPor} · ` : ''}
                      {formatDate(p.criadoEm)}
                    </p>
                  </div>

                  {p.estado === 'OPEN' && (
                    <Button size="sm" onClick={() => setAFechar(p)}>
                      Fechar
                    </Button>
                  )}
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm">
                    {p.plano
                      ? <>Quer o plano <strong>{p.plano.nome}</strong>{' '}
                        <span className="text-muted-foreground">
                          ({formatCurrency(p.plano.preco)} / {p.plano.duracaoDias} dias)
                        </span></>
                      // Sem plano quer dizer que nenhum dos que estão à venda
                      // servia. A mensagem é o pedido todo.
                      : <span className="font-medium">Pediu um plano à medida</span>}
                  </p>

                  {p.mensagem && (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{p.mensagem}</span>
                    </div>
                  )}
                </div>

                {p.resolucao && (
                  <p className="text-xs text-muted-foreground border-t pt-3">
                    <strong>Fechado{p.fechadoEm ? ` a ${formatDate(p.fechadoEm)}` : ''}:</strong>{' '}
                    {p.resolucao}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {aFechar && (
        <FecharDialog key={aFechar.id} pedido={aFechar} onClose={() => setAFechar(null)} />
      )}
    </div>
  );
}
