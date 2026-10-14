// src/app/components/admin/pedidos-de-extrato.tsx
//
// A fila dos pedidos de esclarecimento: quem perguntou, sobre que linha, de
// que semana — e o sítio onde se responde com o extrato anexado.
//
// ─── PORQUE É QUE OS ABERTOS VÊM PRIMEIRO E O MAIS VELHO NO TOPO ────────────
//
// Porque é a ordem em que se despacha uma fila. Pela data decrescente, o
// pedido que espera há duas semanas ficava no fim do ecrã — e um motorista à
// espera de uma resposta sobre o dinheiro dele não devia ser o último a ser
// visto. A ordem vem do servidor, para o número do menu e a lista concordarem.
//
// ─── PORQUE É QUE NÃO HÁ «REJEITAR» ────────────────────────────────────────
//
// Uma dúvida sobre dinheiro responde-se. Um botão de rejeitar só servia para
// fechar a pergunta sem a responder, e aí a conversa voltava ao WhatsApp —
// que é exactamente o que isto existe para evitar.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Badge } from '@/app/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { FilePicker } from '@/app/components/ui/file-picker';
import { CheckCircle2, Clock, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import {
  pedidosDeExtratoService, type EstadoDoPedido, type PedidoDeExtrato,
} from '@/shared/services/pedidos-de-extrato.service';

const CHAVE = ['pedidos-de-extrato', 'fila'];

function dia(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT');
}

function semana(p: PedidoDeExtrato): string {
  if (!p.fecho) return '';
  return `${dia(p.fecho.semanaInicio)} a ${dia(p.fecho.semanaFim)}`;
}

function Linha({ p, aoResponder }: {
  p: PedidoDeExtrato;
  aoResponder: (p: PedidoDeExtrato) => void;
}) {
  const respondido = p.estado === 'RESPONDIDO';

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{p.motorista?.nome ?? 'Motorista'}</span>
        <span className="text-muted-foreground">·</span>
        <span>{p.etiqueta}</span>
        {respondido ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3" aria-hidden />
            Respondido
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" aria-hidden />
            Aberto
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Semana de {semana(p)} · pedido em {dia(p.criadoEm)}
        </span>
      </div>

      {p.motivo && (
        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
          «{p.motivo}»
        </p>
      )}

      {respondido ? (
        <div className="mt-3 rounded-md bg-secondary p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Respondido
            {p.respondidoPor && <> por {p.respondidoPor}</>}
            {p.respondidoEm && <> em {dia(p.respondidoEm)}</>}
          </p>
          {p.resposta && <p className="mt-1 whitespace-pre-line text-sm">{p.resposta}</p>}
          {p.ficheiro && (
            <a
              href={p.ficheiro}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
            >
              <Paperclip className="h-3.5 w-3.5" aria-hidden />
              Ver o extrato
            </a>
          )}
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => aoResponder(p)}>
          Responder
        </Button>
      )}
    </li>
  );
}

export function PedidosDeExtratoAdmin() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<EstadoDoPedido | 'TODOS'>('ABERTO');
  const [aResponder, setAResponder] = useState<PedidoDeExtrato | null>(null);
  const [texto, setTexto] = useState('');
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [erroDoFicheiro, setErroDoFicheiro] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: [...CHAVE, filtro],
    queryFn: () =>
      pedidosDeExtratoService.listar(filtro === 'TODOS' ? undefined : filtro),
  });

  const responder = useMutation({
    mutationFn: () =>
      pedidosDeExtratoService.responder(aResponder!.id, {
        answer: texto.trim() || null,
        extrato: ficheiro,
      }),
    onSuccess: () => {
      toast.success('Resposta enviada. O motorista foi notificado.');
      setAResponder(null);
      setTexto('');
      setFicheiro(null);
      setErroDoFicheiro('');
      void qc.invalidateQueries({ queryKey: CHAVE });
      // O número do menu vem de `/pending` e não desta lista: sem isto, o
      // contador ficava a dizer «1 pedido» depois de respondido.
      void qc.invalidateQueries({ queryKey: ['pending'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível responder.'),
  });

  const pedidos = data?.pedidos ?? [];
  // Texto OU ficheiro. A mesma regra do servidor (`respostaCompleta`): marcar
  // como respondido sem dizer nada era fechar o pedido sem responder.
  const podeEnviar = texto.trim().length > 0 || ficheiro !== null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Pedidos de extrato</CardTitle>
        <div className="flex gap-1">
          {(['ABERTO', 'RESPONDIDO', 'TODOS'] as const).map((e) => (
            <Button
              key={e}
              variant={filtro === e ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFiltro(e)}
            >
              {e === 'ABERTO' ? 'Abertos' : e === 'RESPONDIDO' ? 'Respondidos' : 'Todos'}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : pedidos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filtro === 'ABERTO'
              ? 'Nenhum pedido à espera de resposta.'
              : 'Nenhum pedido.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {pedidos.map((p) => (
              <Linha key={p.id} p={p} aoResponder={setAResponder} />
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={aResponder !== null}
        onOpenChange={(o) => { if (!o) setAResponder(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Responder a {aResponder?.motorista?.nome}</DialogTitle>
            <DialogDescription>
              {aResponder?.etiqueta}
              {aResponder && <> · semana de {semana(aResponder)}</>}
            </DialogDescription>
          </DialogHeader>

          {aResponder?.motivo && (
            <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
              «{aResponder.motivo}»
            </p>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="resposta-ao-pedido">Resposta</Label>
              <Textarea
                id="resposta-ao-pedido"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="Por exemplo: são duas passagens na A5 a 2,20 € cada, nos dias 7 e 9."
              />
            </div>

            {/* O anexo é opcional de propósito: há dúvidas que se esclarecem
                com uma frase, e exigir um ficheiro obrigava a inventar um. */}
            <FilePicker
              id="extrato-do-pedido"
              label="Extrato (opcional)"
              hint="JPEG, PNG, WebP ou PDF, até 10 MB."
              file={ficheiro}
              onChange={setFicheiro}
              error={erroDoFicheiro}
              onError={setErroDoFicheiro}
              disabled={responder.isPending}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAResponder(null)}>Cancelar</Button>
            <Button
              onClick={() => responder.mutate()}
              disabled={!podeEnviar || responder.isPending}
            >
              {responder.isPending ? 'A enviar…' : 'Responder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
