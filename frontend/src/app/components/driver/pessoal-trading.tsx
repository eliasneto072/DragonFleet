// src/app/components/driver/pessoal-trading.tsx
//
// O diário de operações de trading.
//
// ─── ISTO NÃO TOCA NO SALDO ─────────────────────────────────────────────────
//
// Nem um cêntimo. É registo e estatística: o dinheiro do trading não entra nem
// sai da conta da frota. A tela diz isso logo em cima, pela mesma razão que a
// das despesas diz o contrário — a pergunta «isto mexe no meu saldo?» tem de
// ter resposta antes de alguém lançar a primeira linha, e não depois de
// estranhar um número.
//
// ─── O RESULTADO É BRUTO E AS COMISSÕES DESCONTAM ───────────────────────────
//
// O campo do resultado é antes de comissões; as comissões têm campo próprio e
// o líquido é a diferença. Está escrito debaixo do campo, porque é a única
// forma de alguém o saber ao preencher.
//
// Se se guardasse só o líquido, as comissões ficavam a enfeitar sem entrarem
// em conta nenhuma — e metade do que um diário destes ensina é quanto se paga
// para negociar.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  Plus, Trash2, Pencil, TrendingUp, TrendingDown, Info,
} from 'lucide-react';
import {
  pessoalService, type Operacao, type CorpoDaOperacao,
} from '@/features/driver/services/pessoal.service';
import { formatCurrency } from '@/shared/lib/format';

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function dia(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT');
}

const VAZIO: CorpoDaOperacao = {
  asset: '', broker: '', direction: 'LONG',
  openedAt: hoje(), closedAt: '',
  size: '', entryPrice: '', exitPrice: '',
  result: '', fees: '', notes: '',
};

/** Verde em cima de zero, vermelho abaixo, neutro em cima do zero exacto. */
function corDoValor(v: number): string {
  if (v > 0) return 'text-emerald-500';
  if (v < 0) return 'text-destructive';
  return 'text-muted-foreground';
}

function Numero({ rotulo, valor, sufixo }: {
  rotulo: string; valor: string | null; sufixo?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </p>
      <p className="mt-1 text-2xl font-bold">
        {/* Um traço, e não um zero, quando ainda não há dados. Zero numa taxa
            de acerto lê-se como «nunca ganhaste». */}
        {valor ?? '—'}{valor !== null && sufixo ? sufixo : ''}
      </p>
    </div>
  );
}

