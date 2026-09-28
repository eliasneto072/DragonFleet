// src/app/components/admin/projects-admin.tsx
//
// Projetos de investimento, do lado da administração.
//
// ─── O TRABALHO MENSAL SÃO DOIS CLIQUES ─────────────────────────────────────
//
// Apurar e distribuir. Apurar lê os fechos do carro e faz a conta; distribuir
// paga aos investidores. São passos separados de propósito: entre um e outro
// há uma pessoa a olhar para o número e a lançar as despesas do mês, e juntá-los
// num só botão tirava essa pausa — que é precisamente onde os erros se apanham.
//
// ─── O QUE A TELA TEM DE MOSTRAR ANTES DE SE PAGAR ──────────────────────────
//
// As parcelas: quanto veio de comissão, quanto de aluguer, quanto saiu em
// despesas, e de quantos fechos. Um número sozinho não se confere; com as
// parcelas à vista, quem paga vê logo se falta uma semana.

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Calculator, Car, Check, Eye, EyeOff, Image as ImageIcon, Loader2, Plus,
  Send, Trash2, TrendingUp, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/context/AuthContext';
import {
  projectsService, ESTADO_DO_PROJETO, NOME_DA_ETAPA,
  type ProjectDetail, type ProjectListItem, type UpdateStage,
} from '@/shared/services/projects.service';
import { apiClient } from '@/shared/lib/api-client';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import { ApiError } from '@/shared/lib/api-client';

const n = (s: string) => Number(s.replace(',', '.')) || 0;
const mesAtual = () => new Date().toISOString().slice(0, 7);

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const mesLegivel = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

