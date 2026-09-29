// src/app/components/admin/fleet-stats.tsx
//
// Estatísticas da frota: o que entrou, o que saiu, e quanto ficou.
//
// ═══ O NÚMERO PRINCIPAL ═════════════════════════════════════════════════════
//
// O lucro segue a regra do dono, e não uma convenção contabilística:
//
//   motorista normal   →  conta o ALUGUER da viatura
//   o dono, a conduzir →  conta o LÍQUIDO da semana dele
//
// A comissão dos outros motoristas está no ecrã mas FORA do lucro, porque foi
// isso que ele pediu ("nos outros só a comissão do veículo mais nada"). Está
// escrito ao lado do número — um total que inclui ou exclui coisas sem dizer
// quais é um número em que não se pode confiar para decidir nada.
//
// ─── E O QUE ELE NÃO SABE ───────────────────────────────────────────────────
//
// Seguro, manutenção, pneus, IUC, prestações. Nada disso existe na base de
// dados. O ecrã diz-lo, em vez de deixar o número passar por lucro final: a
// diferença entre "lucro" e "lucro antes destes custos" são milhares de euros,
// e quem olha para um painel assume sempre o primeiro.
//
// ─── PORQUE É QUE NÃO HÁ "CARRO MAIS RENTÁVEL POR KM" ───────────────────────
//
// Porque os quilómetros são opcionais e acabaram de existir. Um rácio
// calculado sobre duas semanas registadas, ao lado de carros sem nenhuma,
// ordenaria a frota por quem preencheu o formulário — e pareceria uma
// conclusão sobre os carros.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertCircle, BatteryCharging, Car, Fuel, Gauge, Loader2, Receipt,
  Route, TrendingDown, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/app/components/ui/table';
import {
  analyticsService, type CarroStats, type MotoristaStats, type VehicleEnergy,
} from '@/features/admin/services/analytics.service';
import { formatCurrency, formatCurrencyCompact, formatNumber } from '@/shared/lib/format';

const TOOLTIP: React.CSSProperties = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  boxShadow: 'var(--shadow-md)',
};

const ENERGIA: Record<VehicleEnergy, { nome: string; icon: typeof Fuel }> = {
  FUEL: { nome: 'Combustível', icon: Fuel },
  ELECTRIC: { nome: 'Elétrico', icon: BatteryCharging },
  HYBRID: { nome: 'Híbrido', icon: Fuel },
};

function dia(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Os períodos que se escolhem com um clique. */
const PERIODOS = {
  mes: 'Este mês',
  ano: 'Este ano',
  '12m': 'Últimos 12 meses',
  tudo: 'Desde sempre',
} as const;
type PeriodoKey = keyof typeof PERIODOS;

function intervalo(p: PeriodoKey): { from: string; to: string } {
  const hoje = new Date();
  const to = dia(hoje);
  switch (p) {
    case 'mes':
      return { from: dia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), to };
    case 'ano':
      return { from: dia(new Date(hoje.getFullYear(), 0, 1)), to };
    case '12m': {
      const d = new Date(hoje);
      d.setFullYear(d.getFullYear() - 1);
      return { from: dia(d), to };
    }
    case 'tudo':
      // 2020 e não uma data vazia: o endpoint sem datas assume o ano corrente,
      // e "desde sempre" tem de dizer explicitamente que quer tudo.
      return { from: '2020-01-01', to };
  }
}

