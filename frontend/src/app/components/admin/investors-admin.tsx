// src/app/components/admin/investors-admin.tsx
//
// Investidores, do lado da administração: quem são, quanto têm, registar
// depósitos e decidir resgates.
//
// ─── O QUE ESTA TELA TEM DE RESPONDER ───────────────────────────────────────
//
// Primeiro: quanto é que a empresa deve, ao todo. É o número que interessa a
// quem gere a tesouraria, e aparece antes de qualquer lista — somado ao que se
// deve aos motoristas, porque para a tesouraria é tudo dívida da mesma casa.
//
// Segundo: há alguma coisa à espera de mim? Os pedidos de resgate por decidir
// vêm a seguir, e só depois a lista de contas.
//
// ─── O DEPÓSITO É REGISTADO, NÃO RECEBIDO ───────────────────────────────────
//
// O site não recebe dinheiro. Quem transfere, transfere para a conta da
// empresa, e alguém confirma no banco antes de registar aqui. É por isso que o
// formulário tem data: a transferência de sexta que só é conferida na segunda
// tem de render desde sexta.

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
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
import {
  Check, Coins, Landmark, Loader2, Plus, Scale, TrendingUp, UserPlus, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/context/AuthContext';
import { investorsService, type Bucket } from '@/shared/services/investors.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import { ApiError } from '@/shared/lib/api-client';

const dia = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
const n = (s: string) => Number(s.replace(',', '.')) || 0;
const hoje = () => new Date().toISOString().slice(0, 10);

export function InvestorsAdmin() {
  const { user } = useAuth();
  const podeMexer = user?.role === 'ADMIN';

  const qc = useQueryClient();
  const [aCriar, setACriar] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const contasQ = useQuery({
    queryKey: queryKeys.investors.accounts,
    queryFn: () => investorsService.listAccounts(),
  });
  const overviewQ = useQuery({
    queryKey: queryKeys.investors.overview,
    queryFn: () => investorsService.overview(),
  });
  const pendentesQ = useQuery({
    queryKey: queryKeys.investors.pending,
    queryFn: () => investorsService.pendingWithdrawals(),
  });

  const decidir = useMutation({
    mutationFn: ({ id, approve, decision }: { id: string; approve: boolean; decision?: string }) =>
      investorsService.decideWithdrawal(id, { approve, decision }),
    onSuccess: (_d, v) => {
      toast.success(v.approve ? 'Resgate marcado como pago.' : 'Pedido recusado.');
      void qc.invalidateQueries({ queryKey: queryKeys.investors.all });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Não foi possível decidir o pedido.'),
  });

  const contas = contasQ.data?.accounts ?? [];
  const pendentes = pendentesQ.data?.withdrawals ?? [];
  const o = overviewQ.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investidores"
        subtitle="Contas de investimento, depósitos e resgates. O portal deles é invest.dragonfleet.pt."
        actions={podeMexer ? (
          <Button onClick={() => setACriar(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Nova conta
          </Button>
        ) : undefined}
      />

      {/* ── Os totais ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Total
          icon={Landmark}
          titulo="Capital dos investidores"
          valor={o?.investors.capital}
          nota={`${o?.investors.accounts ?? 0} ${o?.investors.accounts === 1 ? 'conta' : 'contas'}`}
        />
        <Total
          icon={TrendingUp}
          titulo="Rendimento acumulado"
          valor={o?.investors.earnings}
          nota="Já devido, ainda não pago"
        />
        <Total
          icon={Coins}
          titulo="Devido aos motoristas"
          valor={o?.driversOwed}
          nota="Saldos e investimentos"
        />
        <Total
          icon={Scale}
          titulo="Total a pagar"
          valor={o?.totalLiability}
          nota="Investidores + motoristas"
          destaque
        />
      </div>

      {/* ── A fila de pedidos ────────────────────────────────────────────── */}
      {pendentes.length > 0 && (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <h2 className="font-semibold">
              Resgates à espera de decisão ({pendentes.length})
            </h2>
            <div className="mt-4 space-y-3">
              {pendentes.map((w) => (
                <div
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {formatCurrency(w.amount)}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {w.bucket === 'CAPITAL' ? 'de capital' : 'de rendimento'}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {w.investor?.name} · pedido a {dia(w.createdAt)} · pagável a partir de{' '}
                      {dia(w.availableOn)}
                    </p>
                    {w.note && <p className="mt-0.5 text-sm text-muted-foreground">“{w.note}”</p>}
                  </div>

                  {podeMexer && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={decidir.isPending}
                        onClick={() => {
                          const decision = window.prompt('Motivo da recusa (opcional):') ?? undefined;
                          decidir.mutate({ id: w.id, approve: false, decision });
                        }}
                      >
                        <X className="mr-1 h-3.5 w-3.5" />
                        Recusar
                      </Button>
                      <Button
                        size="sm"
                        disabled={decidir.isPending}
                        onClick={() => decidir.mutate({ id: w.id, approve: true })}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Marcar como pago
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Dito à letra porque é o erro fácil de cometer: o botão não move
                dinheiro nenhum, só regista que já foi movido. */}
            <p className="mt-4 text-xs text-muted-foreground">
              Marcar como pago não faz a transferência — confirma que ela já foi feita.
              Faça primeiro a transferência no banco.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── A lista de contas ────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {contasQ.isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : contas.length === 0 ? (
            <div className="p-10 text-center">
              <Landmark className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Ainda não há investidores</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Crie a primeira conta e entregue as credenciais ao investidor.
                Ele entra em invest.dragonfleet.pt.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Investidor</TableHead>
                  <TableHead className="text-right">Capital</TableHead>
                  <TableHead className="text-right">Rendimento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contas.map((c) => (
                  <TableRow key={c.accountId}>
                    <TableCell>
                      <p className="font-medium">{c.userName}</p>
                      <p className="text-xs text-muted-foreground">{c.userEmail}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(c.capital)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {formatCurrency(c.earnings)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(c.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.annualRate}%</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setAberta(c.accountId)}>
                        Abrir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {aCriar && <CriarDialog onClose={() => setACriar(false)} />}
      {aberta && (
        <ContaDialog accountId={aberta} podeMexer={podeMexer} onClose={() => setAberta(null)} />
      )}
    </div>
  );
}

// ─── Peças ──────────────────────────────────────────────────────────────────

function Total({ icon: Icon, titulo, valor, nota, destaque }: {
  icon: typeof Landmark; titulo: string; valor?: number; nota: string; destaque?: boolean;
}) {
  return (
    <Card className={destaque ? 'border-brand-500/40' : undefined}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <p className="text-xs">{titulo}</p>
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums">
          {valor === undefined ? '—' : formatCurrency(valor)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  );
}

// ─── Criar uma conta ────────────────────────────────────────────────────────

function CriarDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: '', email: '', password: '', phone: '',
    annualRate: '5', noticeDays: '0', startDate: hoje(), notes: '',
  });

  const criar = useMutation({
    mutationFn: () => investorsService.create({
      name: f.name.trim(),
      email: f.email.trim(),
      password: f.password,
      phone: f.phone.trim() || undefined,
      annualRate: n(f.annualRate),
      noticeDays: Number(f.noticeDays) || 0,
      startDate: f.startDate,
      notes: f.notes.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Conta criada. Entregue as credenciais ao investidor.');
      void qc.invalidateQueries({ queryKey: queryKeys.investors.all });
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Não foi possível criar a conta.'),
  });

  const valido = f.name.trim().length >= 2 && /.+@.+\..+/.test(f.email) && f.password.length >= 8;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova conta de investidor</DialogTitle>
          <DialogDescription>
            A conta é criada por si — não há registo público no portal.
            A palavra-passe que escrever aqui é a que o investidor vai usar da primeira vez.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <Campo id="name" label="Nome" value={f.name}
            onChange={(v) => setF({ ...f, name: v })} placeholder="Nome completo" />
          <Campo id="email" label="Email" type="email" value={f.email}
            onChange={(v) => setF({ ...f, email: v })} placeholder="nome@exemplo.pt" />
          <Campo id="password" label="Palavra-passe inicial" value={f.password}
            onChange={(v) => setF({ ...f, password: v })} placeholder="Mínimo 8 caracteres" />
          <Campo id="phone" label="Telemóvel (opcional)" value={f.phone}
            onChange={(v) => setF({ ...f, phone: v })} placeholder="912 345 678" />

          <div className="grid grid-cols-3 gap-3">
            <Campo id="rate" label="Taxa anual %" value={f.annualRate}
              onChange={(v) => setF({ ...f, annualRate: v })} />
            <Campo id="notice" label="Aviso prévio (dias)" value={f.noticeDays}
              onChange={(v) => setF({ ...f, noticeDays: v })} />
            <Campo id="start" label="A render desde" type="date" value={f.startDate}
              onChange={(v) => setF({ ...f, startDate: v })} />
          </div>

          <div>
            <Label htmlFor="notes">Notas internas</Label>
            <Textarea
              id="notes"
              value={f.notes}
              onChange={(e) => setF({ ...f, notes: e.target.value })}
              placeholder="Referência do contrato, condições combinadas…"
              className="mt-1.5"
              rows={2}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Só visível aqui. O investidor não vê este campo.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!valido || criar.isPending} onClick={() => criar.mutate()}>
            {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar conta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Abrir uma conta ────────────────────────────────────────────────────────

function ContaDialog({ accountId, podeMexer, onClose }: {
  accountId: string; podeMexer: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queryKeys.investors.account(accountId),
    queryFn: () => investorsService.account(accountId),
  });

  const [deposito, setDeposito] = useState({ amount: '', day: hoje(), description: '' });
  const [taxa, setTaxa] = useState({ annualRate: '', effectiveFrom: hoje() });
  const [acerto, setAcerto] = useState<{ bucket: Bucket; amount: string; description: string }>({
    bucket: 'CAPITAL', amount: '', description: '',
  });

  function aoMudar(msg: string) {
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: queryKeys.investors.all });
  }
  const aoFalhar = (e: unknown) =>
    toast.error(e instanceof ApiError ? e.message : 'Não foi possível concluir a operação.');

  const depositar = useMutation({
    mutationFn: () => investorsService.deposit(accountId, {
      amount: n(deposito.amount),
      day: deposito.day,
      description: deposito.description.trim() || undefined,
    }),
    onSuccess: () => { aoMudar('Depósito registado.'); setDeposito({ amount: '', day: hoje(), description: '' }); },
    onError: aoFalhar,
  });

  const mudarTaxa = useMutation({
    mutationFn: () => investorsService.setRate(accountId, {
      annualRate: n(taxa.annualRate),
      effectiveFrom: taxa.effectiveFrom,
    }),
    onSuccess: () => { aoMudar('Taxa atualizada.'); setTaxa({ annualRate: '', effectiveFrom: hoje() }); },
    onError: aoFalhar,
  });

  const acertar = useMutation({
    mutationFn: () => investorsService.adjust(accountId, {
      bucket: acerto.bucket,
      amount: n(acerto.amount),
      description: acerto.description.trim(),
    }),
    onSuccess: () => { aoMudar('Acerto registado.'); setAcerto({ bucket: 'CAPITAL', amount: '', description: '' }); },
    onError: aoFalhar,
  });

  const d = q.data;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{d?.account.user.name ?? 'Conta de investidor'}</DialogTitle>
          <DialogDescription>
            {d?.account.user.email}
            {d && ` · a render desde ${dia(d.account.startDate)}`}
          </DialogDescription>
        </DialogHeader>

        {q.isLoading || !d ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-6">
            {/* Saldos */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Mini titulo="Capital" valor={d.balance.capital}
                nota={d.balance.pendingCapital > 0
                  ? `${formatCurrency(d.balance.pendingCapital)} reservados`
                  : 'Sem pedidos pendentes'} />
              <Mini titulo="Rendimento" valor={d.balance.earnings}
                nota={`Pago até ${dia(d.account.accruedThrough)}`} />
              <Mini titulo="Total" valor={d.balance.total}
                nota={`Já levantou ${formatCurrency(d.balance.withdrawn)}`} />
            </div>

            {podeMexer && (
              <>
                {/* Depósito */}
                <Bloco titulo="Registar depósito">
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
                    <Campo id="dep-amount" label="Valor" value={deposito.amount}
                      onChange={(v) => setDeposito({ ...deposito, amount: v })} placeholder="0,00" />
                    <Campo id="dep-day" label="Data" type="date" value={deposito.day}
                      onChange={(v) => setDeposito({ ...deposito, day: v })} />
                    <Campo id="dep-desc" label="Descrição (opcional)" value={deposito.description}
                      onChange={(v) => setDeposito({ ...deposito, description: v })}
                      placeholder="Transferência de 12/03" />
                  </div>
                  <Button
                    className="mt-3"
                    disabled={n(deposito.amount) <= 0 || depositar.isPending}
                    onClick={() => depositar.mutate()}
                  >
                    {depositar.isPending
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <Plus className="mr-2 h-4 w-4" />}
                    Registar
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Com data anterior a hoje, o rendimento dos dias em falta é recalculado.
                  </p>
                </Bloco>

                {/* Taxa */}
                <Bloco titulo="Alterar a taxa">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo id="rate-v" label="Nova taxa anual %" value={taxa.annualRate}
                      onChange={(v) => setTaxa({ ...taxa, annualRate: v })}
                      placeholder={String(d.account.rates[0]?.annualRate ?? '')} />
                    <Campo id="rate-d" label="A partir de" type="date" value={taxa.effectiveFrom}
                      onChange={(v) => setTaxa({ ...taxa, effectiveFrom: v })} />
                  </div>
                  <Button
                    className="mt-3"
                    variant="outline"
                    disabled={!taxa.annualRate || mudarTaxa.isPending}
                    onClick={() => mudarTaxa.mutate()}
                  >
                    {mudarTaxa.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar taxa
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Os dias já pagos ficam com a taxa antiga. Não é possível alterar o passado —
                    para corrigir um erro, use um acerto.
                  </p>
                </Bloco>

                {/* Acerto */}
                <Bloco titulo="Acerto manual">
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
                    <div>
                      <Label>Onde</Label>
                      <Select
                        value={acerto.bucket}
                        onValueChange={(v) => setAcerto({ ...acerto, bucket: v as Bucket })}
                      >
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CAPITAL">Capital</SelectItem>
                          <SelectItem value="EARNINGS">Rendimento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Campo id="adj-amount" label="Valor (± )" value={acerto.amount}
                      onChange={(v) => setAcerto({ ...acerto, amount: v })} placeholder="-100" />
                    <Campo id="adj-desc" label="Motivo (obrigatório)" value={acerto.description}
                      onChange={(v) => setAcerto({ ...acerto, description: v })}
                      placeholder="Depósito registado com valor trocado" />
                  </div>
                  <Button
                    className="mt-3"
                    variant="outline"
                    disabled={!acerto.amount || acerto.description.trim().length < 3 || acertar.isPending}
                    onClick={() => acertar.mutate()}
                  >
                    {acertar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Registar acerto
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    O motivo fica no extrato do investidor, visível para ele.
                  </p>
                </Bloco>
              </>
            )}

            {/* Extrato */}
            <Bloco titulo="Últimos movimentos">
              <div className="max-h-72 overflow-y-auto">
                {d.movements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem movimentos.</p>
                ) : d.movements.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm">{m.description ?? m.kind}</p>
                      <p className="text-xs text-muted-foreground">
                        {dia(m.day)} · {m.bucket === 'CAPITAL' ? 'capital' : 'rendimento'}
                      </p>
                    </div>
                    <p className={`shrink-0 text-sm tabular-nums ${m.amount >= 0 ? 'text-success' : ''}`}>
                      {m.amount >= 0 ? '+' : '−'} {formatCurrency(Math.abs(m.amount))}
                    </p>
                  </div>
                ))}
              </div>
            </Bloco>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Mini({ titulo, valor, nota }: { titulo: string; valor: number; nota: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(valor)}</p>
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
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5"
      />
    </div>
  );
}
