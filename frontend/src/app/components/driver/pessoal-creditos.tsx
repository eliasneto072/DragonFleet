// src/app/components/driver/pessoal-creditos.tsx
//
// Os créditos: o quadro de quem deve o quê, quanto falta, e o que já se pagou.
//
// ─── DOIS TIPOS DE CRÉDITO, NO MESMO ECRÃ ───────────────────────────────────
//
// COM TAXA  — um crédito de banco. Há TAN, e o quadro de amortização calcula-se.
// POR PLANO — um empréstimo de um investidor particular. Não há taxa: há o que
//             se pediu, o que se devolve, e as prestações por tramos. Às vezes
//             nem juros tem.
//
// O formulário aceita os dois e não obriga a nenhum. Deixar a TAN em branco é
// uma resposta legítima — e por isso o campo nunca se preenche sozinho.
//
// ─── A BARRA SAI DOS PAGAMENTOS, NÃO DO CALENDÁRIO ──────────────────────────
//
// Contar pelos meses decorridos assume que se pagou sempre a horas. Um dos
// créditos dele tem uma prestação em atraso: contado pela data, aparecia como
// se estivesse em dia — e era essa a informação que ele queria ver.

import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Badge } from '@/app/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { AlertTriangle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  pessoalService, type Credito, type CorpoDeCredito,
} from '@/features/driver/services/pessoal.service';
import { formatCurrency } from '@/shared/lib/format';

const hoje = () => new Date().toISOString().slice(0, 10);
const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-PT') : '—');
const pct = (n: number) => `${n.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`;

interface TramoNoForm { dePrestacao: string; valor: string }

interface FormDeCredito extends CorpoDeCredito {
  tramosNoForm: TramoNoForm[];
}

const VAZIO: FormDeCredito = {
  name: '', lender: '', principal: '', startedOn: hoje(),
  installments: '', monthlyPayment: '', tan: '', taeg: '', mtic: '',
  totalToPay: '', notes: '',
  tramosNoForm: [{ dePrestacao: '1', valor: '' }],
};

// ═══════════════════════════════════════════════════════════ a barra de % ══

/**
 * A barra de 0 a 100 que ele pediu.
 *
 * Mostra sempre os dois lados — o que está pago e o que falta — porque uma
 * barra a 12% sem o resto desenhado lê-se como «quase vazio» em vez de
 * «faltam 88%». O número vai ao lado e não dentro: dentro, numa barra curta,
 * não cabe.
 */
