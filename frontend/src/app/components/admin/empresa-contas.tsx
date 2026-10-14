// src/app/components/admin/empresa-contas.tsx
//
// As contas da empresa: caixa, lucro e despesas.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  DOIS NÚMEROS, DUAS PERGUNTAS — E A TELA DIZ QUAL É QUAL                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
//   «Tenho dinheiro na conta?» → a CAIXA. O que está no banco, menos o que já
//                                é dos motoristas. O que sobra é o que dá
//                                para gastar.
//
//   «O negócio dá dinheiro?»   → o LUCRO. Alugueres, slots, comissões e o
//                                líquido das semanas do dono, menos as
//                                despesas da empresa.
//
// Um motorista levantar o dinheiro dele mexe na CAIXA e não mexe no LUCRO —
// aquele dinheiro nunca foi da empresa. Juntar os dois num número só dava um
// valor que não responde a pergunta nenhuma, e é o engano que esta tela existe
// para não deixar acontecer. Por isso são dois cartões, com dois títulos que
// dizem a pergunta.
//
// ─── O «NA CONTA» É DECLARADO, NÃO CALCULADO ────────────────────────────────
//
// A aplicação não vê o banco: as prestações dos créditos saem por débito
// direto e as despesas pagas com o cartão pessoal entram por outro lado. Um
// saldo calculado só com o que a aplicação conhece estaria sempre errado — e
// errado para MAIS, que é o pior lado.
//
// Então escreve-se, com data. E quanto mais velha a declaração, menos vale o
// «livre» — por isso a tela conta os dias e avisa.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
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
import {
  Plus, Pencil, Trash2, Landmark, TrendingUp, AlertTriangle, Tag,
} from 'lucide-react';
import {
  empresaService, type DespesaDaEmpresa, type CorpoDaDespesa,
} from '@/features/admin/services/empresa.service';
import {
  FiltroDePeriodo, filtroInicial, type EstadoDoFiltro,
} from '@/app/components/driver/filtro-periodo';
import { formatCurrency } from '@/shared/lib/format';

const hoje = () => new Date().toISOString().slice(0, 10);
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-PT');
const SEM_CATEGORIA = 'sem-categoria';

const VAZIA: CorpoDaDespesa = {
  amount: '', spentOn: hoje(), categoryId: null, supplier: '', notes: '',
};

/** Quantos dias uma declaração pode ter antes de deixar de valer muito. */
const DIAS_ATE_AVISAR = 14;

