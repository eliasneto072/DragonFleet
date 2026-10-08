// src/app/components/admin/reminders-card.tsx
//
// Lembretes no painel, que insistem até alguém os dar por feitos.
//
// ─── PORQUE É QUE ESTE CARTÃO DESAPARECE QUANDO ESTÁ VAZIO ─────────────────
//
// Não desaparece — encolhe para uma linha com o botão de adicionar. Um painel
// com um cartão "Sem lembretes" permanente ensina a ignorar aquele canto do
// ecrã, e no dia em que lá estiver alguma coisa já ninguém olha.
//
// ─── E PORQUE É QUE DÁ PARA REABRIR ────────────────────────────────────────
//
// Porque o engano mais provável aqui é carregar em concluído na linha errada.
// Sem forma de desfazer, o lembrete desaparecia e a pessoa ficava sem saber o
// que lá estava escrito.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import { toast } from 'sonner';
import { Bell, Check, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { remindersService, type Reminder } from '@/features/admin/services/reminders.service';

const CHAVE = ['reminders'] as const;

const hojeISO = () => new Date().toISOString().slice(0, 10);

/** Há quantos dias está à espera. Negativo = ainda não chegou o dia. */
function diasDeAtraso(dueOn: string): number {
  const hoje = Date.parse(`${hojeISO()}T00:00:00.000Z`);
  const dia = Date.parse(`${dueOn.slice(0, 10)}T00:00:00.000Z`);
  return Math.floor((hoje - dia) / 86_400_000);
}

export function RemindersCard() {
  const queryClient = useQueryClient();
  const [aAdicionar, setAAdicionar] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [quando, setQuando] = useState(hojeISO());
  const [verConcluidos, setVerConcluidos] = useState(false);

  const q = useQuery({
    queryKey: [...CHAVE, verConcluidos],
    queryFn: () => remindersService.list(verConcluidos),
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: CHAVE });

  const { mutate: criar, isPending: aCriar } = useMutation({
    mutationFn: () => remindersService.create({ title: titulo.trim(), dueOn: quando }),
    onSuccess: () => {
      invalidar();
      setTitulo('');
      setQuando(hojeISO());
      setAAdicionar(false);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível criar o lembrete.'),
  });

  const { mutate: marcar } = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => remindersService.setDone(id, done),
    onSuccess: (_r, v) => {
      invalidar();
      if (v.done) toast.success('Lembrete concluído. Deixa de avisar.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível alterar.'),
  });

  const { mutate: remover } = useMutation({
    mutationFn: (id: string) => remindersService.remove(id),
    onSuccess: () => invalidar(),
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível apagar.'),
  });

  const lembretes = q.data?.reminders ?? [];
  const porFazer = lembretes.filter((r) => !r.doneAt);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Lembretes
          {porFazer.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
              {porFazer.length}
            </span>
          )}
        </CardTitle>
        {!aAdicionar && (
          <Button size="sm" variant="outline" className="h-8" onClick={() => setAAdicionar(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Novo
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {aAdicionar && (
          <div className="flex flex-wrap gap-2">
            <Input
              autoFocus value={titulo} maxLength={200} className="min-w-[180px] flex-1"
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="De que é que te queres lembrar?"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && titulo.trim()) { e.preventDefault(); criar(); }
                if (e.key === 'Escape') setAAdicionar(false);
              }}
            />
            <Input
              type="date" value={quando} className="w-40"
              onChange={(e) => setQuando(e.target.value)} aria-label="A partir de que dia avisa"
            />
            <Button onClick={() => criar()} disabled={!titulo.trim() || aCriar}>Guardar</Button>
            <Button variant="ghost" size="icon" onClick={() => setAAdicionar(false)} aria-label="Cancelar">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}

        {q.isLoading && <Skeleton className="h-16 w-full" />}

        {!q.isLoading && lembretes.length === 0 && !aAdicionar && (
          <p className="text-sm text-muted-foreground">
            Nada por fazer. Um lembrete avisa todos os dias até o dares por feito.
          </p>
        )}

        <ul className="space-y-1.5">
          {lembretes.map((r) => <Linha key={r.id} r={r} onMarcar={marcar} onRemover={remover} />)}
        </ul>

        {(lembretes.some((r) => r.doneAt) || verConcluidos) && (
          <Button
            variant="ghost" size="sm" className="h-7 px-2 text-xs"
            onClick={() => setVerConcluidos((v) => !v)}
          >
            {verConcluidos ? 'Esconder concluídos' : 'Ver concluídos'}
          </Button>
        )}
        {!verConcluidos && lembretes.length > 0 && !lembretes.some((r) => r.doneAt) && (
          <Button
            variant="ghost" size="sm" className="h-7 px-2 text-xs"
            onClick={() => setVerConcluidos(true)}
          >
            Ver concluídos
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Linha({ r, onMarcar, onRemover }: {
  r: Reminder;
  onMarcar: (v: { id: string; done: boolean }) => void;
  onRemover: (id: string) => void;
}) {
  const feito = !!r.doneAt;
  const atraso = feito ? 0 : diasDeAtraso(r.dueOn);

  return (
    <li className="flex items-start gap-2 rounded-lg border border-border px-3 py-2">
      <Button
        size="sm" variant={feito ? 'ghost' : 'outline'}
        className="mt-0.5 h-7 w-7 shrink-0 p-0"
        onClick={() => onMarcar({ id: r.id, done: !feito })}
        aria-label={feito ? 'Reabrir lembrete' : 'Concluir lembrete'}
        title={feito ? 'Reabrir' : 'Concluir'}
      >
        {feito
          ? <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      </Button>

      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${feito ? 'text-muted-foreground line-through' : 'font-medium'}`}>
          {r.title}
        </span>
        {r.notes && <span className="block text-xs text-muted-foreground">{r.notes}</span>}
        {/* O atraso à vista: "há 9 dias" é muito mais difícil de ignorar do
            que o mesmo texto repetido pela nona vez. */}
        {!feito && atraso > 0 && (
          <span className="block text-xs text-amber-600 dark:text-amber-400">
            há {atraso} dia{atraso === 1 ? '' : 's'}
          </span>
        )}
        {!feito && atraso < 0 && (
          <span className="block text-xs text-muted-foreground">
            começa a avisar daqui a {-atraso} dia{atraso === -1 ? '' : 's'}
          </span>
        )}
      </span>

      <Button
        size="sm" variant="ghost"
        className="h-7 w-7 shrink-0 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => onRemover(r.id)}
        aria-label="Apagar lembrete"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </li>
  );
}
