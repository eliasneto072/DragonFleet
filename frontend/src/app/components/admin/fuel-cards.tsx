// src/app/components/admin/fuel-cards.tsx
//
// Os cartões Prio de um motorista, ou de um carro.
//
// ─── PORQUE O MESMO COMPONENTE SERVE OS DOIS ─────────────────────────────────
//
// O cliente disse que o cartão vai com o motorista, mas não tem a certeza. Se
// afinal ficar no carro, a correção não pode ser um pedido ao programador: tem
// de ser um clique. Por isso cada cartão pertence a um motorista OU a um carro,
// e "Passar para" muda-o de um para o outro.
//
//   no motorista → o combustível vai sempre para ele, esteja em que carro
//                  estiver;
//   no carro     → vai para quem tinha o carro na hora do abastecimento.
//
// ─── SÓ A ADMINISTRAÇÃO ──────────────────────────────────────────────────────
//
// O motorista não vê isto. O número do cartão é o que liga um abastecimento a
// uma pessoa, e quem o pudesse mudar escolhia a quem se descontava o gasóleo.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Badge } from '@/app/components/ui/badge';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  expensesService, formatCardNumber, type FuelCard,
} from '@/features/admin/services/expenses.service';
import { usersService } from '@/features/admin/services/users.service';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { queryKeys } from '@/shared/lib/query-keys';

type Dono = { userId: string; vehicleId?: never } | { vehicleId: string; userId?: never };