function Barra({ percentagem, emAtraso }: { percentagem: number; emAtraso: boolean }) {
  const p = Math.max(0, Math.min(100, percentagem));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full min-w-[4rem] overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${p}%`,
            // Em atraso pinta-se de outra cor: a percentagem sozinha não
            // distingue «vai a meio e em dia» de «vai a meio e a dever».
            background: emAtraso ? 'var(--grafico-juro)' : 'var(--grafico-capital)',
          }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {pct(p)}
      </span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════ gráficos ══

/** Liquidado contra por liquidar, crédito a crédito. */
function GraficoLiquidado({ creditos }: { creditos: Credito[] }) {
  const dados = creditos.map((c) => ({
    nome: c.nome.length > 14 ? `${c.nome.slice(0, 13)}…` : c.nome,
    liquidado: c.pago.pago,
    porLiquidar: c.pago.porPagar,
  }));

  if (dados.length === 0) return null;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="nome" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
          <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
          <Tooltip
            formatter={(v: number) => formatCurrency(v)}
            contentStyle={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
            }}
          />
          <Legend />
          {/* O contorno da cor do cartão separa as duas fatias: encostadas,
              lêem-se como uma só. */}
          <Bar dataKey="liquidado" stackId="a" name="Liquidado"
            fill="var(--grafico-capital)" stroke="var(--card)" strokeWidth={2} />
          <Bar dataKey="porLiquidar" stackId="a" name="Por liquidar"
            fill="var(--grafico-juro)" stroke="var(--card)" strokeWidth={2}
            radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * A reta dos pagamentos acumulados: o previsto contra o que foi pago.
 *
 * O real acaba onde o tempo acabou — depois de hoje vem nulo, e a linha
 * simplesmente para. Desenhar zero no futuro fazia-a mergulhar a pique e isso
 * lê-se como «parou de pagar».
 */
function GraficoAcumulado({ credito }: { credito: Credito }) {
  if (credito.acumulado.length === 0) return null;

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={credito.acumulado} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <Tooltip
            formatter={(v: number | null) => (v === null ? '—' : formatCurrency(v))}
            contentStyle={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
            }}
          />
          <Legend />
          <Line type="monotone" dataKey="previsto" name="Previsto"
            stroke="var(--grafico-juro)" strokeWidth={2} dot={false} strokeDasharray="4 3" />
          <Line type="monotone" dataKey="pago" name="Pago"
            stroke="var(--grafico-capital)" strokeWidth={2} dot={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════ pagamentos ══

function Pagamentos({ credito, aoMudar }: { credito: Credito; aoMudar: () => void }) {
  const [quando, setQuando] = useState(hoje());
  const [valor, setValor] = useState(String(credito.prestacaoEmVigor || ''));

  const lista = useQuery({
    queryKey: ['pessoal', 'creditos', credito.id, 'pagamentos'],
    queryFn: () => pessoalService.pagamentosDoCredito(credito.id),
  });

  const registar = useMutation({
    mutationFn: () => pessoalService.registarPagamento(credito.id, {
      paidOn: quando, amount: valor,
    }),
    onSuccess: () => {
      toast.success('Pagamento registado.');
      setValor(String(credito.prestacaoEmVigor || ''));
      void lista.refetch();
      aoMudar();
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível registar.'),
  });

  const apagar = useMutation({
    mutationFn: (id: string) => pessoalService.apagarPagamento(credito.id, id),
    onSuccess: () => { void lista.refetch(); aoMudar(); },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`pg-data-${credito.id}`} className="text-xs">Data</Label>
          <Input id={`pg-data-${credito.id}`} type="date" className="h-9 w-[9.5rem]"
            value={quando} onChange={(e) => setQuando(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`pg-valor-${credito.id}`} className="text-xs">Valor</Label>
          <Input id={`pg-valor-${credito.id}`} inputMode="decimal" className="h-9 w-28"
            value={valor} onChange={(e) => setValor(e.target.value)} placeholder="200,00" />
        </div>
        <Button size="sm" className="h-9"
          onClick={() => registar.mutate()} disabled={!valor || registar.isPending}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          Registar
        </Button>
      </div>

      {(lista.data?.pagamentos ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Ainda não registou pagamentos. Sem eles, a barra fica a zero — e um crédito
          em atraso não se distingue de um em dia.
        </p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {(lista.data?.pagamentos ?? []).map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className="w-24 tabular-nums text-muted-foreground">{dia(p.quando)}</span>
              <span className="tabular-nums">{formatCurrency(p.valor)}</span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2"
                onClick={() => apagar.mutate(p.id)}>
                <X className="h-3 w-3" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════ o ecrã ══

export function PessoalCreditos() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [aEditar, setAEditar] = useState<Credito | null>(null);
  const [form, setForm] = useState<FormDeCredito>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto1, setAberto1] = useState<string | null>(null);

  const creditos = useQuery({
    queryKey: ['pessoal', 'creditos'],
    queryFn: () => pessoalService.listarCreditos(),
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ['pessoal', 'creditos'] });

  const gravar = useMutation({
    mutationFn: (f: FormDeCredito) => {
      const { tramosNoForm, ...corpo } = f;
      const tramos = tramosNoForm
        .filter((t) => String(t.valor).trim() !== '')
        .map((t) => ({ dePrestacao: t.dePrestacao || '1', valor: t.valor }));
      const completo: CorpoDeCredito = { ...corpo, tramos };
      return aEditar
        ? pessoalService.actualizarCredito(aEditar.id, completo)
        : pessoalService.criarCredito(completo);
    },
    onSuccess: () => { recarregar(); fechar(); },
    onError: (e: unknown) => setErro(
      (e as { message?: string })?.message ?? 'Não foi possível gravar.',
    ),
  });

  const apagar = useMutation({
    mutationFn: (id: string) => pessoalService.apagarCredito(id),
    onSuccess: recarregar,
  });

  function abrirNovo() {
    setAEditar(null); setForm(VAZIO); setErro(null); setAberto(true);
  }

  function abrirEdicao(c: Credito) {
    setAEditar(c);
    setForm({
      name: c.nome,
      lender: c.credor ?? '',
      principal: String(c.capital),
      startedOn: c.inicio.slice(0, 10),
      installments: String(c.prestacoes),
      monthlyPayment: c.prestacaoDoContrato ?? '',
      // Nulo passa a campo VAZIO, e não a zero: zero afirmava que o crédito
      // não tem juros.
      tan: c.tan ?? '',
      taeg: c.taeg ?? '',
      mtic: c.mtic ?? '',
      totalToPay: c.totalAPagar ?? '',
      notes: c.notas ?? '',
      closedOn: c.liquidadoEm ? c.liquidadoEm.slice(0, 10) : '',
      tramosNoForm: c.tramos.length > 0
        ? c.tramos.map((t) => ({ dePrestacao: String(t.dePrestacao), valor: String(t.valor) }))
        : [{ dePrestacao: '1', valor: String(c.prestacaoDoContrato ?? '') }],
    });
    setErro(null);
    setAberto(true);
  }

  function fechar() { setAberto(false); setAEditar(null); setErro(null); }

  function mudarTramo(i: number, campo: keyof TramoNoForm, v: string) {
    setForm((f) => ({
      ...f,
      tramosNoForm: f.tramosNoForm.map((t, j) => (j === i ? { ...t, [campo]: v } : t)),
    }));
  }

  function acrescentarTramo() {
    setForm((f) => {
      const ultimo = f.tramosNoForm[f.tramosNoForm.length - 1];
      // O tramo novo começa a seguir ao anterior: é quase sempre o que se
      // quer, e poupa a conta de cabeça.
      const seguinte = String((Number(ultimo?.dePrestacao) || 1) + 12);
      return { ...f, tramosNoForm: [...f.tramosNoForm, { dePrestacao: seguinte, valor: '' }] };
    });
  }

  function tirarTramo(i: number) {
    setForm((f) => ({
      ...f,
      tramosNoForm: f.tramosNoForm.length <= 1
        ? f.tramosNoForm
        : f.tramosNoForm.filter((_, j) => j !== i),
    }));
  }

  const lista = creditos.data?.creditos ?? [];
  const aCorrer = useMemo(() => lista.filter((c) => !c.liquidado), [lista]);

  const totais = useMemo(() => ({
    porPagar: aCorrer.reduce((s, c) => s + c.pago.porPagar, 0),
    pago: lista.reduce((s, c) => s + c.pago.pago, 0),
    emAtraso: aCorrer.reduce((s, c) => s + c.pago.valorEmAtraso, 0),
    juros: lista.reduce((s, c) => s + (c.juroTotal ?? 0), 0),
  }), [lista, aCorrer]);

  return (
    <div className="space-y-6">
      {/* ── O conjunto ───────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { t: 'Por liquidar', v: totais.porPagar },
          { t: 'Já liquidado', v: totais.pago },
          { t: 'Juros do conjunto', v: totais.juros },
          { t: 'Em atraso', v: totais.emAtraso, aviso: totais.emAtraso > 0 },
        ].map((k) => (
          <Card key={k.t}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{k.t}</CardTitle>
            </CardHeader>
            <CardContent>
              {creditos.isLoading ? <Skeleton className="h-7 w-24" /> : (
                <p className={`text-2xl font-semibold tabular-nums ${k.aviso ? 'text-destructive' : ''}`}>
                  {formatCurrency(k.v)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── O quadro: nome, credor, e a barra de 0 a 100 ─────────────────── */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Créditos</CardTitle>
          <Button size="sm" onClick={abrirNovo}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Novo crédito
          </Button>
        </CardHeader>

        <CardContent>
          {creditos.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não registou nenhum crédito.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Crédito</th>
                    <th className="py-2 pr-3 font-medium">Credor</th>
                    <th className="py-2 pr-3 text-right font-medium">Prestação</th>
                    <th className="py-2 pr-3 text-right font-medium">Por liquidar</th>
                    <th className="py-2 pr-3 font-medium">Pago</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => (
                    // A chave vai no Fragment e não no <tr>: num fragmento
                    // curto (`<>`) não há onde a pôr, e o React volta a
                    // desenhar a tabela inteira a cada mudança.
                    <Fragment key={c.id}>
                      <tr className="border-b border-border/50">
                        <td className="py-2.5 pr-3">
                          <span className="font-medium">{c.nome}</span>
                          {c.pago.emAtraso > 0 && (
                            <Badge variant="outline" className="ml-2 gap-1 text-destructive">
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              {c.pago.emAtraso} em atraso
                            </Badge>
                          )}
                          {c.liquidado && (
                            <Badge variant="secondary" className="ml-2">Liquidado</Badge>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{c.credor ?? '—'}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {formatCurrency(c.prestacaoEmVigor)}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {formatCurrency(c.pago.porPagar)}
                        </td>
                        <td className="w-48 py-2.5 pr-3">
                          <Barra percentagem={c.pago.percentagem} emAtraso={c.pago.emAtraso > 0} />
                        </td>
                        <td className="py-2.5 text-right">
                          <Button variant="ghost" size="sm" className="h-8 px-2"
                            onClick={() => setAberto1(aberto1 === c.id ? null : c.id)}>
                            {aberto1 === c.id ? 'Fechar' : 'Detalhe'}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 px-2"
                            onClick={() => abrirEdicao(c)}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 px-2"
                            onClick={() => apagar.mutate(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </td>
                      </tr>

                      {aberto1 === c.id && (
                        <tr className="border-b border-border/50">
                          <td colSpan={6} className="py-4">
                            <div className="grid gap-6 lg:grid-cols-2">
                              <div className="space-y-2">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Pagamentos acumulados
                                </p>
                                <GraficoAcumulado credito={c} />
                              </div>
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                  <span className="text-muted-foreground">Capital pedido</span>
                                  <span className="text-right tabular-nums">{formatCurrency(c.capital)}</span>
                                  <span className="text-muted-foreground">A pagar no final</span>
                                  <span className="text-right tabular-nums">
                                    {c.totalAPagar === null ? '—' : formatCurrency(c.totalAPagar)}
                                  </span>
                                  <span className="text-muted-foreground">Juro total</span>
                                  <span className="text-right tabular-nums">
                                    {c.juroTotal === null ? 'por saber' : formatCurrency(c.juroTotal)}
                                  </span>
                                  {c.custo && (
                                    <>
                                      <span className="text-muted-foreground">Custo por ano</span>
                                      <span className="text-right tabular-nums">{pct(c.custo.porAno)}</span>
                                    </>
                                  )}
                                  {c.tan !== null && (
                                    <>
                                      <span className="text-muted-foreground">TAN</span>
                                      <span className="text-right tabular-nums">{pct(c.tan)}</span>
                                    </>
                                  )}
                                  <span className="text-muted-foreground">Última prestação</span>
                                  <span className="text-right tabular-nums">
                                    {dia(c.pago.ultimoPagamento)}
                                  </span>
                                </div>
                                <div className="border-t border-border pt-3">
                                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Registar pagamento
                                  </p>
                                  <Pagamentos credito={c} aoMudar={recarregar} />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Liquidado contra por liquidar ────────────────────────────────── */}
      {lista.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Liquidado e por liquidar</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoLiquidado creditos={lista} />
          </CardContent>
        </Card>
      )}

      {/* ── O formulário ─────────────────────────────────────────────────── */}
      <Dialog open={aberto} onOpenChange={(o) => { if (!o) fechar(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{aEditar ? 'Editar crédito' : 'Novo crédito'}</DialogTitle>
            <DialogDescription>
              A TAN e a TAEG são opcionais. Num empréstimo sem taxa, escreva o que
              pediu e o que devolve: a diferença é o juro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-nome">Nome</Label>
                <Input id="c-nome" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-credor">Credor</Label>
                <Input id="c-credor" value={String(form.lender ?? '')}
                  onChange={(e) => setForm({ ...form, lender: e.target.value })}
                  placeholder="Banco, financeira ou pessoa" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-capital">Capital pedido</Label>
                <Input id="c-capital" inputMode="decimal" value={String(form.principal)}
                  onChange={(e) => setForm({ ...form, principal: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-total">Capital a pagar no final</Label>
                <Input id="c-total" inputMode="decimal" value={String(form.totalToPay ?? '')}
                  onChange={(e) => setForm({ ...form, totalToPay: e.target.value })}
                  placeholder="Deixe vazio se não souber" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-inicio">1.ª prestação</Label>
                <Input id="c-inicio" type="date" value={form.startedOn}
                  onChange={(e) => setForm({ ...form, startedOn: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-n">Número de prestações</Label>
                <Input id="c-n" inputMode="numeric" value={String(form.installments)}
                  onChange={(e) => setForm({ ...form, installments: e.target.value })} />
              </div>
            </div>

            {/* ── Os tramos ─────────────────────────────────────────────── */}
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <Label>Prestações</Label>
                <Button type="button" variant="outline" size="sm" onClick={acrescentarTramo}>
                  <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Outro valor
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Um valor só, ou vários: «da 1.ª à 12.ª, 200 €; da 13.ª em diante, 300 €».
              </p>

              {form.tramosNoForm.map((t, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor={`t-de-${i}`} className="text-xs">A partir da</Label>
                    <Input id={`t-de-${i}`} inputMode="numeric" className="h-9 w-24"
                      value={t.dePrestacao}
                      onChange={(e) => mudarTramo(i, 'dePrestacao', e.target.value)} />
                  </div>
                  <div className="space-y-1 flex-1">
                    <Label htmlFor={`t-v-${i}`} className="text-xs">Prestação</Label>
                    <Input id={`t-v-${i}`} inputMode="decimal" className="h-9"
                      value={t.valor}
                      onChange={(e) => mudarTramo(i, 'valor', e.target.value)}
                      placeholder="200,00" />
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-9 px-2"
                    onClick={() => tirarTramo(i)} disabled={form.tramosNoForm.length <= 1}>
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-tan">TAN <span className="text-muted-foreground">(opcional)</span></Label>
                <Input id="c-tan" inputMode="decimal" value={String(form.tan ?? '')}
                  onChange={(e) => setForm({ ...form, tan: e.target.value })} placeholder="—" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-taeg">TAEG <span className="text-muted-foreground">(opcional)</span></Label>
                <Input id="c-taeg" inputMode="decimal" value={String(form.taeg ?? '')}
                  onChange={(e) => setForm({ ...form, taeg: e.target.value })} placeholder="—" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-mtic">MTIC <span className="text-muted-foreground">(opcional)</span></Label>
                <Input id="c-mtic" inputMode="decimal" value={String(form.mtic ?? '')}
                  onChange={(e) => setForm({ ...form, mtic: e.target.value })} placeholder="—" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-notas">Notas</Label>
              <Textarea id="c-notas" rows={2} value={String(form.notes ?? '')}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-liq">Liquidado em <span className="text-muted-foreground">(se já acabou)</span></Label>
              <Input id="c-liq" type="date" value={String(form.closedOn ?? '')}
                onChange={(e) => setForm({ ...form, closedOn: e.target.value })} />
            </div>

            {erro && <p className="text-sm text-destructive">{erro}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={fechar}>Cancelar</Button>
            <Button onClick={() => { setErro(null); gravar.mutate(form); }}
              disabled={gravar.isPending}>
              {gravar.isPending ? 'A gravar…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
