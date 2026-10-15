// src/app/components/admin/scheduled-payments.tsx
//
// Pagamentos que entram ou saem do saldo de um motorista, sozinhos, numa data.
//
// ─── O QUE ESTA TELA ESTÁ A CRIAR ───────────────────────────────────────────
//
// Não um movimento: a REGRA que fabrica movimentos. É uma distinção que o ecrã
// tem de deixar clara, senão alguém grava um agendamento mensal a pensar que
// lançou um desconto hoje — e descobre no mês seguinte, quando saem dois.
//
// Daí o resumo em linguagem corrente por baixo do formulário ("Vai descontar
// 50,00 € ao João todos os meses, a partir de 1 de novembro, 6 vezes"): é a
// única parte deste ecrã que diz o que vai mesmo acontecer.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  CalendarClock, Plus, Power, Trash2, Loader2, ArrowDownRight, ArrowUpRight, X, Pencil, PieChart,
} from 'lucide-react';
import {
  scheduledPaymentsService, FREQUENCIAS,
  type ScheduledPayment, type PaymentFrequency, type AdjustmentType,
} from '@/features/admin/services/scheduled-payments.service';
import { usersService } from '@/features/admin/services/users.service';
import { formatCurrency } from '@/shared/lib/format';

const CHAVE = ['scheduled-payments'] as const;

const hojeISO = () => new Date().toISOString().slice(0, 10);

