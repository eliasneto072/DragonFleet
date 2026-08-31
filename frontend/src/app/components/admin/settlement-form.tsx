// src/app/components/admin/settlement-form.tsx
//
// Fecho semanal de faturação — a única porta pela qual entra dinheiro na conta
// do motorista.
//
// O CÁLCULO VIVE NO SERVIDOR. Cada alteração dispara POST /settlements/preview,
// com atraso, e os totais mostrados são os que a API devolveu. Somar aqui seria
// mais rápido de escrever e criaria a pior classe de erro possível: a tela a
// mostrar um valor e a base a gravar outro, no dia em que a fórmula mudasse
// num lado só.
//
// CONFERÊNCIA CRUZADA: ao escolher motorista e semana, mostra-se o que ele
// comunicou nesse intervalo, ao lado dos campos de receita. Se o relatório da
// Uber disser 109 € e o motorista tiver comunicado 119 €, alguém olha antes de
// fechar. Esses lançamentos não creditam nada — servem só para isto.
//
// Serve criação e edição de rascunho. Sem o segundo caso o botão "Guardar
// rascunho" seria um beco: só daria para apagar e começar de novo.

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { AlertCircle, Car, Eye, EyeOff, Info, Loader2, Save, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { usersService } from '@/features/admin/services/users.service';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import {
  settlementsService,
  type SettlementAmounts,
  type SettlementTotals,
} from '@/features/admin/services/settlements.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import { platformLabel } from '@/shared/lib/platform-labels';

// ── Datas ─────────────────────────────────────────────────────────────────────

function toInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Segunda-feira da semana que contém `ref`. */
function mondayOf(ref: Date): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const weekday = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - weekday);
  return d;
}

export function weekRange(offsetWeeks: number): { start: string; end: string } {
  const start = mondayOf(new Date());
  start.setDate(start.getDate() + offsetWeeks * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toInput(start), end: toInput(end) };
}

/** "2026-07-06" → "06/07/2026", sem passar por Date (evita deslocamento). */
function br(day: string): string {
  return day.split('-').reverse().join('/');
}

// ── Campo monetário ───────────────────────────────────────────────────────────

