// src/app/components/driver/pessoal-creditos.tsx
//
// Os créditos: quanto falta, quanto já foi pago, e quanto disso foram juros.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  NADA NESTA TELA É UM NÚMERO GUARDADO                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Guarda-se o contrato — capital, TAN, prazo, data da primeira prestação — e
// tudo o resto é calculado na hora pelo `creditos.ts` do servidor, que tem 21
// testes. Guardar «quanto já pagaste» dava um número que ficava velho no dia
// seguinte, e um número guardado que diverge da fórmula é uma avaria que
// ninguém encontra: os dois parecem plausíveis.
//
// ─── A BARRA É DE PRESTAÇÕES E NÃO DE CAPITAL ───────────────────────────────
//
// Porque é assim que se responde a «quanto falta». A percentagem de CAPITAL
// amortizado é muito mais baixa no início — os primeiros anos de um crédito
// são quase só juro — e daria uma barra desanimadora e difícil de explicar.
//
// Mas a conta do capital não desaparece: está escrita por baixo, em euros,
// que é onde tem sentido.
//
// ─── E PORQUE É QUE O JURO É ÂMBAR E NÃO VERDE ──────────────────────────────
//
// Os dois tons de verde do tema estão a 8,3 de distância um do outro, e abaixo
// de 15 nem com visão normal se distinguem — muito menos empilhados na mesma
// barra. O par usado aqui foi validado nos dois modos e para daltonismo.
// Âmbar também por significado: o juro é o dinheiro que se perde.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
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
  Plus, Pencil, Trash2, AlertTriangle, Landmark, CheckCircle2,
} from 'lucide-react';
import {
  pessoalService, type Credito, type CorpoDeCredito,
} from '@/features/driver/services/pessoal.service';
import { formatCurrency } from '@/shared/lib/format';

const VAZIO: CorpoDeCredito = {
  name: '', lender: '', principal: '', startedOn: new Date().toISOString().slice(0, 10),
  installments: '', monthlyPayment: '', tan: '', taeg: '', mtic: '', notes: '',
};

const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-PT');
const pct = (n: number) => `${n.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`;