function Numero({ rotulo, valor, nota, cor }: {
  rotulo: string; valor: string; nota?: string; cor?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </p>
      <p className="mt-1 text-2xl font-bold" style={cor ? { color: cor } : undefined}>
        {valor}
      </p>
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

export function EmpresaContas() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<EstadoDoFiltro>(() => filtroInicial('mes'));

  const [despesaAberta, setDespesaAberta] = useState(false);
  const [aEditar, setAEditar] = useState<DespesaDaEmpresa | null>(null);
  const [form, setForm] = useState<CorpoDaDespesa>(VAZIA);
  const [erro, setErro] = useState<string | null>(null);

  const [saldoAberto, setSaldoAberto] = useState(false);
  const [saldoForm, setSaldoForm] = useState({ saldo: '', quando: hoje(), nota: '' });

  const [novaCategoria, setNovaCategoria] = useState('');

  const caixa = useQuery({ queryKey: ['empresa', 'caixa'], queryFn: () => empresaService.caixa() });
  const lucro = useQuery({
    queryKey: ['empresa', 'lucro', filtro.periodo],
    queryFn: () => empresaService.lucro(filtro.periodo),
  });
  const despesas = useQuery({
    queryKey: ['empresa', 'despesas', filtro.periodo],
    queryFn: () => empresaService.listarDespesas(filtro.periodo),
  });
  const categorias = useQuery({
    queryKey: ['empresa', 'categorias'], queryFn: () => empresaService.listarCategorias(),
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ['empresa'] });

  const gravarDespesa = useMutation({
    mutationFn: (c: CorpoDaDespesa) => (aEditar
      ? empresaService.actualizarDespesa(aEditar.id, c)
      : empresaService.criarDespesa(c)),
    onSuccess: () => { recarregar(); fecharDespesa(); },
    onError: (e: unknown) => setErro((e as { message?: string })?.message ?? 'Não foi possível gravar.'),
  });

  const apagarDespesa = useMutation({
    mutationFn: (id: string) => empresaService.apagarDespesa(id),
    onSuccess: recarregar,
  });

  const declarar = useMutation({
    mutationFn: () => empresaService.declararSaldo(saldoForm.saldo, saldoForm.quando, saldoForm.nota),
    onSuccess: () => { recarregar(); setSaldoAberto(false); },
  });

  const criarCategoria = useMutation({
    mutationFn: (n: string) => empresaService.criarCategoria(n),
    onSuccess: () => { setNovaCategoria(''); recarregar(); },
  });

  const apagarCategoria = useMutation({
    mutationFn: (id: string) => empresaService.apagarCategoria(id),
    onSuccess: recarregar,
  });

  function abrirNova() { setAEditar(null); setForm(VAZIA); setErro(null); setDespesaAberta(true); }
  function abrirEdicao(d: DespesaDaEmpresa) {
    setAEditar(d);
    setForm({
      amount: String(d.valor), spentOn: d.quando.slice(0, 10),
      categoryId: d.categoria?.id ?? null,
      supplier: d.fornecedor ?? '', notes: d.notas ?? '',
    });
    setErro(null); setDespesaAberta(true);
  }
  function fecharDespesa() { setDespesaAberta(false); setAEditar(null); setErro(null); }

  const c = caixa.data;
  const l = lucro.data;
  const cats = categorias.data?.categorias ?? [];
  const lista = despesas.data?.despesas ?? [];

  const declaracaoVelha = (c?.diasDesdeADeclaracao ?? 0) > DIAS_ATE_AVISAR;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Empresa</h1>
        <p className="text-muted-foreground">O que está na conta e o que o negócio dá</p>
      </div>

      {/* ══ A CAIXA ══
          Primeiro, porque é a pergunta de todos os dias: posso gastar? */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4" aria-hidden="true" />
              Tenho dinheiro na conta?
            </CardTitle>
            {c?.declaradoEm && (
              <p className="mt-1 text-sm text-muted-foreground">
                Saldo declarado a {dia(c.declaradoEm)}
                {c.diasDesdeADeclaracao !== null && c.diasDesdeADeclaracao > 0
                  ? ` · há ${c.diasDesdeADeclaracao} dias`
                  : ' · hoje'}
              </p>
            )}
          </div>
          <Button
            size="sm" variant="outline"
            onClick={() => { setSaldoForm({ saldo: '', quando: hoje(), nota: '' }); setSaldoAberto(true); }}
          >
            Actualizar saldo
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {caixa.isLoading && <Skeleton className="h-16 w-full" />}

          {c && !c.declaradoEm && (
            <p className="text-sm text-muted-foreground">
              Ainda não escreveste o saldo do banco. Sem ele só dá para saber
              quanto deves aos motoristas — <strong className="text-foreground">
              {formatCurrency(c.dosMotoristas)}</strong>.
            </p>
          )}

          {c?.declaradoEm && (
            <>
              <div className="grid gap-6 sm:grid-cols-3">
                <Numero rotulo="Na conta" valor={formatCurrency(c.declarado)} />
                <Numero
                  rotulo="Dos motoristas"
                  valor={formatCurrency(c.dosMotoristas)}
                  nota="já é deles, não é teu"
                />
                <Numero
                  rotulo="Livre"
                  valor={formatCurrency(c.livre)}
                  nota="o que dá para gastar"
                  cor={c.livre < 0 ? 'var(--destructive)' : 'var(--grafico-capital)'}
                />
              </div>

              {/* Um livre negativo quer dizer que o dinheiro dos motoristas já
                  não está todo na conta. Não se esconde atrás de um zero. */}
              {c.livre < 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    Deves aos motoristas mais do que tens na conta. Se todos
                    pedissem hoje, faltavam{' '}
                    <strong className="text-foreground">{formatCurrency(Math.abs(c.livre))}</strong>.
                  </p>
                </div>
              )}

              {declaracaoVelha && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    O saldo foi declarado há {c.diasDesdeADeclaracao} dias. O
                    «livre» vale o que valer esse número — confere no banco e
                    actualiza.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ══ O PERÍODO ══ */}
      <FiltroDePeriodo valor={filtro} aoMudar={setFiltro} />

      {/* ══ O LUCRO ══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            O negócio dá dinheiro?
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            O que os motoristas levantam não entra aqui: o que é deles nunca foi
            receita da empresa.
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {lucro.isLoading && <Skeleton className="h-24 w-full" />}

          {l && (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <Numero rotulo="Receita" valor={formatCurrency(l.receita)} />
                <Numero
                  rotulo="Despesas"
                  valor={formatCurrency(l.despesas)}
                  cor="var(--grafico-juro)"
                />
                <Numero
                  rotulo={l.lucro < 0 ? 'Prejuízo' : 'Lucro'}
                  valor={formatCurrency(l.lucro)}
                  cor={l.lucro < 0 ? 'var(--destructive)' : 'var(--grafico-capital)'}
                />
                <Numero
                  rotulo="Margem"
                  valor={l.margem === null ? '—' : `${l.margem}%`}
                  nota={l.margem === null ? 'sem receita no período' : 'do que entrou'}
                />
              </div>

              {/* De onde veio a receita. Sem isto, «receita 1.200 €» não diz se
                  veio dos alugueres ou do trabalho dele — e são decisões
                  completamente diferentes. */}
              <div className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Alugueres</p>
                  <p className="font-semibold">{formatCurrency(l.alugueres)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Slots</p>
                  <p className="font-semibold">{formatCurrency(l.slots)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Comissões</p>
                  <p className="font-semibold">{formatCurrency(l.comissoes)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">As tuas semanas</p>
                  <p className="font-semibold">{formatCurrency(l.doDono)}</p>
                </div>
              </div>

              {l.porMes.length > 0 && (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={l.porMes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                      <YAxis
                        stroke="var(--muted-foreground)" fontSize={11} width={64} tickLine={false}
                        tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--popover)', border: '1px solid var(--border)',
                          borderRadius: 8, fontSize: 12,
                        }}
                        labelStyle={{ color: 'var(--foreground)' }}
                        formatter={(v: number, n: string) => [formatCurrency(v), n]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {/* A linha do zero, para o prejuízo se ver como prejuízo
                          e não como uma barra pequena. */}
                      <ReferenceLine y={0} stroke="var(--border)" />
                      <Bar dataKey="receita" name="Receita" fill="var(--grafico-capital)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="despesas" name="Despesas" fill="var(--grafico-juro)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="lucro" name="Lucro" fill="var(--grafico-lucro)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {l.porCategoria.length > 0 && (
                <div className="border-t pt-4">
                  <p className="mb-2 text-sm font-medium">Despesas por categoria</p>
                  <div className="space-y-1.5">
                    {l.porCategoria.map((x) => (
                      <div key={x.categoriaId ?? 'nenhuma'} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{x.nome}</span>
                        <span className="font-medium">{formatCurrency(x.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ══ AS DESPESAS ══ */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Despesas da empresa</CardTitle>
          <Button size="sm" onClick={abrirNova}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova despesa
          </Button>
        </CardHeader>
        <CardContent>
          {despesas.isLoading && <Skeleton className="h-24 w-full" />}

          {!despesas.isLoading && lista.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sem despesas neste período.
            </p>
          )}

          <div className="divide-y">
            {lista.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {d.categoria?.name ?? 'Sem categoria'}
                    {d.fornecedor ? ` · ${d.fornecedor}` : ''}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {dia(d.quando)}{d.notas ? ` · ${d.notas}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="mr-2 font-semibold">− {formatCurrency(d.valor)}</span>
                  <Button variant="ghost" size="icon" onClick={() => abrirEdicao(d)} aria-label="Alterar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => apagarDespesa.mutate(d.id)} aria-label="Apagar">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ══ AS CATEGORIAS ══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4" aria-hidden="true" />
            Categorias
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cats.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <span className="truncate text-sm">{x.name}</span>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  onClick={() => apagarCategoria.mutate(x.id)}
                  aria-label={`Apagar ${x.name}`}
                  title="Apagar. As despesas ficam sem categoria e continuam a contar no lucro."
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={novaCategoria}
              onChange={(e) => setNovaCategoria(e.target.value)}
              placeholder="Oficina, seguros, contabilidade, combustível…"
              maxLength={60}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && novaCategoria.trim()) criarCategoria.mutate(novaCategoria.trim());
              }}
            />
            <Button
              variant="outline"
              disabled={!novaCategoria.trim() || criarCategoria.isPending}
              onClick={() => criarCategoria.mutate(novaCategoria.trim())}
            >
              Acrescentar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Declarar o saldo ── */}
      <Dialog open={saldoAberto} onOpenChange={setSaldoAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saldo da conta</DialogTitle>
            <DialogDescription>
              Vai ao banco, vê o saldo e escreve-o aqui. É a única coisa que a
              aplicação não consegue saber sozinha.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="saldo">Saldo</Label>
                <Input
                  id="saldo" inputMode="decimal" placeholder="0,00"
                  value={saldoForm.saldo}
                  onChange={(e) => setSaldoForm({ ...saldoForm, saldo: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="quando">Nesse dia</Label>
                <Input
                  id="quando" type="date"
                  value={saldoForm.quando}
                  onChange={(e) => setSaldoForm({ ...saldoForm, quando: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notasaldo">Nota</Label>
              <Input
                id="notasaldo" maxLength={500} placeholder="Opcional"
                value={saldoForm.nota}
                onChange={(e) => setSaldoForm({ ...saldoForm, nota: e.target.value })}
              />
            </div>
            {/* Dito porque é o que torna isto seguro de usar: escrever duas
                vezes no mesmo dia corrige, não duplica. */}
            <p className="text-xs text-muted-foreground">
              Se já tiveres declarado o saldo desse dia, este substitui-o.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSaldoAberto(false)}>Cancelar</Button>
            <Button
              disabled={declarar.isPending || !saldoForm.saldo.trim()}
              onClick={() => declarar.mutate()}
            >
              Gravar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Despesa ── */}
      <Dialog open={despesaAberta} onOpenChange={(v) => (v ? setDespesaAberta(true) : fecharDespesa())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{aEditar ? 'Alterar despesa' : 'Nova despesa da empresa'}</DialogTitle>
            <DialogDescription>
              Desconta ao lucro. O que pagas aos motoristas não se lança aqui —
              já está descontado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="valorD">Valor</Label>
                <Input
                  id="valorD" inputMode="decimal" placeholder="0,00"
                  value={String(form.amount)}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="dataD">Data</Label>
                <Input
                  id="dataD" type="date"
                  value={form.spentOn}
                  onChange={(e) => setForm({ ...form, spentOn: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Categoria</Label>
              <Select
                value={form.categoryId ?? SEM_CATEGORIA}
                onValueChange={(v) => setForm({ ...form, categoryId: v === SEM_CATEGORIA ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CATEGORIA}>Sem categoria</SelectItem>
                  {cats.map((x) => (
                    <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="fornecedor">A quem pagaste</Label>
              <Input
                id="fornecedor" maxLength={120} placeholder="Opcional"
                value={String(form.supplier ?? '')}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="notasD">Descrição</Label>
              <Textarea
                id="notasD" rows={2} maxLength={500}
                value={String(form.notes ?? '')}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {erro && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fecharDespesa}>Cancelar</Button>
            <Button
              disabled={gravarDespesa.isPending || !String(form.amount).trim()}
              onClick={() => { setErro(null); gravarDespesa.mutate(form); }}
            >
              {aEditar ? 'Gravar' : 'Lançar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
