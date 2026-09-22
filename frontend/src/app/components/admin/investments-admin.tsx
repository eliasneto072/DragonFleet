// src/app/components/admin/investments-admin.tsx
//
// Investimentos, do lado da administração: as aplicações de toda a gente e a
// configuração dos planos.
//
// Os números do topo respondem a "quanto devemos em investimentos": o que
// está aplicado mais os ganhos já acumulados. É dinheiro que saiu do saldo dos
// motoristas mas continua a ser deles.
//
// Só o ADMIN cria planos e muda taxas; o MANAGER e o SUPPORT veem. A mesma
// regra está no servidor — aqui é só para a tela não oferecer o que vai dar
// 403.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Switch } from '@/app/components/ui/switch';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/app/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { PageHeader } from '@/app/components/ui/page-header';
import { AlertCircle, History, Loader2, Pencil, PiggyBank, Plus, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/context/AuthContext';
import {
  investmentsService, type InvestmentPlan, type PlanInput, type PlanType,
} from '@/shared/services/investments.service';
import { ranksService, type Tier } from '@/shared/services/ranks.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import {
  InvestmentDetailDialog, StatusPill, dia, planTypeLabel, taxa,
} from '@/app/components/investments/investment-detail';

// ── Formulário de plano ──────────────────────────────────────────────────────

