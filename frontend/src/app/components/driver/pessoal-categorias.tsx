// src/app/components/driver/pessoal-categorias.tsx
//
// As gavetas das despesas, no separador delas.
//
// ─── PORQUE É QUE SAIU DA PÁGINA DAS DESPESAS ───────────────────────────────
//
// Porque vão ser muitas. Em cima da lista de despesas, uma tira de vinte ou
// trinta etiquetas empurrava para fora do ecrã aquilo a que se vem — as
// despesas — e obrigava a passar por ela sempre, para fazer uma coisa que se
// faz uma vez por mês.
//
// Arrumar gavetas e lançar despesas são trabalhos diferentes, feitos em
// alturas diferentes. Agora têm sítios diferentes.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Trash2, Info } from 'lucide-react';
import { pessoalService } from '@/features/driver/services/pessoal.service';

export function PessoalCategorias() {
  const qc = useQueryClient();
  const [nova, setNova] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const categorias = useQuery({
    queryKey: ['pessoal', 'categorias'],
    queryFn: () => pessoalService.listarCategorias(),
  });

  const criar = useMutation({
    mutationFn: (nome: string) => pessoalService.criarCategoria(nome),
    onSuccess: () => {
      setNova('');
      setErro(null);
      qc.invalidateQueries({ queryKey: ['pessoal'] });
    },
    onError: (e: unknown) => setErro(
      (e as { message?: string })?.message ?? 'Não foi possível criar.',
    ),
  });

  const apagar = useMutation({
    mutationFn: (id: string) => pessoalService.apagarCategoria(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pessoal'] }),
  });

  const lista = categorias.data?.categorias ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          As gavetas por onde arrumas as despesas. Apagar uma{' '}
          <strong className="text-foreground">não apaga as despesas</strong>: ficam
          sem categoria e continuam a contar no total.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nova categoria</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={nova}
              onChange={(e) => { setNova(e.target.value); setErro(null); }}
              placeholder="Combustível, casa, comida, seguros…"
              maxLength={40}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nova.trim()) criar.mutate(nova.trim());
              }}
            />
            <Button
              disabled={!nova.trim() || criar.isPending}
              onClick={() => criar.mutate(nova.trim())}
            >
              Acrescentar
            </Button>
          </div>
          {erro && (
            <p role="alert" className="text-sm text-destructive">{erro}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">
            As tuas categorias
            {lista.length > 0 && (
              <span className="ml-2 font-normal text-muted-foreground">({lista.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {categorias.isLoading && <Skeleton className="h-24 w-full" />}

          {!categorias.isLoading && lista.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ainda não tens categorias.
            </p>
          )}

          {/* Em grelha e não numa tira: com trinta gavetas, uma tira única
              dava dez linhas de etiquetas a correr de lado. */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <span className="truncate text-sm">{c.name}</span>
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => apagar.mutate(c.id)}
                  aria-label={`Apagar ${c.name}`}
                  title="Apagar. As despesas ficam sem categoria e não se perdem."
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