/** Um número grande com um rótulo. O mosaico que se repete no topo. */
function Total({ titulo, valor, nota, icon: Icon, destaque }: {
  titulo: string;
  valor: string;
  nota?: string;
  icon: typeof Wallet;
  destaque?: boolean;
}) {
  return (
    <Card className={destaque ? 'border-brand-500/40 bg-brand-50/50 dark:bg-emerald-950/20' : undefined}>
      <CardContent className="p-4">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {titulo}
        </p>
        <p className={`mt-1 font-bold tabular-nums ${destaque ? 'text-2xl' : 'text-xl'}`}>
          {valor}
        </p>
        {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}

/** Um destaque: um nome, um número, e o que ele quer dizer. */
function Destaque({ titulo, nome, valor, nota, icon: Icon }: {
  titulo: string; nome: string; valor: string; nota?: string; icon: typeof Users;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {titulo}
        </p>
        <p className="mt-1.5 truncate font-semibold">{nome}</p>
        <p className="text-sm tabular-nums text-muted-foreground">{valor}</p>
        {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}

export function FleetStats() {
  const [periodo, setPeriodo] = useState<PeriodoKey>('ano');
  const [personalizado, setPersonalizado] = useState<{ from: string; to: string } | null>(null);

  const alcance = personalizado ?? intervalo(periodo);

  const q = useQuery({
    queryKey: ['analytics', 'fleet', alcance.from, alcance.to],
    queryFn: () => analyticsService.getFleet(alcance),
  });

  const f = q.data?.fleet;
  const t = f?.totais;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Estatísticas"
        subtitle="O que a frota faturou, o que gastou e quanto ficou"
        icon={<Gauge className="h-5 w-5" />}
      />

      {/* ── Período ──────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PERIODOS) as PeriodoKey[]).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={!personalizado && periodo === k ? 'default' : 'outline'}
                onClick={() => { setPersonalizado(null); setPeriodo(k); }}
              >
                {PERIODOS[k]}
              </Button>
            ))}
          </div>

          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="est-de" className="text-xs">De</Label>
              <Input
                id="est-de" type="date" className="h-9 w-[150px]"
                value={alcance.from}
                onChange={(e) => setPersonalizado({ ...alcance, from: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="est-ate" className="text-xs">Até</Label>
              <Input
                id="est-ate" type="date" className="h-9 w-[150px]"
                value={alcance.to}
                onChange={(e) => setPersonalizado({ ...alcance, to: e.target.value })}
              />
            </div>
            {q.isFetching && <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>

      {q.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : q.isError ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-sm">Não foi possível carregar as estatísticas.</p>
            <Button size="sm" variant="outline" onClick={() => q.refetch()}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : !t || t.semanas === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Gauge className="mx-auto h-10 w-10 text-muted-foreground opacity-40" aria-hidden="true" />
            <p className="mt-3 font-medium">Nenhuma semana fechada neste período.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              As estatísticas contam apenas fechos <strong>registados</strong> — um rascunho
              ainda não é dinheiro. Alargue o período ou registe os fechos em falta.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── O lucro, e o que entrou ─────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Total
              destaque
              titulo="Lucro da empresa"
              valor={formatCurrency(t.lucroEmpresa)}
              nota="Aluguer dos carros + as suas semanas"
              icon={Wallet}
            />
            <Total
              titulo="Faturação bruta"
              valor={formatCurrency(t.faturacaoBruta)}
              nota={`${t.semanas} semana${t.semanas !== 1 ? 's' : ''} fechada${t.semanas !== 1 ? 's' : ''}`}
              icon={TrendingUp}
            />
            <Total
              titulo="Pago aos motoristas"
              valor={formatCurrency(t.pagoAosMotoristas)}
              icon={Users}
            />
            <Total
              titulo="Aluguer de viaturas"
              valor={formatCurrency(t.aluguerViaturas)}
              nota="Inclui o que lhe foi lançado a si"
              icon={Car}
            />
          </div>

          {/* ── O que saiu ──────────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Total titulo="Via Verde" valor={formatCurrency(t.viaVerde)} icon={Route} />
            <Total titulo="Combustível" valor={formatCurrency(t.combustivel)} icon={Fuel} />
            <Total titulo="Carregamento elétrico" valor={formatCurrency(t.carregamento)} icon={BatteryCharging} />
            <Total
              titulo="Imposto"
              valor={formatCurrency(t.imposto)}
              nota={`Comissão cobrada: ${formatCurrency(t.comissao)}`}
              icon={Receipt}
            />
          </div>

          {/* A ressalva fica ao lado dos números, e não no fim da página. */}
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <div className="space-y-1 text-sm text-amber-900 dark:text-amber-200">
              <p>
                <strong>Isto é lucro antes de seguro, manutenção, pneus, IUC e prestações.</strong>{' '}
                Esses custos não estão registados na plataforma, por isso nenhuma conta
                aqui os pode incluir.
              </p>
              <p className="text-xs">
                A <strong>comissão</strong> cobrada aos motoristas está acima como
                informação, mas <strong>não</strong> entra no lucro — foi assim que o
                definiu. As semanas de quem está marcado como <em>empresa</em> entram
                pelo líquido, e o aluguer lançado a essa pessoa não conta.
              </p>
            </div>
          </div>

          {/* ── Destaques ───────────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {f?.destaques.maisFatura && (
              <Destaque
                icon={TrendingUp} titulo="Fatura mais"
                nome={f.destaques.maisFatura.name}
                valor={formatCurrency(f.destaques.maisFatura.faturacaoBruta)}
                nota={`${formatCurrency(f.destaques.maisFatura.mediaSemanal)} por semana`}
              />
            )}
            {f?.destaques.menosFatura && (
              <Destaque
                icon={TrendingDown} titulo="Fatura menos"
                nome={f.destaques.menosFatura.name}
                valor={formatCurrency(f.destaques.menosFatura.faturacaoBruta)}
                nota={`${formatCurrency(f.destaques.menosFatura.mediaSemanal)} por semana`}
              />
            )}
            {f?.destaques.maisLucro && (
              <Destaque
                icon={Car} titulo="Carro que mais deu"
                nome={f.destaques.maisLucro.plate}
                valor={formatCurrency(f.destaques.maisLucro.lucro)}
                nota={`${f.destaques.maisLucro.brand} ${f.destaques.maisLucro.model}`}
              />
            )}
            {f?.destaques.maisKm ? (
              <Destaque
                icon={Gauge} titulo="Carro com mais km"
                nome={f.destaques.maisKm.plate}
                valor={`${formatNumber(f.destaques.maisKm.km ?? 0)} km`}
                nota={`${f.destaques.maisKm.brand} ${f.destaques.maisKm.model}`}
              />
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-4">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                    <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                    Carro com mais km
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Ainda sem quilómetros registados. Preencha-os ao criar o fecho semanal.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Evolução ────────────────────────────────────────────────── */}
          {(f?.evolucao.length ?? 0) > 1 && (
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg">Mês a mês</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Uma semana pertence ao mês em que começou
                </p>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={f!.evolucao} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis
                        stroke="var(--muted-foreground)" fontSize={10} width={56}
                        tickLine={false} axisLine={false}
                        tickFormatter={(v) => (v === 0 ? '€0' : formatCurrencyCompact(v))}
                      />
                      <Tooltip
                        cursor={{ fill: 'var(--secondary)' }}
                        contentStyle={TOOLTIP}
                        labelStyle={{ color: 'var(--muted-foreground)' }}
                        formatter={(v: number, n: string) => [formatCurrency(v), n]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="faturacao" name="Faturação" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="lucro" name="Lucro" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Por carro ───────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Por carro</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Do que mais deu para o que menos deu
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Viatura</TableHead>
                      <TableHead className="text-right">Semanas</TableHead>
                      <TableHead className="text-right">Faturou</TableHead>
                      <TableHead className="text-right">Via Verde</TableHead>
                      <TableHead className="text-right">Energia</TableHead>
                      <TableHead className="text-right">Km</TableHead>
                      <TableHead className="text-right">Lucro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {f!.porCarro.map((c: CarroStats) => {
                      const En = ENERGIA[c.energyType].icon;
                      return (
                        <TableRow key={c.vehicleId}>
                          <TableCell>
                            <p className="font-medium">{c.plate}</p>
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <En className="h-3 w-3" aria-hidden="true" />
                              {c.brand} {c.model} · {ENERGIA[c.energyType].nome}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{c.semanas}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(c.faturacaoBruta)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(c.viaVerde)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(c.energia)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {/* Um traço e não um zero: "não foi registado" não é
                                "não andou". */}
                            {c.km === null ? '—' : formatNumber(c.km)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(c.lucro)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* ── Por motorista ───────────────────────────────────────────── */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Por motorista</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Do que mais fatura para o que menos fatura
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motorista</TableHead>
                      <TableHead className="text-right">Semanas</TableHead>
                      <TableHead className="text-right">Faturou</TableHead>
                      <TableHead className="text-right">Média/semana</TableHead>
                      <TableHead className="text-right">Recebeu</TableHead>
                      <TableHead className="text-right">Para a empresa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {f!.porMotorista.map((m: MotoristaStats) => (
                      <TableRow key={m.userId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{m.name}</span>
                            {m.isCompany && (
                              <Badge variant="secondary" className="text-[10px]">Empresa</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.semanas}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(m.faturacaoBruta)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(m.mediaSemanal)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(m.recebido)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(m.lucroParaEmpresa)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