/** A barra de 0 a 100. */
function Barra({ valor }: { valor: number }) {
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Percentagem já paga"
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${v}%`, background: 'var(--grafico-capital)' }}
      />
    </div>
  );
}

function Campo({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 font-semibold">{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

/**
 * O gráfico de cada ano: quanto se pagou, e quanto disso foi juro.
 *
 * Empilhado e não lado a lado: a altura da barra é o que saiu da conta nesse
 * ano, e a fatia âmbar é a parte que não abateu dívida nenhuma. Lado a lado,
 * perdia-se o total — e o total é metade da resposta.
 */
function GraficoPorAno({ dados }: { dados: { ano: number; juro: number; capital: number }[] }) {
  if (dados.length === 0) return null;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="ano" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
          <YAxis
            stroke="var(--muted-foreground)" fontSize={11} width={64} tickLine={false}
            tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--foreground)' }}
            formatter={(v: number, nome: string) => [formatCurrency(v), nome]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {/* O capital por baixo e o juro por cima: a fatia que interessa ver
              fica no topo, onde se lê a altura dela de relance.
              O `stroke` da cor da superfície é o espaço de 2px entre as duas
              fatias — sem ele, encostadas, lêem-se como uma só. */}
          <Bar
            dataKey="capital" stackId="a" name="Capital"
            fill="var(--grafico-capital)"
            stroke="var(--card)" strokeWidth={2}
          />
          <Bar
            dataKey="juro" stackId="a" name="Juro"
            fill="var(--grafico-juro)"
            stroke="var(--card)" strokeWidth={2}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PessoalCreditos() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [aEditar, setAEditar] = useState<Credito | null>(null);
  const [form, setForm] = useState<CorpoDeCredito>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);

  const creditos = useQuery({
    queryKey: ['pessoal', 'creditos'],
    queryFn: () => pessoalService.listarCreditos(),
  });
  const resumo = useQuery({
    queryKey: ['pessoal', 'creditos', 'resumo'],
    queryFn: () => pessoalService.resumoDeCreditos(),
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ['pessoal', 'creditos'] });

  const gravar = useMutation({
    mutationFn: (corpo: CorpoDeCredito) => (aEditar
      ? pessoalService.actualizarCredito(aEditar.id, corpo)
      : pessoalService.criarCredito(corpo)),
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
      tan: String(c.tan),
      taeg: c.taeg ?? '',
      mtic: c.mtic ?? '',
      notes: c.notas ?? '',
      closedOn: c.liquidadoEm ? c.liquidadoEm.slice(0, 10) : '',
    });
    setErro(null);
    setAberto(true);
  }

  function fechar() { setAberto(false); setAEditar(null); setErro(null); }

  const lista = creditos.data?.creditos ?? [];
  const r = resumo.data;

  return (
    <div className="space-y-6">
      {/* ── O conjunto ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Em dívida
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resumo.isLoading
              ? <Skeleton className="h-8 w-28" />
              : (
                <>
                  <p className="text-2xl font-bold">{formatCurrency(r?.emDivida ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r?.aCorrer ?? 0} {r?.aCorrer === 1 ? 'crédito' : 'créditos'} a correr
                  </p>
                </>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sai todos os meses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resumo.isLoading
              ? <Skeleton className="h-8 w-28" />
              : <p className="text-2xl font-bold">{formatCurrency(r?.prestacaoMensal ?? 0)}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Juros já pagos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resumo.isLoading
              ? <Skeleton className="h-8 w-28" />
              : (
                <p className="text-2xl font-bold" style={{ color: 'var(--grafico-juro)' }}>
                  {formatCurrency(r?.jurosPagos ?? 0)}
                </p>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Juros que faltam
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resumo.isLoading
              ? <Skeleton className="h-8 w-28" />
              : (
                <>
                  <p className="text-2xl font-bold" style={{ color: 'var(--grafico-juro)' }}>
                    {formatCurrency(r?.jurosPorPagar ?? 0)}
                  </p>
                  {/* Dito aqui porque é o número que faz decidir amortizar:
                      é o que ainda dá para poupar. */}
                  <p className="text-xs text-muted-foreground">
                    É o que ainda dá para poupar
                  </p>
                </>
              )}
          </CardContent>
        </Card>
      </div>

      {/* ── O gráfico de todos ── */}
      {(r?.porAno.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ano a ano, todos os créditos</CardTitle>
            <p className="text-sm text-muted-foreground">
              A altura é o que sai da conta nesse ano. A fatia âmbar é a parte
              que não abate dívida nenhuma.
            </p>
          </CardHeader>
          <CardContent>
            <GraficoPorAno dados={r!.porAno} />
          </CardContent>
        </Card>
      )}

      {/* ── A lista ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Os teus créditos</h2>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="mr-1.5 h-4 w-4" />
          Novo crédito
        </Button>
      </div>

      {creditos.isLoading && <Skeleton className="h-40 w-full" />}

      {!creditos.isLoading && lista.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <Landmark className="mx-auto h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted-foreground">
              Ainda não registaste nenhum crédito.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {lista.map((c) => (
          <Card key={c.id} className={c.liquidado ? 'opacity-70' : undefined}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  {c.nome}
                  {c.liquidado && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">
                      <CheckCircle2 className="h-3 w-3" />
                      Liquidado
                    </span>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {c.credor ? `${c.credor} · ` : ''}
                  {formatCurrency(c.capital)} a {pct(c.tan)} TAN
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => abrirEdicao(c)} aria-label="Alterar">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => apagar.mutate(c.id)} aria-label="Apagar">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* O aviso de que os números do contrato não batem certo.
                  Primeiro de tudo: se estiver aceso, nada do que está por
                  baixo é de confiança. */}
              {c.conferencia && !c.conferencia.bate && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    A prestação que escreveste ({formatCurrency(c.prestacaoDoContrato ?? 0)})
                    não bate certo com o capital, a TAN e o prazo — as contas dão{' '}
                    <strong className="text-foreground">
                      {formatCurrency(c.conferencia.calculada)}
                    </strong>.
                    Confere os números no contrato: se algum estiver mal copiado,
                    tudo o que está aqui em baixo está errado.
                  </p>
                </div>
              )}

              {/* ── A barra ── */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">
                    {pct(c.estado.percentagemPaga)} pago
                  </span>
                  <span className="text-muted-foreground">
                    {c.estado.pagas} de {c.estado.prestacoes} prestações
                  </span>
                </div>
                <Barra valor={c.estado.percentagemPaga} />
                <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>
                    Capital abatido {formatCurrency(c.estado.capitalPago)}
                  </span>
                  <span>
                    {c.estado.fim ? `Acaba em ${dia(c.estado.fim)}` : ''}
                  </span>
                </div>
              </div>

              {/* ── Os números ── */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Campo
                  rotulo="Falta pagar"
                  valor={formatCurrency(c.estado.emDivida)}
                  nota="de capital"
                />
                <Campo
                  rotulo="Último pagamento"
                  valor={c.estado.ultimoPagamento
                    ? formatCurrency(c.estado.ultimoPagamento.prestacao)
                    : '—'}
                  nota={c.estado.ultimoPagamento
                    ? dia(c.estado.ultimoPagamento.quando)
                    : 'ainda não começou'}
                />
                <Campo
                  rotulo="Juros pagos"
                  valor={formatCurrency(c.estado.jurosPagos)}
                  nota={`de ${formatCurrency(c.estado.jurosTotais)} no total`}
                />
                <Campo
                  rotulo="Juros que faltam"
                  valor={formatCurrency(c.estado.jurosPorPagar)}
                  nota="o que dá para poupar"
                />
              </div>

              {/* ── O contrato ── */}
              <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-4 text-sm text-muted-foreground">
                <span>TAN <strong className="text-foreground">{pct(c.tan)}</strong></span>
                {c.taeg !== null && (
                  <span>TAEG <strong className="text-foreground">{pct(c.taeg)}</strong></span>
                )}
                {c.mtic !== null && (
                  <span>MTIC <strong className="text-foreground">{formatCurrency(c.mtic)}</strong></span>
                )}
                <span>
                  Prestação <strong className="text-foreground">
                    {formatCurrency(c.prestacaoEmVigor)}
                  </strong>
                </span>
                <span>Início <strong className="text-foreground">{dia(c.inicio)}</strong></span>
              </div>

              {/* ── O ano a ano deste crédito ── */}
              {c.porAno.length > 1 && <GraficoPorAno dados={c.porAno} />}

              {c.notas && (
                <p className="text-sm text-muted-foreground">{c.notas}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── O formulário ── */}
      <Dialog open={aberto} onOpenChange={(v) => (v ? setAberto(true) : fechar())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{aEditar ? 'Alterar crédito' : 'Novo crédito'}</DialogTitle>
            <DialogDescription>
              Copia do contrato. Tudo o resto é calculado a partir destes números.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome" maxLength={80} placeholder="Consolidação, Carro, Mário…"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="credor">A quem deves</Label>
                <Input
                  id="credor" maxLength={80} placeholder="Opcional"
                  value={String(form.lender ?? '')}
                  onChange={(e) => setForm({ ...form, lender: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="capital">Capital</Label>
                <Input
                  id="capital" inputMode="decimal" placeholder="0,00"
                  value={String(form.principal)}
                  onChange={(e) => setForm({ ...form, principal: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="inicio">1.ª prestação</Label>
                <Input
                  id="inicio" type="date"
                  value={form.startedOn}
                  onChange={(e) => setForm({ ...form, startedOn: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="n">N.º de prestações</Label>
                <Input
                  id="n" inputMode="numeric" placeholder="84"
                  value={String(form.installments)}
                  onChange={(e) => setForm({ ...form, installments: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="prestacao">Prestação mensal</Label>
              <Input
                id="prestacao" inputMode="decimal" placeholder="0,00"
                value={String(form.monthlyPayment ?? '')}
                onChange={(e) => setForm({ ...form, monthlyPayment: e.target.value })}
              />
              {/* Dito aqui porque é o que faz esta caixa valer a pena: é o
                  número que ele sabe de cor, e é a única coisa que denuncia
                  um dígito mal copiado nos outros três. */}
              <p className="mt-1 text-xs text-muted-foreground">
                O valor que sai mesmo da conta. Serve para conferir os outros:
                se não bater com as contas, avisamos.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="tan">TAN (%)</Label>
                <Input
                  id="tan" inputMode="decimal" placeholder="5,4"
                  value={String(form.tan ?? '')}
                  onChange={(e) => setForm({ ...form, tan: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="taeg">TAEG (%)</Label>
                <Input
                  id="taeg" inputMode="decimal" placeholder="6,8"
                  value={String(form.taeg ?? '')}
                  onChange={(e) => setForm({ ...form, taeg: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="mtic">MTIC</Label>
                <Input
                  id="mtic" inputMode="decimal" placeholder="0,00"
                  value={String(form.mtic ?? '')}
                  onChange={(e) => setForm({ ...form, mtic: e.target.value })}
                />
              </div>
            </div>

            {/* As três taxas fazem coisas diferentes, e só uma entra nas
                contas. Sem isto escrito, a pergunta «porque é que o gráfico
                não usa a TAEG, que é maior?» não tem resposta à vista. */}
            <p className="text-xs leading-relaxed text-muted-foreground">
              <strong>A TAN</strong> é a única que entra nas contas — é a que corre
              sobre o capital em dívida. <strong>A TAEG</strong> inclui comissões e
              seguros e serve para comparar propostas de bancos diferentes.{' '}
              <strong>O MTIC</strong> é o total que acabas por entregar, do contrato:
              guardamo-lo para o poderes confrontar com o que estas contas dizem.
            </p>

            <div>
              <Label htmlFor="liquidado">Liquidado em</Label>
              <Input
                id="liquidado" type="date"
                value={String(form.closedOn ?? '')}
                onChange={(e) => setForm({ ...form, closedOn: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Só se já o fechaste antes do fim. Deixa vazio se ainda está a correr.
              </p>
            </div>

            <div>
              <Label htmlFor="notascred">Notas</Label>
              <Textarea
                id="notascred" rows={2} maxLength={1000}
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
            <Button variant="outline" onClick={fechar}>Cancelar</Button>
            <Button
              disabled={gravar.isPending || !form.name.trim() || !String(form.principal).trim()}
              onClick={() => { setErro(null); gravar.mutate(form); }}
            >
              {aEditar ? 'Gravar' : 'Registar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