export function ProjectsAdmin() {
  const { user } = useAuth();
  const podeMexer = user?.role === 'ADMIN';

  const [aCriar, setACriar] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const q = useQuery({
    queryKey: queryKeys.projects.list('', ''),
    queryFn: () => projectsService.list(),
  });

  const projetos = q.data?.projects ?? [];
  const aplicado = projetos
    .filter((p) => p.status === 'ACTIVE' || p.status === 'FUNDING')
    .reduce((s, p) => s + p.raised, 0);
  const distribuido = projetos.reduce((s, p) => s + p.distributed, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projetos de investimento"
        subtitle="Carros financiados por investidores, que repartem o que eles derem."
        actions={podeMexer ? (
          <Button onClick={() => setACriar(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo projeto
          </Button>
        ) : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Total icon={Car} titulo="Projetos" valor={String(projetos.length)} nota="ao todo" />
        <Total
          icon={Users} titulo="Capital aplicado" valor={formatCurrency(aplicado)}
          nota="a angariar e a render"
        />
        <Total
          icon={TrendingUp} titulo="Já distribuído" valor={formatCurrency(distribuido)}
          nota="aos investidores"
        />
      </div>

      {q.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : projetos.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Car className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Ainda não há projetos</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie o primeiro, abra-o a subscrições e os investidores veem-no no portal deles.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projetos.map((p) => (
            <Linha key={p.id} p={p} onAbrir={() => setAberto(p.id)} />
          ))}
        </div>
      )}

      {aCriar && <CriarDialog onClose={() => setACriar(false)} />}
      {aberto && (
        <ProjetoDialog id={aberto} podeMexer={podeMexer} onClose={() => setAberto(null)} />
      )}
    </div>
  );
}

// ─── Peças ──────────────────────────────────────────────────────────────────

function Total({ icon: Icon, titulo, valor, nota }: {
  icon: typeof Car; titulo: string; valor: string; nota: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <p className="text-xs">{titulo}</p>
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{valor}</p>
        <p className="mt-1 text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  );
}

function Linha({ p, onAbrir }: { p: ProjectListItem; onAbrir: () => void }) {
  const pct = p.targetAmount > 0 ? Math.min(100, (p.raised / p.targetAmount) * 100) : 0;

  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={onAbrir}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{p.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {p.vehicle
                ? `${p.vehicle.brand} ${p.vehicle.model} · ${p.vehicle.plate}`
                : 'Carro por atribuir'}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs">
            {ESTADO_DO_PROJETO[p.status]}
          </span>
        </div>

        <div className="mt-4 flex items-baseline justify-between text-sm">
          <span className="font-medium tabular-nums">{formatCurrency(p.raised)}</span>
          <span className="text-muted-foreground tabular-nums">
            de {formatCurrency(p.targetAmount)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, pct)}%` }} />
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {p.investorsCount} investidor{p.investorsCount === 1 ? '' : 'es'}
          {' · '}{p.profitShare}% do lucro
          {p.distributed > 0 && ` · ${formatCurrency(p.distributed)} distribuídos`}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Criar ──────────────────────────────────────────────────────────────────

function CriarDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: '', description: '', targetAmount: '', minTicket: '0',
    profitShare: '50', vehicleId: '', riskLevel: '', endsOn: '',
  });

  const veiculos = useQuery({
    queryKey: queryKeys.vehicles.list,
    queryFn: () => vehiclesService.list(),
  });

  const criar = useMutation({
    mutationFn: () => projectsService.create({
      name: f.name.trim(),
      description: f.description.trim() || undefined,
      targetAmount: n(f.targetAmount),
      minTicket: n(f.minTicket),
      profitShare: n(f.profitShare),
      vehicleId: f.vehicleId || null,
      riskLevel: f.riskLevel.trim() || undefined,
      endsOn: f.endsOn || undefined,
    }),
    onSuccess: () => {
      toast.success('Projeto criado. Abra-o a subscrições quando quiser.');
      void qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Não foi possível criar.'),
  });

  const valido = f.name.trim().length >= 3 && n(f.targetAmount) > 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>
            Nasce como rascunho: os investidores só o veem depois de o abrir a subscrições.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <Campo id="p-name" label="Nome" value={f.name}
            onChange={(v) => setF({ ...f, name: v })} placeholder="Peugeot 308 nº 4" />

          <div>
            <Label htmlFor="p-desc">Descrição</Label>
            <Textarea
              id="p-desc" rows={3} className="mt-1.5"
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              placeholder="O que é o projeto, que carro é, que retorno se espera…"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              É isto que o investidor lê antes de decidir. Vale a pena escrever.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Campo id="p-target" label="Meta (€)" value={f.targetAmount}
              onChange={(v) => setF({ ...f, targetAmount: v })} placeholder="20000" />
            <Campo id="p-min" label="Mínimo (€)" value={f.minTicket}
              onChange={(v) => setF({ ...f, minTicket: v })} />
            <Campo id="p-share" label="% do lucro" value={f.profitShare}
              onChange={(v) => setF({ ...f, profitShare: v })} />
          </div>

          <div>
            <Label>Carro</Label>
            <Select
              value={f.vehicleId || 'none'}
              onValueChange={(v) => setF({ ...f, vehicleId: v === 'none' ? '' : v })}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Escolher depois" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Escolher depois</SelectItem>
                {(veiculos.data?.vehicles ?? []).map((v: {
                  id: string; brand: string; model: string; plate: string;
                }) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.brand} {v.model} · {v.plate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              É dos fechos deste carro que sai o lucro. Sem carro, o projeto não arranca.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo id="p-risk" label="Risco (A–D)" value={f.riskLevel}
              onChange={(v) => setF({ ...f, riskLevel: v })} placeholder="B" />
            <Campo id="p-ends" label="Prazo (opcional)" type="date" value={f.endsOn}
              onChange={(v) => setF({ ...f, endsOn: v })} />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Sem prazo, o projeto corre até vender o carro. Com prazo, o capital é devolvido
            nessa data mesmo sem venda.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valido || criar.isPending} onClick={() => criar.mutate()}>
            {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Abrir um projeto ───────────────────────────────────────────────────────

function ProjetoDialog({ id, podeMexer, onClose }: {
  id: string; podeMexer: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [despesa, setDespesa] = useState({ month: mesAtual(), amount: '', description: '' });
  const [venda, setVenda] = useState('');

  const q = useQuery({
    queryKey: queryKeys.projects.detail(id),
    queryFn: () => projectsService.get(id),
  });

  function refrescar(msg: string) {
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    void qc.invalidateQueries({ queryKey: queryKeys.investors.all });
  }
  const falhou = (e: unknown) =>
    toast.error(e instanceof ApiError ? e.message : 'Não foi possível concluir.');

  const abrir = useMutation({
    mutationFn: () => projectsService.openFunding(id),
    onSuccess: () => refrescar('Aberto a subscrições.'), onError: falhou,
  });
  const arrancar = useMutation({
    mutationFn: () => projectsService.activate(id),
    onSuccess: () => refrescar('O projeto está a render.'), onError: falhou,
  });
  const cancelar = useMutation({
    mutationFn: () => projectsService.cancel(id),
    onSuccess: () => refrescar('Projeto cancelado e capital libertado.'), onError: falhou,
  });
  const apurar = useMutation({
    mutationFn: () => projectsService.computePending(id),
    onSuccess: (r) => refrescar(
      r.periods.length === 0 ? 'Não há meses novos para apurar.'
        : `${r.periods.length} ${r.periods.length === 1 ? 'mês apurado' : 'meses apurados'}.`,
    ),
    onError: falhou,
  });
  const distribuir = useMutation({
    mutationFn: (month: string) => projectsService.distribute(id, month),
    onSuccess: () => refrescar('Lucro distribuído pelos investidores.'), onError: falhou,
  });
  const lancarDespesa = useMutation({
    mutationFn: () => projectsService.addExpense(id, {
      month: despesa.month, amount: n(despesa.amount), description: despesa.description.trim(),
    }),
    onSuccess: () => {
      refrescar('Despesa lançada.');
      setDespesa({ month: mesAtual(), amount: '', description: '' });
    },
    onError: falhou,
  });
  const apagarDespesa = useMutation({
    mutationFn: (expenseId: string) => projectsService.removeExpense(expenseId),
    onSuccess: () => refrescar('Despesa removida.'), onError: falhou,
  });
  const fechar = useMutation({
    mutationFn: () => projectsService.close(id, {
      saleAmount: venda.trim() ? n(venda) : null,
    }),
    onSuccess: () => refrescar('Projeto liquidado e capital devolvido.'), onError: falhou,
  });

  const d: ProjectDetail | undefined = q.data;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{d?.project.name ?? 'Projeto'}</DialogTitle>
          <DialogDescription>
            {d && (
              <>
                {ESTADO_DO_PROJETO[d.project.status]} ·{' '}
                {d.project.vehicle
                  ? `${d.project.vehicle.brand} ${d.project.vehicle.model} · ${d.project.vehicle.plate}`
                  : 'sem carro escolhido'}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {q.isLoading || !d ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Mini titulo="Angariado" valor={formatCurrency(d.project.raised)}
                nota={`meta ${formatCurrency(d.project.targetAmount)}`} />
              <Mini titulo="Investidores" valor={String(d.project.investorsCount)}
                nota={`${d.project.profitShare}% do lucro`} />
              <Mini titulo="Distribuído" valor={formatCurrency(d.project.distributed)}
                nota="desde o arranque" />
            </div>

            {podeMexer && (
              <div className="flex flex-wrap gap-2">
                {d.project.status === 'DRAFT' && (
                  <Button size="sm" onClick={() => abrir.mutate()} disabled={abrir.isPending}>
                    Abrir a subscrições
                  </Button>
                )}
                {d.project.status === 'FUNDING' && (
                  <>
                    <Button size="sm" onClick={() => arrancar.mutate()} disabled={arrancar.isPending}>
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Pôr a render
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={() => cancelar.mutate()} disabled={cancelar.isPending}>
                      <X className="mr-1 h-3.5 w-3.5" />
                      Cancelar
                    </Button>
                  </>
                )}
                {d.project.status === 'ACTIVE' && (
                  <Button size="sm" onClick={() => apurar.mutate()} disabled={apurar.isPending}>
                    {apurar.isPending
                      ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      : <Calculator className="mr-1 h-3.5 w-3.5" />}
                    Apurar meses em falta
                  </Button>
                )}
              </div>
            )}

            {/* ── Meses ────────────────────────────────────────────────── */}
            <Bloco titulo="Mês a mês">
              {d.periods.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum mês apurado. Carregue em “Apurar meses em falta”.
                </p>
              ) : (
                <div className="space-y-2">
                  {d.periods.map((x) => (
                    <div key={x.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{mesLegivel(x.month)}</p>
                          {/* As parcelas à vista: um número sozinho não se
                              confere, e é aqui que se dá pela semana em falta. */}
                          <p className="text-xs text-muted-foreground">
                            {x.settlementsCount} fecho{x.settlementsCount === 1 ? '' : 's'}
                            {' · comissão '}{formatCurrency(x.commissionTotal)}
                            {' · viatura '}{formatCurrency(x.vehicleFeeTotal)}
                            {x.expensesTotal > 0 && ` · despesas ${formatCurrency(x.expensesTotal)}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium tabular-nums">{formatCurrency(x.profit)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(x.investorsAmount)} para investidores
                          </p>
                        </div>
                      </div>

                      {podeMexer && d.project.status === 'ACTIVE' && (
                        <div className="mt-2 flex items-center gap-2">
                          {x.status === 'DISTRIBUTED' ? (
                            <span className="text-xs text-success">Distribuído</span>
                          ) : (
                            <Button
                              size="sm" variant="outline"
                              disabled={distribuir.isPending || x.investorsAmount <= 0}
                              onClick={() => distribuir.mutate(x.month)}
                            >
                              <Send className="mr-1 h-3.5 w-3.5" />
                              {x.investorsAmount > 0 ? 'Distribuir' : 'Sem lucro a distribuir'}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Bloco>

            {/* ── Despesas ─────────────────────────────────────────────── */}
            {podeMexer && (
              <Bloco titulo="Despesas do carro">
                <p className="mb-3 text-xs text-muted-foreground">
                  O que não passa no fecho semanal: seguro, revisão, pneus, IUC. Sem isto o
                  lucro apurado seria sempre otimista.
                </p>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
                  <Campo id="d-month" label="Mês" type="month" value={despesa.month}
                    onChange={(v) => setDespesa({ ...despesa, month: v })} />
                  <Campo id="d-amount" label="Valor" value={despesa.amount}
                    onChange={(v) => setDespesa({ ...despesa, amount: v })} placeholder="0,00" />
                  <Campo id="d-desc" label="Descrição" value={despesa.description}
                    onChange={(v) => setDespesa({ ...despesa, description: v })}
                    placeholder="Seguro anual" />
                </div>
                <Button
                  className="mt-3" size="sm"
                  disabled={n(despesa.amount) <= 0 || despesa.description.trim().length < 3
                    || lancarDespesa.isPending}
                  onClick={() => lancarDespesa.mutate()}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Lançar
                </Button>

                {d.expenses.length > 0 && (
                  <div className="mt-4 space-y-1">
                    {d.expenses.map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm">{e.description}</p>
                          <p className="text-xs text-muted-foreground">{mesLegivel(e.month)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm tabular-nums">{formatCurrency(e.amount)}</span>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => apagarDespesa.mutate(e.id)}
                            aria-label="Remover despesa"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Bloco>
            )}

            {/* ── Diário de bordo ──────────────────────────────────────── */}
            {podeMexer && <DiarioBloco projectId={id} d={d} />}

            {/* ── Participações ────────────────────────────────────────── */}
            <Bloco titulo="Participações">
              {d.shares.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda não há subscrições.</p>
              ) : (
                <div className="space-y-1">
                  {d.shares.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{s.investor?.name ?? '—'}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.investor?.email}
                          {s.status !== 'ACTIVE' && ` · ${s.status === 'LIQUIDATED' ? 'liquidada' : 'cancelada'}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm tabular-nums">{formatCurrency(s.amount)}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {d.project.raised > 0
                            ? `${((s.amount / d.project.raised) * 100).toFixed(1)}%`
                            : '—'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Bloco>

            {/* ── Fechar ───────────────────────────────────────────────── */}
            {podeMexer && d.project.status === 'ACTIVE' && (
              <Bloco titulo="Fechar o projeto">
                <p className="mb-3 text-xs text-muted-foreground">
                  O valor da venda é repartido pelos investidores na proporção do que
                  financiaram — pode devolver mais ou menos do que puseram. Sem valor,
                  devolve o capital tal como entrou.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-44">
                    <Label htmlFor="venda">Valor da venda (€)</Label>
                    <Input
                      id="venda" className="mt-1.5" value={venda}
                      onChange={(e) => setVenda(e.target.value)}
                      placeholder="deixar vazio = sem venda"
                    />
                  </div>
                  <Button
                    variant="outline" disabled={fechar.isPending}
                    onClick={() => fechar.mutate()}
                  >
                    {fechar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Liquidar
                  </Button>
                </div>
              </Bloco>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O diário de bordo, do lado de quem escreve.
 *
 * É a peça que faz o investidor não telefonar: entre o financiamento fechar e
 * o carro render passam semanas em que ele tem dinheiro parado e nada para
 * ver. Cada entrada aqui é um telefonema a menos.
 *
 * A fotografia é opcional mas vale a pena: uma imagem do carro à porta do
 * stand diz mais do que três parágrafos a garantir que ele existe.
 */
function DiarioBloco({ projectId, d }: { projectId: string; d: ProjectDetail }) {
  const qc = useQueryClient();
  const [f, setF] = useState<{
    stage: UpdateStage; title: string; body: string;
    happenedOn: string; visible: boolean;
  }>({
    stage: 'OTHER',
    title: '',
    body: '',
    happenedOn: new Date().toISOString().slice(0, 10),
    visible: true,
  });
  const [imagem, setImagem] = useState<File | null>(null);
  const [aEnviar, setAEnviar] = useState(false);

  function refrescar(msg: string) {
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: queryKeys.projects.all });
  }
  const falhou = (e: unknown) =>
    toast.error(e instanceof ApiError ? e.message : 'Não foi possível concluir.');

  const escrever = useMutation({
    mutationFn: async () => {
      // A imagem vai primeiro pelo /upload, que já existe e já trata do
      // armazenamento; a entrada leva só o endereço. Assim não é preciso um
      // caminho de multipart só para isto.
      let imageUrl: string | undefined;
      if (imagem) {
        setAEnviar(true);
        const form = new FormData();
        form.append('image', imagem);
        const r = await apiClient.upload<{ fileUrl: string }>('/upload', form);
        imageUrl = r.fileUrl;
        setAEnviar(false);
      }
      return projectsService.addUpdate(projectId, {
        stage: f.stage,
        title: f.title.trim(),
        body: f.body.trim() || undefined,
        happenedOn: f.happenedOn,
        visible: f.visible,
        imageUrl,
      });
    },
    onSuccess: () => {
      refrescar(f.visible
        ? 'Entrada publicada. Os investidores foram avisados.'
        : 'Nota interna guardada.');
      setF({ ...f, title: '', body: '' });
      setImagem(null);
    },
    onError: (e) => { setAEnviar(false); falhou(e); },
  });

  const alternar = useMutation({
    mutationFn: (id: string) => projectsService.toggleUpdate(id),
    onSuccess: () => refrescar('Visibilidade alterada.'), onError: falhou,
  });
  const apagar = useMutation({
    mutationFn: (id: string) => projectsService.removeUpdate(id),
    onSuccess: () => refrescar('Entrada removida.'), onError: falhou,
  });

  const valido = f.title.trim().length >= 3;

  return (
    <Bloco titulo="Diário de bordo">
      <p className="mb-4 text-xs text-muted-foreground">
        O que escrever aqui aparece na página do projeto de cada investidor, por ordem de
        data, e dispara um aviso. É isto que evita o telefonema de quem tem dinheiro
        parado à espera do carro.
      </p>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <div>
          <Label>Etapa</Label>
          <Select
            value={f.stage}
            onValueChange={(v) => setF({ ...f, stage: v as UpdateStage })}
          >
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(NOME_DA_ETAPA) as UpdateStage[]).map((k) => (
                <SelectItem key={k} value={k}>{NOME_DA_ETAPA[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Campo
          id="u-date" label="Dia a que se refere" type="date" value={f.happenedOn}
          onChange={(v) => setF({ ...f, happenedOn: v })}
        />
      </div>

      <div className="mt-3">
        <Campo
          id="u-title" label="Título" value={f.title}
          onChange={(v) => setF({ ...f, title: v })}
          placeholder="Carro pago ao stand"
        />
      </div>

      <div className="mt-3">
        <Label htmlFor="u-body">Detalhe</Label>
        <Textarea
          id="u-body" rows={3} className="mt-1.5"
          value={f.body}
          onChange={(e) => setF({ ...f, body: e.target.value })}
          placeholder="O que aconteceu, o que vem a seguir e quando é esperado."
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <span className="underline underline-offset-2">
            {imagem ? imagem.name : 'Anexar fotografia'}
          </span>
          <input
            type="file" accept="image/*" className="sr-only"
            onChange={(e) => setImagem(e.target.files?.[0] ?? null)}
          />
        </label>
        {imagem && (
          <Button variant="ghost" size="sm" onClick={() => setImagem(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}

        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox" checked={!f.visible}
            onChange={(e) => setF({ ...f, visible: !e.target.checked })}
          />
          Nota interna (os investidores não veem)
        </label>
      </div>

      <Button
        className="mt-4" size="sm"
        disabled={!valido || escrever.isPending || aEnviar}
        onClick={() => escrever.mutate()}
      >
        {(escrever.isPending || aEnviar)
          ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          : <Plus className="mr-1 h-3.5 w-3.5" />}
        {aEnviar ? 'A enviar a fotografia…' : 'Publicar'}
      </Button>

      {d.updates.length > 0 && (
        <div className="mt-6 space-y-2">
          {d.updates.map((u) => (
            <div
              key={u.id}
              className={`rounded-lg border p-3 ${u.visible ? 'border-border' : 'border-dashed border-border opacity-70'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {u.title}
                    {!u.visible && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        nota interna
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {NOME_DA_ETAPA[u.stage]} · {u.happenedOn.split('-').reverse().join('/')}
                  </p>
                  {u.body && (
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                      {u.body}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => alternar.mutate(u.id)}
                    title={u.visible ? 'Esconder dos investidores' : 'Mostrar aos investidores'}
                    aria-label={u.visible ? 'Esconder dos investidores' : 'Mostrar aos investidores'}
                  >
                    {u.visible
                      ? <Eye className="h-3.5 w-3.5" />
                      : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => apagar.mutate(u.id)}
                    aria-label="Apagar entrada"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              {u.imageUrl && (
                <img
                  src={u.imageUrl} alt={u.title} loading="lazy"
                  className="mt-2 max-h-40 rounded-md border border-border object-cover"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </Bloco>
  );
}

function Mini({ titulo, valor, nota }: { titulo: string; valor: string; nota: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 font-medium">{titulo}</h3>
      {children}
    </div>
  );
}

function Campo({ id, label, value, onChange, placeholder, type = 'text' }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id} type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} className="mt-1.5"
      />
    </div>
  );
}