function hojeLisboa(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const n = (s: string) => Number(s.replace(',', '.'));

function PlanDialog({ plan, open, onClose }: {
  /** null = criar um novo. */
  plan: InvestmentPlan | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editar = !!plan;

  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [type, setType] = useState<PlanType>(plan?.type ?? 'FLEXIBLE');
  const [rate, setRate] = useState(plan ? String(plan.annualRate) : '');
  const [termDays, setTermDays] = useState(plan?.termDays ? String(plan.termDays) : '90');
  const [penalty, setPenalty] = useState(plan?.earlyWithdrawalPenalty != null ? String(plan.earlyWithdrawalPenalty) : '0');
  const [minAmount, setMinAmount] = useState(plan ? String(plan.minAmount) : '0');
  const [minRank, setMinRank] = useState<Tier | 'NONE'>(plan?.minRank ?? 'NONE');

  // A escada, para o seletor de nível mínimo. É o que liga os dois sistemas:
  // os melhores planos ficam para quem sobe de nível.
  const ranksQ = useQuery({
    queryKey: queryKeys.ranks.configs,
    queryFn: () => ranksService.configs(),
    staleTime: 5 * 60 * 1000,
  });
  const [active, setActive] = useState(plan?.active ?? true);

  const fixed = type === 'FIXED';

  const m = useMutation({
    mutationFn: () => {
      const base = {
        name: name.trim(),
        description: description.trim() || null,
        minAmount: n(minAmount) || 0,
        minRank: minRank === 'NONE' ? null : minRank,
        active,
      };
      const fixos = fixed
        ? { annualRate: n(rate), termDays: Math.round(n(termDays)), earlyWithdrawalPenalty: n(penalty) || 0 }
        : {};
      if (editar) return investmentsService.updatePlan(plan!.id, { ...base, ...fixos });
      const input: PlanInput = { ...base, type, annualRate: n(rate), ...fixos };
      return investmentsService.createPlan(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.investments.all });
      toast.success(editar ? 'Plano atualizado.' : 'Plano criado.');
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível guardar o plano.'),
  });

  const rateOk = !Number.isNaN(n(rate)) && rate.trim() !== '' && n(rate) >= 0 && n(rate) <= 100;
  const termOk = !fixed || (n(termDays) >= 1 && Number.isInteger(n(termDays)));
  const podeGuardar = name.trim().length >= 2 && (editar && !fixed ? true : rateOk) && termOk;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editar ? 'Editar plano' : 'Novo plano'}</DialogTitle>
          <DialogDescription>
            {fixed
              ? 'Nos planos fixos, quem aplica fica com a taxa, o prazo e a penalização em vigor nesse momento. Alterar o plano só afeta aplicações novas.'
              : 'Nos planos flexíveis a taxa pode ser alterada depois, em "Alterar taxa"; cada dia rende à taxa que estava em vigor nesse dia.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="pl-name">Nome</Label>
            <Input id="pl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Poupança Flex" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pl-desc">Descrição (opcional, o motorista vê)</Label>
            <Textarea id="pl-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {!editar && (
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as PlanType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FLEXIBLE">Flexível — taxa variável, resgate a qualquer momento</SelectItem>
                  <SelectItem value="FIXED">Fixo — taxa fixa, com prazo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {(!editar || fixed) && (
            <div className="space-y-1.5">
              <Label htmlFor="pl-rate">Taxa anual (%)</Label>
              <Input id="pl-rate" type="number" inputMode="decimal" step="0.001" min="0" max="100"
                value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Ex.: 2" />
              {rateOk && (
                <p className="text-xs text-muted-foreground">
                  1000 € rendem ~ {formatCurrency((1000 * n(rate)) / 100 / 365)} por dia
                  ({formatCurrency((1000 * n(rate)) / 100)} num ano).
                </p>
              )}
            </div>
          )}

          {fixed && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pl-term">Prazo (dias)</Label>
                <Input id="pl-term" type="number" min="1" step="1" value={termDays}
                  onChange={(e) => setTermDays(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pl-pen">Penalização antecipada (%)</Label>
                <Input id="pl-pen" type="number" min="0" max="100" step="0.01" value={penalty}
                  onChange={(e) => setPenalty(e.target.value)} />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                A penalização é uma percentagem do valor aplicado, descontada se o motorista resgatar antes do fim do prazo.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Nível mínimo</Label>
            <Select value={minRank} onValueChange={(v) => setMinRank(v as Tier | 'NONE')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Aberto a todos os motoristas</SelectItem>
                {(ranksQ.data?.configs ?? []).map((c) => (
                  <SelectItem key={c.tier} value={c.tier}>A partir de {c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Quem não tiver o nível vê o plano trancado, com o nível que lhe falta.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pl-min">Valor mínimo por aplicação (€)</Label>
            <Input id="pl-min" type="number" min="0" step="1" value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)} />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <div>
              <p className="font-medium">Aberto a novas aplicações</p>
              <p className="text-xs text-muted-foreground">Fechar não afeta quem já aplicou.</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={m.isPending}>Cancelar</Button>
          <Button className="w-full sm:w-auto" disabled={!podeGuardar || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar…</>) : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Taxa dos flexíveis ───────────────────────────────────────────────────────

function RateDialog({ plan, isAdmin, onClose }: {
  plan: InvestmentPlan | null;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const hoje = hojeLisboa();
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState(hoje);

  const histQ = useQuery({
    queryKey: queryKeys.investments.rates(plan?.id ?? ''),
    queryFn: () => investmentsService.rateHistory(plan!.id),
    enabled: !!plan,
  });

  const m = useMutation({
    mutationFn: () => investmentsService.setRate(plan!.id, n(rate), from),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.investments.all });
      toast.success('Taxa registada.');
      setRate('');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível mudar a taxa.'),
  });

  const flex = plan?.type === 'FLEXIBLE';
  const ok = rate.trim() !== '' && n(rate) >= 0 && n(rate) <= 100 && from >= hoje;

  return (
    <Dialog open={!!plan} onOpenChange={(o) => { if (!o) { setRate(''); setFrom(hoje); onClose(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{flex && isAdmin ? 'Alterar taxa' : 'Histórico de taxas'} · {plan?.name}</DialogTitle>
          <DialogDescription>
            {flex
              ? 'A nova taxa vale a partir da data escolhida, para todas as aplicações deste plano. Os dias já pagos não mudam.'
              : 'Nos planos fixos cada aplicação guarda a taxa com que foi feita. Este histórico mostra só quando a oferta mudou.'}
          </DialogDescription>
        </DialogHeader>

        {flex && isAdmin && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="rt-rate">Nova taxa anual (%)</Label>
              <Input id="rt-rate" type="number" inputMode="decimal" step="0.001" min="0" max="100"
                value={rate} onChange={(e) => setRate(e.target.value)} placeholder={plan ? String(plan.annualRate) : ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rt-from">A partir de</Label>
              <Input id="rt-from" type="date" min={hoje} value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <Button className="col-span-2" disabled={!ok || m.isPending} onClick={() => m.mutate()}>
              {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Percent className="mr-2 h-4 w-4" />}
              Registar taxa
            </Button>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Histórico</p>
          {histQ.isLoading ? <Skeleton className="h-20 w-full" /> : (
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {(histQ.data?.rates ?? []).map((r) => (
                <li key={r.id} className="flex justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">
                    {r.effectiveFrom > hoje ? 'A partir de ' : 'Desde '}{dia(r.effectiveFrom)}
                  </span>
                  <span className="font-medium tabular-nums">{taxa(r.annualRate)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── A tela ────────────────────────────────────────────────────────────────────

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-4 pt-4 sm:p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function InvestmentsAdmin() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [status, setStatus] = useState<'ACTIVE' | 'CLOSED' | 'ALL'>('ACTIVE');
  const [planId, setPlanId] = useState('ALL');
  const [search, setSearch] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [editar, setEditar] = useState<InvestmentPlan | null>(null);
  const [criar, setCriar] = useState(false);
  const [taxaDe, setTaxaDe] = useState<InvestmentPlan | null>(null);

  const plansQ = useQuery({
    queryKey: queryKeys.investments.plans(true),
    queryFn: () => investmentsService.listPlans(true),
  });

  const overviewQ = useQuery({
    queryKey: queryKeys.investments.overview(status, planId, search.trim()),
    queryFn: () => investmentsService.overview({
      status: status === 'ALL' ? undefined : status,
      planId: planId === 'ALL' ? undefined : planId,
      search,
    }),
  });

  const plans = plansQ.data?.plans ?? [];
  const t = overviewQ.data?.totals;
  const lista = overviewQ.data?.investments ?? [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Investimentos"
        subtitle="Planos e aplicações dos motoristas"
        icon={<PiggyBank className="h-5 w-5" />}
        actions={isAdmin ? (
          <Button onClick={() => setCriar(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />Novo plano
          </Button>
        ) : undefined}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Kpi label="Aplicado" value={formatCurrency(t?.invested ?? 0)} hint={`${t?.activeCount ?? 0} aplicações ativas`} />
        <Kpi label="Ganhos acumulados" value={formatCurrency(t?.gains ?? 0)} hint="Ainda por pagar" />
        <Kpi label="Total devido" value={formatCurrency((t?.invested ?? 0) + (t?.gains ?? 0))} hint="Aplicado + ganhos" />
        <Kpi label="Custo por dia" value={formatCurrency(t?.dailyGain ?? 0)} hint={`~ ${formatCurrency((t?.dailyGain ?? 0) * 30)} por mês`} />
      </div>

      <Tabs defaultValue="investments">
        <TabsList>
          <TabsTrigger value="investments">Aplicações</TabsTrigger>
          <TabsTrigger value="plans">Planos</TabsTrigger>
        </TabsList>

        {/* ── Aplicações ── */}
        <TabsContent value="investments" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Procurar motorista…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs"
            />
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Ativas</SelectItem>
                <SelectItem value="CLOSED">Resgatadas</SelectItem>
                <SelectItem value="ALL">Todas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os planos</SelectItem>
                {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card className="shadow-card">
            <CardContent className="p-0">
              {overviewQ.isLoading ? (
                <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : overviewQ.isError ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">Erro ao carregar as aplicações.</p>
                </div>
              ) : lista.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma aplicação.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Motorista</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead className="text-right">Aplicado</TableHead>
                        <TableHead className="text-right">Ganhos</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Início</TableHead>
                        <TableHead>Fim</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lista.map((i) => (
                        <TableRow key={i.id} className="cursor-pointer" onClick={() => setAberta(i.id)}>
                          <TableCell className="font-medium">{i.userName ?? '—'}</TableCell>
                          <TableCell>
                            <span className="block">{i.planName}</span>
                            <span className="block text-xs text-muted-foreground">{planTypeLabel(i)} · {taxa(i.currentRate)}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(i.principal)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(i.gains)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(i.status === 'ACTIVE' ? i.currentValue : (i.payout ?? 0))}
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">{dia(i.startDate)}</TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">
                            {i.status === 'CLOSED' ? dia(i.closedAt) : i.maturityDate ? dia(i.maturityDate) : '—'}
                          </TableCell>
                          <TableCell><StatusPill inv={i} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {overviewQ.data?.truncated && (
                <p className="border-t border-border p-3 text-xs text-muted-foreground">
                  A mostrar as primeiras 500. Use os filtros para encontrar outras.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Planos ── */}
        <TabsContent value="plans" className="space-y-3">
          {plansQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : plans.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Ainda não há planos.{isAdmin && ' Crie o primeiro em "Novo plano".'}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {plans.map((p) => (
                <Card key={p.id} className={`shadow-card ${p.active ? '' : 'opacity-70'}`}>
                  <CardContent className="space-y-3 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-semibold">
                          <span className="truncate">{p.name}</span>
                          {!p.active && (
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Fechado</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{planTypeLabel(p)}</p>
                      </div>
                      <p className="shrink-0 text-right">
                        <span className="block text-xl font-bold tabular-nums">{taxa(p.annualRate)}</span>
                        <span className="block text-[11px] text-muted-foreground">ao ano{p.type === 'FLEXIBLE' ? ', hoje' : ''}</span>
                      </p>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">Aplicações ativas</dt>
                      <dd className="text-right tabular-nums">{p.activeCount ?? 0}</dd>
                      <dt className="text-muted-foreground">Total aplicado</dt>
                      <dd className="text-right tabular-nums">{formatCurrency(p.activePrincipal ?? 0)}</dd>
                      <dt className="text-muted-foreground">Mínimo</dt>
                      <dd className="text-right tabular-nums">{formatCurrency(p.minAmount)}</dd>
                      {p.minRank && (
                        <>
                          <dt className="text-muted-foreground">Nível mínimo</dt>
                          <dd className="text-right">{p.minRank}</dd>
                        </>
                      )}
                      {p.type === 'FIXED' && (
                        <>
                          <dt className="text-muted-foreground">Penalização antecipada</dt>
                          <dd className="text-right tabular-nums">{taxa(p.earlyWithdrawalPenalty ?? 0)}</dd>
                        </>
                      )}
                    </dl>

                    <div className="flex flex-wrap gap-2">
                      {isAdmin && (
                        <Button size="sm" variant="outline" onClick={() => setEditar(p)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />Editar
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setTaxaDe(p)}>
                        {p.type === 'FLEXIBLE' && isAdmin
                          ? (<><Percent className="mr-1.5 h-3.5 w-3.5" />Alterar taxa</>)
                          : (<><History className="mr-1.5 h-3.5 w-3.5" />Histórico</>)}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* `key` força um formulário novo em cada abertura: sem isso, o estado
          do plano editado antes aparecia ao criar um novo. */}
      {(criar || editar) && (
        <PlanDialog
          key={editar?.id ?? 'novo'}
          plan={editar}
          open
          onClose={() => { setCriar(false); setEditar(null); }}
        />
      )}
      <RateDialog plan={taxaDe} isAdmin={isAdmin} onClose={() => setTaxaDe(null)} />
      <InvestmentDetailDialog investmentId={aberta} onClose={() => setAberta(null)} canWithdraw={isAdmin} />
    </div>
  );
}
