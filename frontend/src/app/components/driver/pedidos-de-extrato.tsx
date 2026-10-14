// src/app/components/driver/pedidos-de-extrato.tsx
//
// O bloco que o motorista vê no detalhe da semana: pedir o extrato detalhado
// de uma linha do fecho, e ler a resposta quando ela chegar.
//
// ─── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
//
// «as vezes a motoristas que acham estranho os valores». Hoje essa conversa
// acontece no WhatsApp e desaparece lá. Aqui fica agarrada à semana: o pedido,
// a resposta, e o extrato.
//
// ─── PORQUE É QUE O BOTÃO NÃO É UM BOTÃO SÓ ─────────────────────────────────
//
// Porque «pedir o extrato» sem dizer de quê obriga quem responde a adivinhar
// qual das linhas é que levantou a dúvida. A linha vem do próprio fecho: só
// aparecem as que têm valor naquela semana, e é o servidor que as escolhe.
//
// ─── PORQUE É QUE A RESPOSTA FICA AQUI E NÃO NUMA NOTIFICAÇÃO SÓ ────────────
//
// A notificação avisa; esta lista é onde o extrato mora. Uma notificação
// perde-se entre as outras, e o motorista que a apagou ficava sem forma de
// voltar ao ficheiro.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Badge } from '@/app/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { CheckCircle2, Clock, FileSearch, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  pedidosDeExtratoService, type LinhaDoFecho, type PedidoDeExtrato,
} from '@/shared/services/pedidos-de-extrato.service';
import { formatCurrency } from '@/shared/lib/format';

function quando(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function Pedido({ p, aoRetirar, aRetirar }: {
  p: PedidoDeExtrato;
  aoRetirar: (id: string) => void;
  aRetirar: boolean;
}) {
  const respondido = p.estado === 'RESPONDIDO';

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{p.etiqueta}</span>
        {respondido ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3" aria-hidden />
            Respondido
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" aria-hidden />
            À espera de resposta
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Pedido em {quando(p.criadoEm)}
        </span>
      </div>

      {p.motivo && (
        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
          «{p.motivo}»
        </p>
      )}

      {respondido && (
        <div className="mt-3 rounded-md bg-secondary p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Resposta do escritório
            {p.respondidoPor && <> · {p.respondidoPor}</>}
            {p.respondidoEm && <> · {quando(p.respondidoEm)}</>}
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
      )}

      {/* Retirar só enquanto não há resposta: depois, a resposta e o extrato
          ficam — é esse o valor disto. */}
      {!respondido && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-7 px-2 text-xs text-muted-foreground"
          onClick={() => aoRetirar(p.id)}
          disabled={aRetirar}
        >
          <X className="mr-1 h-3 w-3" aria-hidden />
          Retirar o pedido
        </Button>
      )}
    </li>
  );
}

export function PedidosDeExtrato({ settlementId }: { settlementId: string }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [linha, setLinha] = useState<LinhaDoFecho | ''>('');
  const [motivo, setMotivo] = useState('');

  const chave = ['pedidos-de-extrato', settlementId];

  const { data, isLoading } = useQuery({
    queryKey: chave,
    queryFn: () => pedidosDeExtratoService.doFecho(settlementId),
  });

  const criar = useMutation({
    mutationFn: () =>
      pedidosDeExtratoService.criar(settlementId, {
        line: linha as LinhaDoFecho,
        reason: motivo.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Pedido enviado. O escritório vai responder aqui mesmo.');
      setAberto(false);
      setLinha('');
      setMotivo('');
      void qc.invalidateQueries({ queryKey: chave });
    },
    // A mensagem vem do servidor já escrita para se ler — por exemplo quando
    // já há um pedido aberto naquela linha. Reescrevê-la aqui dava duas
    // versões da mesma frase.
    onError: (e: Error) => toast.error(e.message || 'Não foi possível enviar o pedido.'),
  });

  const retirar = useMutation({
    mutationFn: (id: string) => pedidosDeExtratoService.retirar(id),
    onSuccess: () => {
      toast.success('Pedido retirado.');
      void qc.invalidateQueries({ queryKey: chave });
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível retirar o pedido.'),
  });

  if (isLoading) {
    return (
      <div className="border-t border-border pt-3">
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const pedidos = data?.pedidos ?? [];
  const linhas = data?.linhas ?? [];
  const disponiveis = linhas.filter((l) => l.disponivel);

  // Nada a mostrar nem nada a pedir: é o caso da gestão a ver o fecho de
  // alguém que nunca perguntou nada. Um bloco vazio só ocupava espaço.
  if (!data?.podePedir && pedidos.length === 0) return null;

  // A primeira razão para não dar: é sempre a mesma frase para todas as
  // linhas (o travão aos pedidos a mais), por isso basta mostrá-la uma vez.
  const porqueNao = linhas.find((l) => !l.disponivel && !l.pedidoAberto)?.motivo ?? null;

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Dúvidas sobre esta semana
        </p>
        {data?.podePedir && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAberto(true)}
            disabled={disponiveis.length === 0}
          >
            <FileSearch className="mr-1.5 h-4 w-4" aria-hidden />
            Pedir extrato detalhado
          </Button>
        )}
      </div>

      {data?.podePedir && disponiveis.length === 0 && porqueNao && (
        <p className="text-xs text-muted-foreground">{porqueNao}</p>
      )}

      {pedidos.length > 0 ? (
        <ul className="space-y-2">
          {pedidos.map((p) => (
            <Pedido
              key={p.id}
              p={p}
              aoRetirar={(id) => retirar.mutate(id)}
              aRetirar={retirar.isPending}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Se algum valor lhe parecer estranho, peça o extrato detalhado dessa
          linha. A resposta aparece aqui.
        </p>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir extrato detalhado</DialogTitle>
            <DialogDescription>
              Escolha a linha que lhe parece estranha. O escritório responde
              aqui, com o extrato anexado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="linha-do-fecho">Linha do fecho</Label>
              <Select value={linha} onValueChange={(v) => setLinha(v as LinhaDoFecho)}>
                <SelectTrigger id="linha-do-fecho">
                  <SelectValue placeholder="Escolha a linha" />
                </SelectTrigger>
                <SelectContent>
                  {disponiveis.map((l) => (
                    <SelectItem key={l.linha} value={l.linha}>
                      {l.etiqueta}
                      {/* O valor ao lado do nome: é o número que ele está a
                          olhar, e vê-lo aqui confirma que escolheu a linha
                          certa. A OUTRA não tem valor próprio. */}
                      {l.linha !== 'OUTRA' && <> — {formatCurrency(l.valor)}</>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="motivo-do-pedido">
                O que lhe parece estranho <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Textarea
                id="motivo-do-pedido"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Por exemplo: nesta semana só passei a ponte duas vezes."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button
              onClick={() => criar.mutate()}
              disabled={!linha || criar.isPending}
            >
              {criar.isPending ? 'A enviar…' : 'Enviar pedido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