export function FuelCards(dono: Dono) {
  const queryClient = useQueryClient();
  const noCarro = !!dono.vehicleId;
  const chave = dono.userId ? `user:${dono.userId}` : `vehicle:${dono.vehicleId}`;

  const [numero, setNumero] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [aMover, setAMover] = useState<string | null>(null);
  // Um cartão em edição, e o que se está a escrever nele.
  const [aEditar, setAEditar] = useState<string | null>(null);
  const [editNumero, setEditNumero] = useState('');
  const [editNota, setEditNota] = useState('');
  // Apagar pede confirmação na própria linha.
  const [aApagar, setAApagar] = useState<string | null>(null);

  const q = useQuery({
    queryKey: queryKeys.expenses.cards(chave),
    queryFn: () => expensesService.listCards(dono),
  });

  // Para onde se pode passar um cartão: se está num motorista, para um carro;
  // se está num carro, para um motorista.
  //
  // As consultas são as MESMAS das outras telas, com a mesma forma de dados, e
  // o mapeamento faz-se depois. Pôr aqui outra forma debaixo da mesma chave
  // estragava a lista de motoristas e a de carros no resto da aplicação.
  const usersQ = useQuery({
    queryKey: queryKeys.users.allUnpaged,
    queryFn: () => usersService.listAll(),
    enabled: aMover !== null && noCarro,
  });
  const vehiclesQ = useQuery({
    queryKey: queryKeys.vehicles.list,
    queryFn: () => vehiclesService.list(),
    enabled: aMover !== null && !noCarro,
  });
  const destinos = useMemo(() => noCarro
    ? (usersQ.data?.users ?? [])
        .filter((u) => u.role === 'DRIVER')
        .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
        .map((u) => ({ id: u.id, label: u.name }))
    : (vehiclesQ.data?.vehicles ?? [])
        .slice()
        .sort((a, b) => a.plate.localeCompare(b.plate))
        .map((v) => ({ id: v.id, label: `${v.plate} · ${v.brand} ${v.model}` })),
  [noCarro, usersQ.data, vehiclesQ.data]);
  const aCarregarDestinos = noCarro ? usersQ.isLoading : vehiclesQ.isLoading;

  const invalidar = () => queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });

  const criar = useMutation({
    mutationFn: () => expensesService.createCard({
      number: numero,
      label: etiqueta.trim() || null,
      ...(noCarro ? { vehicleId: dono.vehicleId } : { userId: dono.userId }),
    }),
    onSuccess: () => {
      invalidar();
      setNumero(''); setEtiqueta('');
      toast.success('Cartão registado. Os próximos envios da Prio já emparelham por ele.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível registar o cartão.'),
  });

  const atualizar = useMutation({
    mutationFn: ({ c, mudanca }: { c: FuelCard; mudanca: Partial<FuelCard> }) =>
      expensesService.updateCard(c.id, {
        number: c.number,
        label: c.label,
        userId: c.userId,
        vehicleId: c.vehicleId,
        active: c.active,
        ...mudanca,
      }),
    onSuccess: (_r, { mudanca }) => {
      invalidar();
      setAMover(null);
      setAEditar(null);
      if ('userId' in mudanca || 'vehicleId' in mudanca) toast.success('Cartão passado.');
      else if ('number' in mudanca || 'label' in mudanca) toast.success('Cartão atualizado.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível alterar o cartão.'),
  });

  const apagar = useMutation({
    mutationFn: (c: FuelCard) => expensesService.deleteCard(c.id),
    onSuccess: () => {
      invalidar();
      setAApagar(null);
      toast.success('Cartão apagado. O combustível já importado com ele fica como estava.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível apagar o cartão.'),
  });

  const comecarEdicao = (c: FuelCard) => {
    setAEditar(c.id); setEditNumero(formatCardNumber(c.number)); setEditNota(c.label ?? '');
    setAMover(null); setAApagar(null);
  };

  const digitos = numero.replace(/\D/g, '');
  const cartoes = q.data?.cards ?? [];

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />Cartões Prio
        </CardTitle>
        <CardDescription>
          {noCarro
            ? 'O combustível destes cartões vai para quem tinha o carro na hora do abastecimento.'
            : 'O combustível destes cartões vai para este motorista, esteja em que carro estiver.'}
          {' '}Só a administração vê isto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : cartoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum cartão. Sem cartão, o combustível emparelha pela matrícula impressa nele.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {cartoes.map((c) => (
              <li key={c.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm tabular-nums">{formatCardNumber(c.number)}</span>
                  {c.label && <span className="text-sm text-muted-foreground">{c.label}</span>}
                  {!c.active && <Badge variant="secondary">Inativo</Badge>}
                  <div className="ml-auto flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => comecarEdicao(c)}>
                      Editar
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => { setAMover(aMover === c.id ? null : c.id); setAEditar(null); setAApagar(null); }}
                    >
                      {noCarro ? 'Passar para motorista' : 'Passar para carro'}
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      disabled={atualizar.isPending}
                      onClick={() => atualizar.mutate({ c, mudanca: { active: !c.active } })}
                    >
                      {c.active ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => { setAApagar(c.id); setAEditar(null); setAMover(null); }}
                    >
                      Apagar
                    </Button>
                  </div>
                </div>

                {aEditar === c.id && (
                  <form
                    className="grid gap-2 rounded-md bg-secondary p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end"
                    onSubmit={(e) => {
                      e.preventDefault();
                      atualizar.mutate({ c, mudanca: { number: editNumero, label: editNota.trim() || null } });
                    }}
                  >
                    <div className="space-y-1">
                      <Label htmlFor={`editar-numero-${c.id}`} className="text-xs">Número</Label>
                      <Input
                        id={`editar-numero-${c.id}`} inputMode="numeric" autoComplete="off"
                        className="font-mono tabular-nums"
                        value={editNumero} onChange={(e) => setEditNumero(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`editar-nota-${c.id}`} className="text-xs">Nota</Label>
                      <Input
                        id={`editar-nota-${c.id}`}
                        value={editNota} onChange={(e) => setEditNota(e.target.value)}
                      />
                    </div>
                    <Button
                      type="submit" size="sm"
                      disabled={editNumero.replace(/\D/g, '').length < 8 || atualizar.isPending}
                    >
                      Guardar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAEditar(null)}>
                      Cancelar
                    </Button>
                  </form>
                )}

                {aApagar === c.id && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
                    <p className="text-xs">
                      Apagar o cartão <strong className="font-mono">{formatCardNumber(c.number)}</strong>?
                      O combustível já importado fica como está; os próximos envios deixam de
                      emparelhar por este número e passam a usar a matrícula.
                    </p>
                    <div className="ml-auto flex gap-1">
                      <Button
                        size="sm" variant="destructive"
                        disabled={apagar.isPending}
                        onClick={() => apagar.mutate(c)}
                      >
                        {apagar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Apagar'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAApagar(null)}>Manter</Button>
                    </div>
                  </div>
                )}

                {aMover === c.id && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md bg-secondary p-2">
                    <Select
                      onValueChange={(destino) => atualizar.mutate({
                        c,
                        mudanca: noCarro
                          ? { userId: destino, vehicleId: null }
                          : { vehicleId: destino, userId: null },
                      })}
                    >
                      <SelectTrigger className="w-full sm:w-72">
                        <SelectValue placeholder={aCarregarDestinos ? 'A carregar…' : (noCarro ? 'Escolher motorista' : 'Escolher carro')} />
                      </SelectTrigger>
                      <SelectContent>
                        {destinos.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Vale para os próximos envios. O que já foi importado não muda.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(e) => { e.preventDefault(); criar.mutate(); }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`cartao-${chave}`}>Número do cartão</Label>
            <Input
              id={`cartao-${chave}`}
              inputMode="numeric"
              autoComplete="off"
              placeholder="7824 0000 0000 0000"
              className="font-mono tabular-nums"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`etiqueta-${chave}`}>Nota (opcional)</Label>
            <Input
              id={`etiqueta-${chave}`}
              placeholder="ex.: cartão suplente"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={digitos.length < 8 || criar.isPending}>
            {criar.isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            Registar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