/** "1 de novembro de 2026" */
function dataPorExtenso(iso: string): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('pt-PT', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** "17/08/2026" */
function dataCurta(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

const rotuloFrequencia = (f: PaymentFrequency) =>
  FREQUENCIAS.find((x) => x.valor === f)?.rotulo ?? f;

export function ScheduledPayments() {
  const queryClient = useQueryClient();
  const [aCriar, setACriar] = useState(false);
  const [aEditar, setAEditar] = useState<ScheduledPayment | null>(null);
  const [apagar, setApagar] = useState<ScheduledPayment | null>(null);

  const q = useQuery({
    queryKey: CHAVE,
    queryFn: () => scheduledPaymentsService.list(),
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: CHAVE });

  const { mutate: alternar, isPending: aAlternar } = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      scheduledPaymentsService.setActive(id, active),
    onSuccess: (_r, v) => {
      invalidar();
      toast.success(v.active ? 'Agendamento ligado.' : 'Agendamento desligado.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível alterar.'),
  });

  const { mutate: remover, isPending: aRemover } = useMutation({
    mutationFn: (id: string) => scheduledPaymentsService.remove(id),
    onSuccess: () => {
      invalidar();
      setApagar(null);
      toast.success('Agendamento apagado. Os movimentos que já fez ficaram.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível apagar.'),
  });

  const agendamentos = q.data?.payments ?? [];
  const ativos = agendamentos.filter((p) => p.active);
  const parados = agendamentos.filter((p) => !p.active);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {ativos.length === 0
            ? 'Nenhum pagamento agendado activo.'
            : `${ativos.length} agendamento(s) activo(s).`}
        </p>
        <Button onClick={() => setACriar(true)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Novo agendamento
        </Button>
      </div>

      {aCriar && (
        <Formulario
          onPronto={() => { setACriar(false); invalidar(); }}
          onCancelar={() => setACriar(false)}
        />
      )}

      {/* `key` no id: sem ela, passar de um agendamento para outro reaproveita
          o componente e os campos ficam com os valores do anterior. */}
      {aEditar && (
        <Formulario
          key={aEditar.id}
          editar={aEditar}
          onPronto={() => { setAEditar(null); invalidar(); }}
          onCancelar={() => setAEditar(null)}
        />
      )}

      {q.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}

      {!q.isLoading && agendamentos.length === 0 && !aCriar && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarClock className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">Ainda não há nada agendado</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Um seguro mensal, uma quota, uma multa em prestações. Cria-se uma vez e passa a
              sair sozinho na data certa.
            </p>
          </CardContent>
        </Card>
      )}

      {agendamentos.length > 0 && <ResumoPorCategoria />}

      {ativos.length > 0 && <Lista titulo="Activos" linhas={ativos} onAlternar={alternar} onApagar={setApagar} onEditar={setAEditar} ocupado={aAlternar} />}
      {parados.length > 0 && <Lista titulo="Parados" linhas={parados} onAlternar={alternar} onApagar={setApagar} onEditar={setAEditar} ocupado={aAlternar} />}

      <AlertDialog open={!!apagar} onOpenChange={(o) => { if (!o) setApagar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar este agendamento?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {apagar?.description} — {formatCurrency(apagar?.amount ?? 0)} em{' '}
                  <strong>{apagar?.userName}</strong>.
                </p>
                {/* Dito por palavras porque é a dúvida de quem vai carregar:
                    apagar a regra não desfaz o que ela já lançou. */}
                <p className="text-muted-foreground">
                  Deixa de lançar a partir de agora. Os {apagar?.runCount ?? 0} movimentos que já
                  fez ficam no extrato do motorista — o saldo dele depende deles.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aRemover}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (apagar) remover(apagar.id); }}
              disabled={aRemover}
            >
              {aRemover && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * O total por categoria.
 *
 * ─── PORQUE SÃO DUAS COLUNAS E NÃO UMA ──────────────────────────────────────
 *
 * «Já saiu» é o passado: a soma dos lançamentos reais, cada um com o valor que
 * tinha no dia em que saiu. Um seguro que foi 15 € em Janeiro conta 15 € em
 * Janeiro, mesmo depois de alguém corrigir o agendamento para 25 €.
 *
 * «Por mês» é o futuro: o que está comprometido daqui para a frente, com as
 * frequências todas postas na mesma unidade. Um semanal de 10 € conta 43,48 e
 * não 40 — o mês tem 4,348 semanas, e a diferença são quase 42 € ao ano.
 *
 * As duas respondem às duas perguntas que se fazem a esta tela, e nenhuma
 * delas responde à outra.
 */
function ResumoPorCategoria() {
  const q = useQuery({
    queryKey: ['scheduled-payments', 'resumo'],
    queryFn: () => scheduledPaymentsService.resumo(),
  });

  if (q.isLoading) return <Skeleton className="h-36 w-full rounded-xl" />;

  const r = q.data;
  if (!r || r.categorias.length === 0) return null;

  // O maior gasto manda na largura das barras. Sem um máximo, uma categoria
  // sozinha ocupava a barra toda e parecia o total de tudo.
  const maior = Math.max(...r.categorias.map((c) => c.gastoDebito), 0.01);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
          <PieChart className="h-4 w-4" aria-hidden="true" />
          Por categoria
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2.5">
          {r.categorias.map((c) => (
            <li key={c.categoriaId ?? 'sem'} className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="truncate text-sm font-medium">{c.categoria}</span>
                <span className="flex items-baseline gap-3 text-sm tabular-nums">
                  <span className="font-semibold text-destructive">
                    {formatCurrency(c.gastoDebito)}
                  </span>
                  {c.porMesDebito > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(c.porMesDebito)}/mês
                    </span>
                  )}
                </span>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-destructive/70"
                  style={{ width: `${Math.min(100, (c.gastoDebito / maior) * 100)}%` }}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                {c.lancamentos} lançamento{c.lancamentos === 1 ? '' : 's'}
                {c.agendamentosActivos > 0 && <> · {c.agendamentosActivos} activo{c.agendamentosActivos === 1 ? '' : 's'}</>}
                {c.gastoCredito > 0 && <> · {formatCurrency(c.gastoCredito)} creditados</>}
              </p>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-t pt-3 text-sm">
          <span className="font-medium">Total descontado</span>
          <span className="flex items-baseline gap-3 tabular-nums">
            <span className="font-semibold text-destructive">
              {formatCurrency(r.total.gastoDebito)}
            </span>
            {r.total.porMesDebito > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatCurrency(r.total.porMesDebito)}/mês comprometidos
              </span>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Lista({ titulo, linhas, onAlternar, onApagar, onEditar, ocupado }: {
  titulo: string;
  linhas: ScheduledPayment[];
  onAlternar: (v: { id: string; active: boolean }) => void;
  onApagar: (p: ScheduledPayment) => void;
  onEditar: (p: ScheduledPayment) => void;
  ocupado: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {linhas.map((p) => {
            const saida = p.type === 'DEBIT';
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    saida ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600'
                  }`}
                >
                  {saida
                    ? <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
                    : <ArrowUpRight className="h-4 w-4" aria-hidden="true" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {p.userName} — {p.description}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {rotuloFrequencia(p.frequency)}
                    {p.categoryLabel && <> · {p.categoryLabel}</>}
                    {p.active && p.nextRunOn
                      ? <> · próximo a <strong>{dataCurta(p.nextRunOn)}</strong></>
                      : <> · sem próxima data</>}
                    {p.remaining !== null && <> · faltam {p.remaining}</>}
                    {p.runCount > 0 && <> · já fez {p.runCount}</>}
                  </span>
                </span>

                <span className={`shrink-0 text-sm font-semibold tabular-nums ${saida ? 'text-destructive' : 'text-emerald-600'}`}>
                  {saida ? '−' : '+'}{formatCurrency(p.amount)}
                </span>

                <span className="flex shrink-0 items-center gap-1.5">
                  {/* Corrigir em vez de apagar e refazer: o engano mais comum
                      é o valor, e refazer perdia o histórico de lançamentos. */}
                  <Button
                    size="sm" variant="outline" className="h-8"
                    onClick={() => onEditar(p)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Editar
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-8"
                    disabled={ocupado}
                    onClick={() => onAlternar({ id: p.id, active: !p.active })}
                  >
                    <Power className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {p.active ? 'Parar' : 'Ligar'}
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onApagar(p)}
                    aria-label="Apagar agendamento"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type Limite = 'sempre' | 'vezes' | 'data';

/**
 * O mesmo formulário cria e edita.
 *
 * Dois formulários quase iguais divergem ao primeiro campo novo: acrescenta-se
 * ao de criar, esquece-se no de editar, e passa a haver uma coisa que só se
 * consegue pôr de uma maneira. Um só não tem esse problema.
 */
function Formulario({ onPronto, onCancelar, editar }: {
  onPronto: () => void;
  onCancelar: () => void;
  /** Presente = está a corrigir este. Ausente = está a criar. */
  editar?: ScheduledPayment | null;
}) {
  const queryClient = useQueryClient();
  const aEditar = !!editar;

  // Já lançou alguma vez? Então a data de início é história, e o servidor
  // recusa mudá-la. O ecrã desactiva-a para o engano não chegar lá.
  const jaCorreu = (editar?.runCount ?? 0) > 0;

  const [userId, setUserId] = useState(editar?.userId ?? '');
  const [tipo, setTipo] = useState<AdjustmentType>(editar?.type ?? 'DEBIT');
  const [valor, setValor] = useState(editar ? String(editar.amount) : '');
  const [descricao, setDescricao] = useState(editar?.description ?? '');
  const [categoriaId, setCategoriaId] = useState<string>(editar?.categoryId ?? '');
  const [frequencia, setFrequencia] = useState<PaymentFrequency>(editar?.frequency ?? 'MENSAL');
  const [inicio, setInicio] = useState(editar ? editar.startsOn.slice(0, 10) : hojeISO());
  const [limite, setLimite] = useState<Limite>(
    editar?.remaining != null ? 'vezes' : editar?.endsOn ? 'data' : 'sempre',
  );
  const [vezes, setVezes] = useState(editar?.remaining != null ? String(editar.remaining) : '6');
  const [fim, setFim] = useState(editar?.endsOn ? editar.endsOn.slice(0, 10) : '');
  const [novaCategoria, setNovaCategoria] = useState('');
  const [aAdicionarTipo, setAAdicionarTipo] = useState(false);

  const motoristasQ = useQuery({
    queryKey: ['users', 'todos-para-agendamento'],
    queryFn: () => usersService.listAll(),
  });
  const motoristas = useMemo(
    () => (motoristasQ.data?.users ?? [])
      .filter((u: any) => u.role === 'DRIVER')
      .sort((a: any, b: any) => a.name.localeCompare(b.name, 'pt')),
    [motoristasQ.data],
  );

  const categoriasQ = useQuery({
    queryKey: ['scheduled-payments', 'categories'],
    queryFn: () => scheduledPaymentsService.listCategories(),
  });
  const categorias = categoriasQ.data?.categories ?? [];

  const { mutate: adicionarTipo, isPending: aGravarTipo } = useMutation({
    mutationFn: (label: string) => scheduledPaymentsService.createCategory(label),
    onSuccess: ({ category }) => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-payments', 'categories'] });
      setCategoriaId(category.id);
      setNovaCategoria('');
      setAAdicionarTipo(false);
      toast.success(`"${category.label}" adicionado à lista.`);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível adicionar.'),
  });

  const { mutate: gravar, isPending } = useMutation({
    mutationFn: () => {
      const campos = {
        type: tipo,
        amount: Number(valor),
        description: descricao.trim(),
        categoryId: categoriaId || null,
        frequency: frequencia,
        // Um pagamento único não tem fim nem contagem — seria dizer duas vezes
        // a mesma coisa, e o servidor desligava-o à mesma depois do primeiro.
        endsOn: frequencia !== 'UNICO' && limite === 'data' && fim ? fim : null,
        remaining: frequencia !== 'UNICO' && limite === 'vezes' ? Number(vezes) : null,
      };
      if (editar) {
        // A data de início só vai quando ainda se pode mudar. Mandá-la igual
        // ao que já lá está daria no mesmo, mas mandá-la depois de ter corrido
        // trazia um 409 do servidor por uma coisa que o utilizador não tocou.
        return scheduledPaymentsService.update(editar.id, {
          ...campos,
          ...(jaCorreu ? {} : { startsOn: inicio }),
        });
      }
      return scheduledPaymentsService.create({ ...campos, userId, startsOn: inicio });
    },
    onSuccess: () => {
      toast.success(aEditar ? 'Agendamento corrigido.' : 'Agendamento criado.');
      onPronto();
    },
    onError: (e: any) => toast.error(
      e?.message ?? (aEditar ? 'Não foi possível corrigir.' : 'Não foi possível criar.'),
    ),
  });

  const motorista = motoristas.find((m: any) => m.id === userId);
  const valorNum = Number(valor) || 0;
  const completo = !!userId && valorNum > 0 && descricao.trim().length > 0 && !!inicio;

  // ── O resumo em português ───────────────────────────────────────────────
  //
  // É a única parte do ecrã que diz o que vai MESMO acontecer. O resto são
  // campos, e campos lêem-se um a um — ninguém os soma de cabeça antes de
  // carregar em gravar.
  const resumo = useMemo(() => {
    if (!completo) return null;
    const verbo = tipo === 'DEBIT' ? 'descontar' : 'creditar';
    const quando = frequencia === 'UNICO'
      ? `uma única vez, a ${dataPorExtenso(inicio)}`
      : `${rotuloFrequencia(frequencia).toLowerCase()}, a partir de ${dataPorExtenso(inicio)}`;
    const ate = frequencia === 'UNICO' ? ''
      : limite === 'vezes' ? `, ${vezes} vezes`
      : limite === 'data' && fim ? `, até ${dataPorExtenso(fim)}`
      : ', até ser parado';
    return `Vai ${verbo} ${formatCurrency(valorNum)} ${motorista ? `a ${motorista.name}` : ''} ${quando}${ate}.`;
  }, [completo, tipo, valorNum, motorista, frequencia, inicio, limite, vezes, fim]);

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">
          {aEditar ? 'Corrigir agendamento' : 'Novo agendamento'}
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onCancelar} aria-label="Fechar">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ag-motorista">Motorista</Label>
            {/* A editar, o motorista fica preso: mudar de motorista é mudar
                de quem é o dinheiro, e isso não é uma correcção — é outro
                agendamento. O servidor nem aceita o campo. */}
            <Select value={userId} onValueChange={setUserId} disabled={aEditar}>
              <SelectTrigger id="ag-motorista"><SelectValue placeholder="Escolha o motorista" /></SelectTrigger>
              <SelectContent>
                {motoristas.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-tipo">Sentido</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as AdjustmentType)}>
              <SelectTrigger id="ag-tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DEBIT">Desconto — sai do saldo</SelectItem>
                <SelectItem value="CREDIT">Crédito — entra no saldo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-valor">Valor (€)</Label>
            <Input
              id="ag-valor" type="number" min="0" step="0.01" inputMode="decimal"
              value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-frequencia">Frequência</Label>
            <Select value={frequencia} onValueChange={(v) => setFrequencia(v as PaymentFrequency)}>
              <SelectTrigger id="ag-frequencia"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIAS.map((f) => (
                  <SelectItem key={f.valor} value={f.valor}>{f.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ag-descricao">Descrição</Label>
            <Input
              id="ag-descricao" value={descricao} maxLength={500}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Seguro de acidentes de trabalho"
            />
            <p className="text-xs text-muted-foreground">
              É isto que o motorista vai ler no extrato, em cada lançamento.
            </p>
          </div>

          {/* ── A lista editável de tipos ───────────────────────────────────
              O tipo é só para agrupar e para o formulário não começar numa
              caixa vazia — o que o motorista lê é a descrição acima. */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ag-categoria">Tipo de pagamento (opcional)</Label>
            {!aAdicionarTipo ? (
              <div className="flex gap-2">
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger id="ag-categoria" className="flex-1">
                    <SelectValue placeholder="Sem tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => setAAdicionarTipo(true)}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Novo tipo
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={novaCategoria} maxLength={60} autoFocus
                  onChange={(e) => setNovaCategoria(e.target.value)}
                  placeholder="Ex.: Seguro de saúde"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && novaCategoria.trim()) {
                      e.preventDefault();
                      adicionarTipo(novaCategoria.trim());
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={() => adicionarTipo(novaCategoria.trim())}
                  disabled={!novaCategoria.trim() || aGravarTipo}
                >
                  {aGravarTipo ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setAAdicionarTipo(false); setNovaCategoria(''); }}>
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ag-inicio">Primeira data</Label>
            <Input
              id="ag-inicio" type="date" value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              disabled={jaCorreu}
            />
            {jaCorreu && (
              /* Dito por palavras, porque um campo cinzento sem explicação lê-se
                 como avaria. Recuar a data faria o sistema lançar outra vez o
                 que já lançou — dois descontos iguais no saldo de alguém. */
              <p className="text-xs text-muted-foreground">
                Já fez {editar?.runCount} lançamento(s), por isso a primeira data
                passou a fazer parte do histórico. O valor, a descrição, o tipo,
                a frequência e o fim corrigem-se à mesma.
              </p>
            )}
          </div>

          {frequencia !== 'UNICO' && (
            <div className="space-y-1.5">
              <Label htmlFor="ag-limite">Até quando</Label>
              <div className="flex gap-2">
                <Select value={limite} onValueChange={(v) => setLimite(v as Limite)}>
                  <SelectTrigger id="ag-limite" className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sempre">Até eu parar</SelectItem>
                    <SelectItem value="vezes">Um número de vezes</SelectItem>
                    <SelectItem value="data">Até uma data</SelectItem>
                  </SelectContent>
                </Select>
                {limite === 'vezes' && (
                  <Input
                    type="number" min="1" max="600" className="w-24"
                    value={vezes} onChange={(e) => setVezes(e.target.value)} aria-label="Número de vezes"
                  />
                )}
                {limite === 'data' && (
                  <Input
                    type="date" className="w-44"
                    value={fim} onChange={(e) => setFim(e.target.value)} aria-label="Data de fim"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {resumo && (
          <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            {resumo}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={isPending}>Cancelar</Button>
          <Button onClick={() => gravar()} disabled={!completo || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {aEditar ? 'Gravar alterações' : 'Criar agendamento'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
