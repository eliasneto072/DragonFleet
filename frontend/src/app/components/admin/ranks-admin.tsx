// src/app/components/admin/ranks-admin.tsx
//
// Níveis, do lado da administração: as metas e as vantagens de cada nível, e
// quem está em cada um.
//
// As metas nascem a zero e zero significa "não conta" — enquanto o Diogo não
// as definir, toda a gente fica no nível de entrada e nada muda na frota. É o
// contrário do habitual (ligar primeiro, configurar depois), e é de propósito:
// um sistema de níveis que começa a mexer sozinho no dia do deploy dava ranks
// altos a quem não fez nada por eles.

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
import { AlertCircle, Loader2, Pencil, ShieldCheck, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/context/AuthContext';
import { ranksService, tierIndex, type RankConfig, type Tier } from '@/shared/services/ranks.service';
import { queryKeys } from '@/shared/lib/query-keys';
import { invalidateAfterRank } from '@/shared/lib/invalidate';
import { formatCurrency } from '@/shared/lib/format';
import {
  RankBadge, rankGoals, rankGradient, rankPerks, readableOn,
} from '@/app/components/ranks/rank-visuals';

const dia = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const n = (s: string) => Number(s.replace(',', '.')) || 0;

// ── Editar um nível ───────────────────────────────────────────────────────────

function ConfigDialog({ config, onClose }: { config: RankConfig | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(() => ({
    label: config?.label ?? '',
    color: config?.color ?? '#64748B',
    minSeasonRevenue: String(config?.minSeasonRevenue ?? 0),
    minInvested: String(config?.minInvested ?? 0),
    minBalance: String(config?.minBalance ?? 0),
    minWeeks: String(config?.minWeeks ?? 0),
    requireValidDocuments: config?.requireValidDocuments ?? true,
    fuelDiscount: String(config?.fuelDiscount ?? 0),
    vehicleDiscount: String(config?.vehicleDiscount ?? 0),
    tollsDiscount: String(config?.tollsDiscount ?? 0),
    investmentRateBonus: String(config?.investmentRateBonus ?? 0),
    perks: config?.perks ?? '',
  }));
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const m = useMutation({
    mutationFn: () => ranksService.updateConfig(config!.tier, {
      label: f.label.trim(),
      color: f.color,
      minSeasonRevenue: n(f.minSeasonRevenue),
      minInvested: n(f.minInvested),
      minBalance: n(f.minBalance),
      minWeeks: Math.round(n(f.minWeeks)),
      requireValidDocuments: f.requireValidDocuments,
      fuelDiscount: n(f.fuelDiscount),
      vehicleDiscount: n(f.vehicleDiscount),
      tollsDiscount: n(f.tollsDiscount),
      investmentRateBonus: n(f.investmentRateBonus),
      perks: f.perks.trim() || null,
    }),
    onSuccess: () => {
      invalidateAfterRank(qc);
      toast.success('Nível atualizado.');
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível guardar.'),
  });

  const corValida = /^#[0-9a-fA-F]{6}$/.test(f.color);

  return (
    <Dialog open={!!config} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nível {config ? tierIndex(config.tier) : ''}</DialogTitle>
          <DialogDescription>
            As metas a zero não contam. O motorista sobe assim que cumpre todas as que definir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rk-label">Nome</Label>
              <Input id="rk-label" value={f.label} onChange={(e) => set('label', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rk-color">Cor</Label>
              <div className="flex items-center gap-2">
                <input
                  id="rk-color" type="color" value={corValida ? f.color : '#64748B'}
                  onChange={(e) => set('color', e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
                />
                <Input
                  value={f.color} onChange={(e) => set('color', e.target.value)}
                  className="w-28 font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Pré-visualização: a cor escolhida é o fundo do cartão do motorista,
              e escolher às cegas dava cartões ilegíveis. */}
          <div
            className="rounded-lg p-4"
            style={{ background: rankGradient(corValida ? f.color : '#64748B'), color: readableOn(corValida ? f.color : '#64748B') }}
          >
            <p className="text-xs" style={{ opacity: 0.8 }}>O seu nível</p>
            <p className="text-xl font-bold">{f.label || 'Sem nome'}</p>
          </div>

          <div>
            <p className="mb-2 font-medium">Metas</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rk-rev">Faturação na temporada (€)</Label>
                <Input id="rk-rev" type="number" min="0" step="100" value={f.minSeasonRevenue}
                  onChange={(e) => set('minSeasonRevenue', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rk-inv">Aplicado em investimentos (€)</Label>
                <Input id="rk-inv" type="number" min="0" step="50" value={f.minInvested}
                  onChange={(e) => set('minInvested', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rk-bal">Saldo em conta (€)</Label>
                <Input id="rk-bal" type="number" min="0" step="50" value={f.minBalance}
                  onChange={(e) => set('minBalance', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rk-weeks">Semanas com fecho</Label>
                <Input id="rk-weeks" type="number" min="0" max="60" step="1" value={f.minWeeks}
                  onChange={(e) => set('minWeeks', e.target.value)} />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-border p-3">
              <div>
                <p className="font-medium">Exigir documentos em dia</p>
                <p className="text-xs text-muted-foreground">
                  Com documentos expirados, o motorista não sobe a este nível.
                </p>
              </div>
              <Switch checked={f.requireValidDocuments}
                onCheckedChange={(v: boolean) => set('requireValidDocuments', v)} />
            </div>
          </div>

          <div>
            <p className="mb-2 font-medium">Vantagens</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rk-fuel">Desconto no combustível (%)</Label>
                <Input id="rk-fuel" type="number" min="0" max="100" step="0.5" value={f.fuelDiscount}
                  onChange={(e) => set('fuelDiscount', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rk-veh">Desconto na viatura (%)</Label>
                <Input id="rk-veh" type="number" min="0" max="100" step="0.5" value={f.vehicleDiscount}
                  onChange={(e) => set('vehicleDiscount', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rk-toll">Desconto nas portagens (%)</Label>
                <Input id="rk-toll" type="number" min="0" max="100" step="0.5" value={f.tollsDiscount}
                  onChange={(e) => set('tollsDiscount', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rk-bonus">Bónus nos investimentos (p.p.)</Label>
                <Input id="rk-bonus" type="number" min="0" max="50" step="0.1" value={f.investmentRateBonus}
                  onChange={(e) => set('investmentRateBonus', e.target.value)} />
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label htmlFor="rk-perks">Outras vantagens (uma por linha)</Label>
              <Textarea id="rk-perks" rows={3} value={f.perks}
                onChange={(e) => set('perks', e.target.value)}
                placeholder={'Prioridade na escolha de viatura\nApoio de 50 € na inspeção'} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Os descontos ficam registados e visíveis ao motorista. A aplicação automática ao fecho
              semanal entra na fase seguinte; até lá, aplique-os ao registar o fecho.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={m.isPending}>
            Cancelar
          </Button>
          <Button className="w-full sm:w-auto" disabled={m.isPending || !corValida || f.label.trim().length < 2}
            onClick={() => m.mutate()}>
            {m.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar…</>) : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── A tela ────────────────────────────────────────────────────────────────────

export function RanksAdmin() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [editar, setEditar] = useState<RankConfig | null>(null);
  const [tier, setTier] = useState<Tier | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const configsQ = useQuery({
    queryKey: queryKeys.ranks.configs,
    queryFn: () => ranksService.configs(),
  });

  const overviewQ = useQuery({
    queryKey: queryKeys.ranks.overview(tier, search.trim()),
    queryFn: () => ranksService.overview({
      tier: tier === 'ALL' ? undefined : tier,
      search,
    }),
  });

  const configs = configsQ.data?.configs ?? [];
  const mapa = new Map(configs.map((c) => [c.tier, c]));
  const counts = overviewQ.data?.counts ?? [];
  const drivers = overviewQ.data?.drivers ?? [];
  const season = overviewQ.data?.season;

  const semMetas = configs.length > 0
    && configs.every((c) => !c.minSeasonRevenue && !c.minInvested && !c.minBalance && !c.minWeeks);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Níveis"
        subtitle={season
          ? `Temporada de ${dia(season.start)} a ${dia(season.end)}`
          : 'Metas, vantagens e quem está em cada nível'}
        icon={<Trophy className="h-5 w-5" />}
      />

      {semMetas && (
        <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Ainda não há metas definidas, por isso toda a gente está no nível de entrada e nada mudou
            para os motoristas. Defina as metas de cada nível para o sistema começar a funcionar.
          </p>
        </div>
      )}

      <Tabs defaultValue="levels">
        <TabsList>
          <TabsTrigger value="levels">Níveis</TabsTrigger>
          <TabsTrigger value="drivers">Motoristas</TabsTrigger>
        </TabsList>

        {/* ── Os cinco níveis ── */}
        <TabsContent value="levels" className="space-y-3">
          {configsQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            configs.map((c) => {
              const quantos = counts.find((x) => x.tier === c.tier)?.count ?? 0;
              const metas = rankGoals(c, formatCurrency);
              const vantagens = rankPerks(c);
              return (
                <Card key={c.tier} className="overflow-hidden shadow-card">
                  <div className="h-1.5 w-full" style={{ background: c.color }} aria-hidden="true" />
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-lg font-semibold">
                          <span className="text-muted-foreground">{tierIndex(c.tier)}.</span>
                          {c.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {quantos} motorista{quantos === 1 ? '' : 's'} neste nível
                        </p>
                      </div>
                      {isAdmin && (
                        <Button size="sm" variant="outline" onClick={() => setEditar(c)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />Editar
                        </Button>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Metas</p>
                        <ul className="mt-1 space-y-0.5">
                          {metas.length
                            ? metas.map((mm) => <li key={mm}>{mm}</li>)
                            : <li className="text-muted-foreground">Sem metas — nível de entrada</li>}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vantagens</p>
                        <ul className="mt-1 space-y-0.5">
                          {vantagens.length
                            ? vantagens.map((v) => <li key={v}>{v}</li>)
                            : <li className="text-muted-foreground">Sem vantagens definidas</li>}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ── Quem está em cada nível ── */}
        <TabsContent value="drivers" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input placeholder="Procurar motorista…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
            <Select value={tier} onValueChange={(v) => setTier(v as Tier | 'ALL')}>
              <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os níveis</SelectItem>
                {configs.map((c) => (
                  <SelectItem key={c.tier} value={c.tier}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card className="shadow-card">
            <CardContent className="p-0">
              {overviewQ.isLoading ? (
                <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : drivers.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum motorista neste filtro. Os níveis são calculados todas as noites e quando o
                  motorista abre o portal.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Motorista</TableHead>
                        <TableHead>Nível</TableHead>
                        <TableHead className="text-right">Faturação</TableHead>
                        <TableHead className="text-right">Investido</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead className="text-right">Semanas</TableHead>
                        <TableHead>Notas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drivers.map((d) => (
                        <TableRow key={d.userId}>
                          <TableCell>
                            <span className="block font-medium">{d.name}</span>
                            <span className="block text-xs text-muted-foreground">{d.email}</span>
                          </TableCell>
                          <TableCell><RankBadge config={mapa.get(d.tier)} /></TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(d.seasonRevenue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(d.invested)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(d.balance)}</TableCell>
                          <TableCell className="text-right tabular-nums">{d.weeks}</TableCell>
                          <TableCell className="space-y-1 text-xs text-muted-foreground">
                            {d.floorTier && d.floorUntil && tierIndex(d.floorTier) > tierIndex(d.earnedTier) && (
                              <span className="flex items-center gap-1">
                                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                Garantido até {dia(d.floorUntil)}
                              </span>
                            )}
                            {!d.documentsOk && <span className="block text-destructive">Documentos expirados</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfigDialog key={editar?.tier ?? 'none'} config={editar} onClose={() => setEditar(null)} />
    </div>
  );
}