function MoneyField({
  id, label, value, onChange, hint, icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
          €
        </span>
        <Input
          id={id}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="0,00"
          className="pl-7 tabular-nums"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Estado do formulário ──────────────────────────────────────────────────────

type Amounts = Record<
  'uberAmount' | 'boltAmount' | 'otherRevenue' |
  'tollsAmount' | 'fuelAmount' | 'vehicleFee' | 'otherDeductions',
  string
>;

const EMPTY_AMOUNTS: Amounts = {
  uberAmount: '', boltAmount: '', otherRevenue: '',
  tollsAmount: '', fuelAmount: '', vehicleFee: '', otherDeductions: '',
};

function toNumbers(a: Amounts): SettlementAmounts {
  const n = (v: string) => (v.trim() === '' ? 0 : Number(v));
  return {
    uberAmount: n(a.uberAmount),
    boltAmount: n(a.boltAmount),
    otherRevenue: n(a.otherRevenue),
    tollsAmount: n(a.tollsAmount),
    fuelAmount: n(a.fuelAmount),
    vehicleFee: n(a.vehicleFee),
    otherDeductions: n(a.otherDeductions),
  };
}

/** Zero vira string vazia: um campo com "0" convida a apagar antes de escrever. */
function fromNumber(v: number): string {
  return v ? String(v) : '';
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  /** Editar um rascunho existente. Omitido, cria um novo. */
  settlementId?: string;
  /** Pré-seleção vinda do painel: motorista e semana já escolhidos. */
  initialUserId?: string;
  initialWeek?: { start: string; end: string };
  onDone?: () => void;
}

export function SettlementForm({
  settlementId, initialUserId, initialWeek, onDone,
}: Props) {
  const queryClient = useQueryClient();
  const isEditing = !!settlementId;

  const defaultWeek = initialWeek ?? weekRange(-1); // a que normalmente se fecha
  const [userId, setUserId] = useState(initialUserId ?? '');
  const [vehicleId, setVehicleId] = useState('');
  const [weekStart, setWeekStart] = useState(defaultWeek.start);
  const [weekEnd, setWeekEnd] = useState(defaultWeek.end);
  const [amounts, setAmounts] = useState<Amounts>(EMPTY_AMOUNTS);
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  // O encargo da viatura é sugerido a partir do veículo, mas só enquanto o
  // administrador não lhe tocar: sobrescrever um valor escrito à mão apagaria
  // trabalho dele.
  const [feeTouched, setFeeTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const setAmount = (key: keyof Amounts) => (v: string) =>
    setAmounts((prev) => ({ ...prev, [key]: v }));

  // ── Rascunho a editar ───────────────────────────────────────────────────────

  const existingQuery = useQuery({
    queryKey: queryKeys.settlements.detail(settlementId ?? ''),
    queryFn: () => settlementsService.getById(settlementId!),
    enabled: isEditing,
  });

  useEffect(() => {
    const s = existingQuery.data?.settlement;
    if (!s) return;
    setUserId(s.userId);
    setVehicleId(s.vehicleId ?? '');
    setWeekStart(s.weekStart.slice(0, 10));
    setWeekEnd(s.weekEnd.slice(0, 10));
    setAmounts({
      uberAmount: fromNumber(s.uberAmount),
      boltAmount: fromNumber(s.boltAmount),
      otherRevenue: fromNumber(s.otherRevenue),
      tollsAmount: fromNumber(s.tollsAmount),
      fuelAmount: fromNumber(s.fuelAmount),
      vehicleFee: fromNumber(s.vehicleFee),
      otherDeductions: fromNumber(s.otherDeductions),
    });
    setRate(fromNumber(s.commissionRate));
    setNotes(s.notes ?? '');
    setInternalNotes(s.internalNotes ?? '');
    // Um rascunho guardado já tem o valor decidido; não voltar a sugerir.
    setFeeTouched(true);
  }, [existingQuery.data]);

  // ── Dados de apoio ──────────────────────────────────────────────────────────

  const driversQuery = useQuery({
    queryKey: queryKeys.users.allUnpaged,
    queryFn: () => usersService.listAll(),
  });
  const drivers = (driversQuery.data?.users ?? []).filter((u) => u.role === 'DRIVER');

  const vehiclesQuery = useQuery({
    queryKey: queryKeys.vehicles.list,
    queryFn: () => vehiclesService.list(),
  });
  const vehicles = (vehiclesQuery.data?.vehicles ?? []).filter(
    (v) => !userId || v.userId === userId,
  );

  // O veículo escolhido pode deixar de pertencer ao motorista selecionado.
  useEffect(() => {
    if (vehicleId && !vehicles.some((v) => v.id === vehicleId)) setVehicleId('');
  }, [userId, vehicles, vehicleId]);

  // Sugere o encargo do veículo escolhido. Só enquanto o campo estiver por
  // tocar — trocar de carro depois de escrever um valor à mão não deve apagá-lo.
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  useEffect(() => {
    if (feeTouched) return;
    setAmounts((prev) => ({
      ...prev,
      vehicleFee: selectedVehicle?.weeklyFee ? String(selectedVehicle.weeklyFee) : '',
    }));
  }, [selectedVehicle?.id, selectedVehicle?.weeklyFee, feeTouched]);

  // Conferência cruzada: o que o motorista comunicou nesta semana.
  const reportedQuery = useQuery({
    queryKey: queryKeys.settlements.reported(userId, weekStart, weekEnd),
    queryFn: () => settlementsService.reported(userId, weekStart, weekEnd),
    enabled: !!userId && !!weekStart && !!weekEnd,
  });
  const reported = reportedQuery.data?.reported ?? [];
  const reportedFor = (platform: string) =>
    reported.find((r) => r.platform === platform)?.total ?? 0;

  // Sobreposição, verificada ao escolher a semana.
  //
  // O servidor recusa de qualquer forma — é ele que garante. Mas só o fazia ao
  // gravar, depois de oito campos preenchidos, quando a informação já estava
  // disponível no momento em que a semana foi escolhida. Avisar aqui poupa o
  // trabalho perdido.
  const existingQ = useQuery({
    queryKey: [...queryKeys.settlements.list(userId), 'overlap'] as const,
    queryFn: () => settlementsService.list({ userId }),
    enabled: !!userId,
  });

  const overlapping = useMemo(() => {
    if (!userId || !weekStart || !weekEnd) return null;
    return (existingQ.data?.settlements ?? []).find((x) => {
      if (x.id === settlementId) return false;      // o próprio, ao editar
      if (x.status === 'CANCELLED') return false;   // liberta a semana
      // Intervalos sobrepõem-se quando cada um começa antes de o outro acabar.
      return x.weekStart.slice(0, 10) <= weekEnd && x.weekEnd.slice(0, 10) >= weekStart;
    }) ?? null;
  }, [existingQ.data, userId, weekStart, weekEnd, settlementId]);

  // ── Pré-visualização, calculada no servidor ─────────────────────────────────

  const [totals, setTotals] = useState<
    (SettlementTotals & { commissionRate: number; taxRate: number }) | null
  >(null);
  const [calculating, setCalculating] = useState(false);

  const payload = useMemo<SettlementAmounts>(
    () => ({
      ...toNumbers(amounts),
      ...(rate.trim() !== '' ? { commissionRate: Number(rate) } : {}),
    }),
    [amounts, rate],
  );

  useEffect(() => {
    // Atraso curto: o pedido acompanha a digitação sem uma chamada por tecla.
    let cancelled = false;
    setCalculating(true);

    const timer = setTimeout(() => {
      settlementsService
        .preview(payload)
        .then(({ totals: t }) => { if (!cancelled) setTotals(t); })
        .catch(() => { if (!cancelled) setTotals(null); })
        .finally(() => { if (!cancelled) setCalculating(false); });
    }, 400);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [payload]);

  // ── Gravação ────────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!userId) return 'Selecione o motorista.';
    if (!weekStart || !weekEnd) return 'Indique o intervalo da semana.';
    if (weekStart > weekEnd) return 'A data de início é posterior à de fim.';

    if (overlapping) {
      const from = overlapping.weekStart.slice(0, 10).split('-').reverse().join('/');
      const to = overlapping.weekEnd.slice(0, 10).split('-').reverse().join('/');
      return `Este motorista já tem um fecho de ${from} a ${to}.`;
    }

    // Um fecho com tudo a zero não é um engano inofensivo: ocupa a semana e
    // passa a bloquear o fecho verdadeiro por sobreposição, obrigando a
    // descobrir que existe, cancelar e refazer.
    const totalMoved =
      (totals?.grossRevenue ?? 0) + (totals?.operatingCosts ?? 0);
    if (totalMoved === 0) {
      return 'Preencha pelo menos uma receita ou dedução.';
    }

    return null;
  }

  function buildInput() {
    return {
      vehicleId: vehicleId || null,
      weekStart,
      weekEnd,
      ...payload,
      notes: notes.trim() || null,
      internalNotes: internalNotes.trim() || null,
    };
  }

  function reset() {
    setAmounts(EMPTY_AMOUNTS);
    setRate('');
    setNotes('');
    setInternalNotes('');
    setVehicleId('');
    setFeeTouched(false);
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.settlements.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.balance.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
  };

  /** Grava e devolve o id — o registo precisa de um fecho já existente. */
  async function persist(): Promise<string> {
    if (isEditing) {
      await settlementsService.update(settlementId!, buildInput());
      return settlementId!;
    }
    const { settlement } = await settlementsService.create({ userId, ...buildInput() });
    return settlement.id;
  }

  const { mutate: saveDraft, isPending: savingDraft } = useMutation({
    mutationFn: persist,
    onSuccess: () => {
      invalidate();
      toast.success('Rascunho guardado. Nada foi creditado ainda.');
      if (!isEditing) reset();
      onDone?.();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao guardar o rascunho.'),
  });

  const { mutate: registerNow, isPending: registering } = useMutation({
    // Grava e regista em sequência: o caso comum é fechar de uma vez, e o
    // rascunho fica como opção para quem precisa de rever antes.
    mutationFn: async () => {
      const id = await persist();
      return settlementsService.register(id);
    },
    onSuccess: ({ settlement }) => {
      invalidate();
      toast.success(
        `Fecho registado. ${formatCurrency(settlement.netToDriver)} creditados a ${settlement.userName}.`,
      );
      if (!isEditing) reset();
      setConfirmOpen(false);
      onDone?.();
    },
    onError: (err: any) => {
      setConfirmOpen(false);
      toast.error(err?.message ?? 'Erro ao registar o fecho.');
    },
  });

  const busy = savingDraft || registering;
  // Bloqueia o registo enquanto houver conflito ou nada preenchido: deixar o
  // botão ativo para depois recusar é convidar ao erro.
  const nothingFilled = !totals || (totals.grossRevenue + totals.operatingCosts) === 0;
  const blocked = !!overlapping || nothingFilled;
  const selectedDriver = drivers.find((d) => d.id === userId);
  const effectiveRate = totals?.commissionRate ?? 0;

  function handleRegisterClick() {
    const error = validate();
    if (error) { toast.error(error); return; }
    setConfirmOpen(true);
  }

  function handleDraftClick() {
    const error = validate();
    if (error) { toast.error(error); return; }
    saveDraft();
  }

  if (isEditing && existingQuery.isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">

        {/* ── Coluna esquerda: entrada ── */}
        <div className="space-y-4">

          <Card className="shadow-card">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Motorista e período</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0">
              <div className="space-y-1.5">
                <Label htmlFor="driver">Motorista</Label>
                {driversQuery.isLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={userId} onValueChange={setUserId} disabled={isEditing}>
                    <SelectTrigger id="driver"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {drivers.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {isEditing && (
                  <p className="text-xs text-muted-foreground">
                    O motorista de um rascunho não se troca. Apague e crie outro.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vehicle">Matrícula</Label>
                <Select
                  value={vehicleId}
                  onValueChange={setVehicleId}
                  disabled={!userId || vehicles.length === 0}
                >
                  <SelectTrigger id="vehicle">
                    <SelectValue placeholder={userId ? 'Selecionar' : 'Escolha o motorista'} />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.plate} · {v.brand} {v.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="weekStart">Início da semana</Label>
                <Input
                  id="weekStart" type="date" value={weekStart}
                  max={weekEnd}
                  onChange={(e) => setWeekStart(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="weekEnd">Fim da semana</Label>
                <Input
                  id="weekEnd" type="date" value={weekEnd}
                  min={weekStart}
                  onChange={(e) => setWeekEnd(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => { const w = weekRange(-1); setWeekStart(w.start); setWeekEnd(w.end); }}
                >
                  Semana passada
                </Button>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => { const w = weekRange(0); setWeekStart(w.start); setWeekEnd(w.end); }}
                >
                  Esta semana
                </Button>
              </div>

              {/* Aviso ao escolher a semana, e não ao gravar: a informação já
                  está disponível aqui, e descobrir o conflito depois de oito
                  campos preenchidos deita o trabalho fora. */}
              {overlapping && (
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950 sm:col-span-2">
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
                    aria-hidden="true"
                  />
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Este motorista já tem um fecho de{' '}
                    <strong className="font-medium">
                      {br(overlapping.weekStart.slice(0, 10))} a {br(overlapping.weekEnd.slice(0, 10))}
                    </strong>
                    {' '}({formatCurrency(overlapping.netToDriver)},{' '}
                    {overlapping.status === 'DRAFT' ? 'rascunho' : 'registado'}).
                    Semanas sobrepostas creditariam os mesmos dias duas vezes — escolha outro
                    intervalo ou continue o fecho existente.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Receitas</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Valores dos relatórios das plataformas
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0">
              <MoneyField
                id="uber" label="Uber"
                value={amounts.uberAmount} onChange={setAmount('uberAmount')}
                hint={
                  reportedFor('UBER') > 0
                    ? `O motorista comunicou ${formatCurrency(reportedFor('UBER'))}`
                    : undefined
                }
              />
              <MoneyField
                id="bolt" label="Bolt"
                value={amounts.boltAmount} onChange={setAmount('boltAmount')}
                hint={
                  reportedFor('BOLT') > 0
                    ? `O motorista comunicou ${formatCurrency(reportedFor('BOLT'))}`
                    : undefined
                }
              />
              <MoneyField
                id="otherRevenue" label="Outras receitas"
                value={amounts.otherRevenue} onChange={setAmount('otherRevenue')}
              />

              {reported.length > 0 && (
                <div className="flex gap-2 rounded-lg border border-border bg-secondary p-3 sm:col-span-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <p className="text-xs text-muted-foreground">
                    Nesta semana o motorista comunicou{' '}
                    {reported.map((r, i) => (
                      <span key={r.platform}>
                        {i > 0 && ', '}
                        <strong className="font-medium text-foreground">
                          {formatCurrency(r.total)}
                        </strong>{' '}
                        em {platformLabel(r.platform)}
                      </span>
                    ))}
                    . Serve de conferência — esses lançamentos não creditam nada.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Deduções</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Descontadas antes da percentagem
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0">
              <MoneyField
                id="tolls" label="Via Verde"
                value={amounts.tollsAmount} onChange={setAmount('tollsAmount')}
              />
              <MoneyField
                id="fuel" label="Prio (combustível)"
                value={amounts.fuelAmount} onChange={setAmount('fuelAmount')}
              />
              <MoneyField
                id="vehicleFee" label="Viatura"
                icon={<Car className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                value={amounts.vehicleFee}
                onChange={(v) => { setFeeTouched(true); setAmount('vehicleFee')(v); }}
                hint={
                  selectedVehicle?.weeklyFee
                    ? `Valor definido em ${selectedVehicle.plate}: ${formatCurrency(selectedVehicle.weeklyFee)}`
                    : undefined
                }
              />
              <MoneyField
                id="otherDeductions" label="Outros"
                value={amounts.otherDeductions} onChange={setAmount('otherDeductions')}
              />

              {/* Imposto — calculado, não escrito.
                  
                  É um campo de leitura de propósito. Se fosse editável, alguém
                  acabaria por o corrigir à mão e o valor divergiria dos 6% que
                  o motorista consegue verificar sozinho a partir das receitas.
                  Uma semana que precise de correção tem o cancelamento com
                  estorno, que deixa rasto. */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="taxAmount">
                  Imposto{totals?.taxRate ? ` (${totals.taxRate}%)` : ''}
                </Label>
                <div className="relative max-w-[240px]">
                  <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
                    €
                  </span>
                  <Input
                    id="taxAmount"
                    readOnly
                    tabIndex={-1}
                    value={totals ? totals.taxAmount.toFixed(2) : ''}
                    placeholder="0.00"
                    className="cursor-default bg-muted pl-8 tabular-nums"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {totals && totals.taxBase > 0
                    ? `${totals.taxRate}% sobre ${formatCurrency(totals.taxBase)} de Uber e Bolt. Outras receitas não entram na base.`
                    : 'Calculado sobre as receitas da Uber e da Bolt. A taxa vem das Configurações.'}
                </p>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rate">Percentagem da empresa</Label>
                <div className="relative max-w-[200px]">
                  <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
                    %
                  </span>
                  <Input
                    id="rate" type="number" step="0.01" min="0" max="100"
                    inputMode="decimal"
                    placeholder={String(effectiveRate)}
                    className="pl-7 tabular-nums"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Em branco usa {effectiveRate}%, o valor das Configurações. Incide sobre o
                  lucro, depois de todas as deduções acima.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Coluna direita: resultado ── */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div
            className="overflow-hidden rounded-xl p-5 shadow-brand sm:p-6"
            style={{ background: 'linear-gradient(135deg, #0d6b4f 0%, #0a5440 100%)' }}
          >
            <p className="text-sm text-white/70">Total da semana</p>
            <p className="mt-1 flex items-baseline gap-2 text-4xl font-bold tracking-tight text-white tabular-nums">
              {totals ? formatCurrency(totals.netToDriver) : '—'}
              {calculating && (
                <Loader2 className="h-4 w-4 animate-spin text-white/60" aria-hidden="true" />
              )}
            </p>
            <p className="mt-2 text-xs text-white/70">
              {selectedDriver ? `A creditar a ${selectedDriver.name}` : 'Selecione o motorista'}
            </p>

            {totals && (
              <dl className="mt-4 space-y-1 border-t border-white/15 pt-3 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-white/70">Receitas</dt>
                  <dd className="tabular-nums text-white/90">
                    + {formatCurrency(totals.grossRevenue)}
                  </dd>
                </div>
                {/* O imposto aparece separado das outras despesas, embora entre
                    nelas na conta: é a linha nova e o administrador precisa de
                    a ver isolada para conferir. Diluído no total de despesas,
                    ninguém consegue verificar se os 6% estão certos. */}
                {totals.taxAmount > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/70">
                      Imposto ({totals.taxRate}% de {formatCurrency(totals.taxBase)})
                    </dt>
                    <dd className="tabular-nums text-white/90">
                      − {formatCurrency(totals.taxAmount)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-white/70">
                    {totals.taxAmount > 0 ? 'Outras despesas' : 'Despesas'}
                  </dt>
                  <dd className="tabular-nums text-white/90">
                    − {formatCurrency(totals.operatingCosts - totals.taxAmount)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-white/15 pt-1">
                  <dt className="text-white/70">Lucro</dt>
                  <dd className="tabular-nums text-white/90">
                    {formatCurrency(totals.profitBase)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/70">Comissão ({totals.commissionRate}%)</dt>
                  <dd className="tabular-nums text-white/90">
                    − {formatCurrency(totals.commissionAmount)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-white/15 pt-1 font-medium">
                  <dt className="text-white">Ao motorista</dt>
                  <dd className="tabular-nums text-white">
                    {formatCurrency(totals.netToDriver)}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          {totals && totals.netToDriver < 0 && (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-300"
                aria-hidden="true"
              />
              <p className="text-xs text-red-700 dark:text-red-300">
                As despesas superam as receitas. Registar isto vai <strong>reduzir</strong> o
                saldo do motorista.
              </p>
            </div>
          )}

          <Card className="shadow-card">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base">Comentários</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="space-y-1.5">
                <Label htmlFor="settlement-notes" className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  Para o motorista
                </Label>
                <Textarea
                  id="settlement-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações sobre esta semana. O motorista vê este texto."
                  rows={3}
                />
              </div>

              {/* Campo separado, e não uma marca no mesmo texto: o servidor
                  omite este na resposta ao motorista, e misturar os dois num
                  campo só tornaria impossível filtrar. */}
              <div className="space-y-1.5">
                <Label htmlFor="settlement-internal" className="flex items-center gap-1.5">
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  Nota interna
                </Label>
                <Textarea
                  id="settlement-internal"
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Só a administração vê. Não sai na resposta ao motorista."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <Button onClick={handleRegisterClick} disabled={busy || blocked} className="w-full">
              {registering
                ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />A registar…</>)
                : (<><Wallet className="mr-2 h-4 w-4" />Registar e creditar</>)}
            </Button>
            <Button
              variant="outline" onClick={handleDraftClick} disabled={busy || blocked}
              className="w-full"
            >
              {savingDraft
                ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar…</>)
                : (<><Save className="mr-2 h-4 w-4" />Guardar rascunho</>)}
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmação: move dinheiro e o fecho fica imutável depois disto. */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registar o fecho?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <strong>{formatCurrency(totals?.netToDriver ?? 0)}</strong> serão creditados a{' '}
                  <strong>{selectedDriver?.name}</strong>, referentes à semana de{' '}
                  {br(weekStart)} a {br(weekEnd)}.
                </p>
                <p className="text-muted-foreground">
                  Depois de registado o fecho não pode ser editado. Para corrigir, será preciso
                  cancelá-lo e criar outro.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={registering}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); registerNow(); }}
              disabled={registering}
            >
              {registering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registar e creditar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