export function PessoalTrading() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [aEditar, setAEditar] = useState<Operacao | null>(null);
  const [form, setForm] = useState<CorpoDaOperacao>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);

  const operacoes = useQuery({
    queryKey: ['pessoal', 'trading'],
    queryFn: () => pessoalService.listarOperacoes(),
  });
  const resumo = useQuery({
    queryKey: ['pessoal', 'trading', 'resumo'],
    queryFn: () => pessoalService.resumoDeTrading(),
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ['pessoal', 'trading'] });

  const gravar = useMutation({
    mutationFn: (corpo: CorpoDaOperacao) => (aEditar
      ? pessoalService.actualizarOperacao(aEditar.id, corpo)
      : pessoalService.criarOperacao(corpo)),
    onSuccess: () => { recarregar(); fechar(); },
    onError: (e: unknown) => setErro(
      (e as { message?: string })?.message ?? 'Não foi possível gravar.',
    ),
  });

  const apagar = useMutation({
    mutationFn: (id: string) => pessoalService.apagarOperacao(id),
    onSuccess: recarregar,
  });

  function abrirNova() {
    setAEditar(null); setForm(VAZIO); setErro(null); setAberto(true);
  }

  function abrirEdicao(o: Operacao) {
    setAEditar(o);
    setForm({
      asset: o.asset,
      broker: o.broker ?? '',
      direction: o.direction,
      openedAt: o.openedAt.slice(0, 10),
      closedAt: o.closedAt ? o.closedAt.slice(0, 10) : '',
      size: o.size ?? '',
      entryPrice: o.entryPrice ?? '',
      exitPrice: o.exitPrice ?? '',
      result: String(o.result),
      fees: String(o.fees),
      notes: o.notes ?? '',
    });
    setErro(null);
    setAberto(true);
  }

  function fechar() { setAberto(false); setAEditar(null); setErro(null); }

  const lista = operacoes.data?.operacoes ?? [];
  const r = resumo.data?.resumo;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Isto é só registo: o trading <strong className="text-foreground">não mexe no teu
          saldo</strong> nem entra em nenhuma conta da frota.
        </p>
      </div>

      {/* ── Os números ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">O acumulado</CardTitle>
        </CardHeader>
        <CardContent>
          {resumo.isLoading && <Skeleton className="h-20 w-full" />}
          {r && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Líquido
                </p>
                <p className={`mt-1 text-2xl font-bold ${corDoValor(r.liquido)}`}>
                  {formatCurrency(r.liquido)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatCurrency(r.bruto)} menos {formatCurrency(r.comissoes)} de comissões
                </p>
              </div>
              <Numero
                rotulo="Taxa de acerto"
                valor={r.taxaDeAcerto === null ? null : String(r.taxaDeAcerto)}
                sufixo="%"
              />
              <Numero
                rotulo="Operações"
                valor={String(r.total)}
              />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Melhor / pior
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-semibold text-emerald-500">
                    {r.melhor === null ? '—' : formatCurrency(r.melhor)}
                  </span>
                  {' / '}
                  <span className="font-semibold text-destructive">
                    {r.pior === null ? '—' : formatCurrency(r.pior)}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.ganhas} ganhas · {r.perdidas} perdidas
                  {r.nulas > 0 ? ` · ${r.nulas} a zero` : ''}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Mês a mês ── */}
      {(resumo.data?.porMes.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mês a mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {resumo.data?.porMes.map((m) => (
                <div key={m.mes} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {m.mes} · {m.total} {m.total === 1 ? 'operação' : 'operações'}
                  </span>
                  <span className={`font-medium ${corDoValor(m.liquido)}`}>
                    {formatCurrency(m.liquido)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── O diário ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Operações</CardTitle>
          <Button size="sm" onClick={abrirNova}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova operação
          </Button>
        </CardHeader>
        <CardContent>
          {operacoes.isLoading && <Skeleton className="h-24 w-full" />}

          {!operacoes.isLoading && lista.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Ainda não registaste nenhuma operação.
            </p>
          )}

          <div className="divide-y">
            {lista.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {o.direction === 'LONG'
                    ? <TrendingUp className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Longo" />
                    : <TrendingDown className="h-4 w-4 shrink-0 text-amber-500" aria-label="Curto" />}
                  <div className="min-w-0">
                    <p className="font-medium">{o.asset}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {dia(o.openedAt)}
                      {o.broker ? ` · ${o.broker}` : ''}
                      {o.retorno !== null ? ` · ${o.retorno > 0 ? '+' : ''}${o.retorno}%` : ''}
                      {o.closedAt === null ? ' · em aberto' : ''}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <div className="mr-2 text-right">
                    <p className={`font-semibold ${corDoValor(o.liquido)}`}>
                      {o.liquido > 0 ? '+' : ''}{formatCurrency(o.liquido)}
                    </p>
                    {o.fees > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(o.fees)} de comissão
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => abrirEdicao(o)}
                    aria-label="Alterar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => apagar.mutate(o.id)}
                    aria-label="Apagar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── O formulário ──
          Os campos obrigatórios em cima e o resto por baixo. São oito campos:
          se os obrigatórios não estivessem destacados, o formulário parecia
          exigir tudo — e um diário que custa a preencher deixa de ser
          preenchido ao fim de uma semana. */}
      <Dialog open={aberto} onOpenChange={(v) => (v ? setAberto(true) : fechar())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{aEditar ? 'Alterar operação' : 'Nova operação'}</DialogTitle>
            <DialogDescription>
              Só os três primeiros campos são precisos. O resto é para o diário.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="ativo">O que negociaste</Label>
                <Input
                  id="ativo" placeholder="EUR/USD, BTC, AAPL…" maxLength={60}
                  value={form.asset}
                  onChange={(e) => setForm({ ...form, asset: e.target.value })}
                />
              </div>
              <div>
                <Label>Longo ou curto</Label>
                <Select
                  value={form.direction}
                  onValueChange={(v) => setForm({ ...form, direction: v as 'LONG' | 'SHORT' })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LONG">Longo (a subir)</SelectItem>
                    <SelectItem value="SHORT">Curto (a descer)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="resultado">Resultado</Label>
                <Input
                  id="resultado" inputMode="decimal" placeholder="0,00"
                  value={String(form.result)}
                  onChange={(e) => setForm({ ...form, result: e.target.value })}
                />
                {/* Dito aqui e não no fim: é onde o engano acontece. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  Antes de comissões. Negativo se perdeste.
                </p>
              </div>
              <div>
                <Label htmlFor="comissoes">Comissões</Label>
                <Input
                  id="comissoes" inputMode="decimal" placeholder="0,00"
                  value={String(form.fees ?? '')}
                  onChange={(e) => setForm({ ...form, fees: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="abertura">Abertura</Label>
                <Input
                  id="abertura" type="date"
                  value={form.openedAt}
                  onChange={(e) => setForm({ ...form, openedAt: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="fecho">Fecho</Label>
                <Input
                  id="fecho" type="date"
                  value={form.closedAt ?? ''}
                  onChange={(e) => setForm({ ...form, closedAt: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Deixa vazio se ainda está aberta.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="entrada">Preço de entrada</Label>
                <Input
                  id="entrada" inputMode="decimal"
                  value={String(form.entryPrice ?? '')}
                  onChange={(e) => setForm({ ...form, entryPrice: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="saida">Preço de saída</Label>
                <Input
                  id="saida" inputMode="decimal"
                  value={String(form.exitPrice ?? '')}
                  onChange={(e) => setForm({ ...form, exitPrice: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="tamanho">Tamanho</Label>
                <Input
                  id="tamanho" inputMode="decimal"
                  value={String(form.size ?? '')}
                  onChange={(e) => setForm({ ...form, size: e.target.value })}
                />
              </div>
            </div>

            {/* Dito porque é a pergunta que a tela cria: havendo entrada e
                saída, porque é que o resultado não é calculado? Porque o que
                uma unidade vale muda com o instrumento, e usar o
                multiplicador errado dava um número com ar de exacto e falso. */}
            <p className="text-xs text-muted-foreground">
              Com a entrada e a saída preenchidas, a lista mostra a variação em
              percentagem. O resultado em euros é sempre o que escreveres —
              esse é o único que está garantidamente certo.
            </p>

            <div>
              <Label htmlFor="corretora">Corretora</Label>
              <Input
                id="corretora" maxLength={60}
                value={String(form.broker ?? '')}
                onChange={(e) => setForm({ ...form, broker: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="notasop">Notas</Label>
              <Textarea
                id="notasop" rows={2} maxLength={1000}
                placeholder="O que correu bem ou mal"
                value={form.notes ?? ''}
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
              disabled={gravar.isPending || !form.asset.trim() || !String(form.result).trim()}
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
