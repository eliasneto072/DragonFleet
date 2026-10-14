// src/app/components/driver/pessoal-despesas.tsx
//
// As despesas pessoais.
//
// ─── ISTO SAI DO SALDO, E A TELA TEM DE O DIZER ─────────────────────────────
//
// Cada despesa lançada aqui escreve um débito no extrato e o saldo desconta-a.
// Não é um caderno de notas: é dinheiro a sair. A tela diz isso por escrito
// antes de se gravar a primeira — alguém que descubra depois, ao ver o saldo
// mais baixo do que esperava, vai pensar que o sistema se enganou.
//
// ─── O QUE FICA DESTE LADO E O QUE VAI PARA O EXTRATO ───────────────────────
//
// No extrato fica só «Despesa pessoal» e o valor, que é o que o saldo precisa
// para bater certo. A categoria, a descrição e o comprovativo ficam aqui, onde
// só o próprio entra. Quem tiver acesso ao Financeiro da frota vê a linha do
// dinheiro, não vê em quê.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/app/components/ui/card';
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
import { Plus, Trash2, Pencil, Tag, Info } from 'lucide-react';
import {
  pessoalService, type Despesa, type CorpoDaDespesa,
} from '@/features/driver/services/pessoal.service';
import { formatCurrency } from '@/shared/lib/format';

/** Hoje em "AAAA-MM-DD", que é o que o campo de data e o servidor esperam. */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function dia(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT');
}

const VAZIO: CorpoDaDespesa = { amount: '', spentOn: hoje(), categoryId: null, notes: '' };

// Sem categoria escolhida. Um texto e não uma cadeia vazia: o componente de
// selecção do projeto não aceita `value=""` como opção, e com ela a lista
// deixava de abrir — sem erro nenhum, só não abria.
const SEM_CATEGORIA = 'sem-categoria';

export function PessoalDespesas() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [aEditar, setAEditar] = useState<Despesa | null>(null);
  const [form, setForm] = useState<CorpoDaDespesa>(VAZIO);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const despesas = useQuery({
    queryKey: ['pessoal', 'despesas'],
    queryFn: () => pessoalService.listarDespesas(),
  });
  const resumo = useQuery({
    queryKey: ['pessoal', 'despesas', 'resumo'],
    queryFn: () => pessoalService.resumoDeDespesas(),
  });
  const categorias = useQuery({
    queryKey: ['pessoal', 'categorias'],
    queryFn: () => pessoalService.listarCategorias(),
  });

  function recarregar() {
    qc.invalidateQueries({ queryKey: ['pessoal'] });
    // O saldo mudou: a despesa escreveu um débito no extrato. Sem isto, o
    // cartão do saldo ficava com o número de antes até alguém recarregar a
    // página — e um saldo desactualizado é indistinguível de um saldo errado.
    qc.invalidateQueries({ queryKey: ['balance'] });
    qc.invalidateQueries({ queryKey: ['ledger'] });
  }

  const gravar = useMutation({
    mutationFn: (corpo: CorpoDaDespesa) => (aEditar
      ? pessoalService.actualizarDespesa(aEditar.id, corpo)
      : pessoalService.criarDespesa(corpo)),
    onSuccess: () => { recarregar(); fechar(); },
    onError: (e: unknown) => setErro(
      (e as { message?: string })?.message ?? 'Não foi possível gravar.',
    ),
  });

  const apagar = useMutation({
    mutationFn: (id: string) => pessoalService.apagarDespesa(id),
    onSuccess: recarregar,
  });

  const criarCategoria = useMutation({
    mutationFn: (nome: string) => pessoalService.criarCategoria(nome),
    onSuccess: () => {
      setNovaCategoria('');
      qc.invalidateQueries({ queryKey: ['pessoal', 'categorias'] });
    },
  });

  const apagarCategoria = useMutation({
    mutationFn: (id: string) => pessoalService.apagarCategoria(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pessoal'] }),
  });

  function abrirNova() {
    setAEditar(null);
    setForm(VAZIO);
    setErro(null);
    setAberto(true);
  }

  function abrirEdicao(d: Despesa) {
    setAEditar(d);
    setForm({
      amount: String(d.amount),
      spentOn: d.spentOn.slice(0, 10),
      categoryId: d.categoria?.id ?? null,
      notes: d.notes ?? '',
    });
    setErro(null);
    setAberto(true);
  }

  function fechar() {
    setAberto(false);
    setAEditar(null);
    setErro(null);
  }

  const lista = despesas.data?.despesas ?? [];
  const cats = categorias.data?.categorias ?? [];

  return (
    <div className="space-y-6">
      {/* ── O aviso ──
          Primeiro e à vista, não no fim em letra pequena. É a única coisa
          desta página que mexe em dinheiro a sério. */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          O que lançares aqui <strong className="text-foreground">sai do teu saldo</strong>.
          No extrato aparece como «Despesa pessoal» e o valor — a categoria e a
          descrição ficam só nesta página.
        </p>
      </div>

      {/* ── Os totais ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total registado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resumo.isLoading
              ? <Skeleton className="h-8 w-28" />
              : <p className="text-2xl font-bold">{formatCurrency(resumo.data?.total ?? 0)}</p>}
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Onde se foi o dinheiro
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resumo.isLoading && <Skeleton className="h-8 w-full" />}
            {!resumo.isLoading && (resumo.data?.porCategoria.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">Ainda não há despesas.</p>
            )}
            <div className="space-y-1.5">
              {resumo.data?.porCategoria.slice(0, 4).map((c) => (
                <div key={c.categoriaId ?? 'nenhuma'} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{c.nome}</span>
                  <span className="font-medium">{formatCurrency(c.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── As gavetas ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4" aria-hidden="true" />
            Categorias
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
              >
                {c.name}
                <button
                  type="button"
                  onClick={() => apagarCategoria.mutate(c.id)}
                  className="text-muted-foreground transition hover:text-destructive"
                  // Dito ao passar o rato: apagar uma gaveta não é apagar o
                  // que estava lá dentro, e sem o dizer ninguém carrega.
                  title="Apagar a categoria. As despesas ficam sem categoria, e não se perdem."
                  aria-label={`Apagar a categoria ${c.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {cats.length === 0 && !categorias.isLoading && (
              <p className="text-sm text-muted-foreground">
                Ainda não tens categorias. Cria as tuas aqui ao lado.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={novaCategoria}
              onChange={(e) => setNovaCategoria(e.target.value)}
              placeholder="Combustível, casa, comida…"
              maxLength={40}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && novaCategoria.trim()) {
                  criarCategoria.mutate(novaCategoria.trim());
                }
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

      {/* ── A lista ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Despesas</CardTitle>
          <Button size="sm" onClick={abrirNova}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova despesa
          </Button>
        </CardHeader>
        <CardContent>
          {despesas.isLoading && <Skeleton className="h-24 w-full" />}

          {!despesas.isLoading && lista.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Ainda não lançaste nenhuma despesa.
            </p>
          )}

          <div className="divide-y">
            {lista.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {d.categoria?.name ?? 'Sem categoria'}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {dia(d.spentOn)}
                    {d.notes ? ` · ${d.notes}` : ''}
                    {/* Dito quando NÃO foi lançada, e não quando foi: o normal
                        é ter sido, e um rótulo em todas as linhas a dizer o
                        que é normal deixa de se ler. */}
                    {!d.lancadaNoSaldo && ' · ainda não descontada do saldo'}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <span className="mr-2 font-semibold">− {formatCurrency(d.amount)}</span>
                  <Button variant="ghost" size="icon" onClick={() => abrirEdicao(d)}
                    aria-label="Alterar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => apagar.mutate(d.id)}
                    aria-label="Apagar"
                    title="Apagar. O valor volta ao saldo."
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── O formulário ── */}
      <Dialog open={aberto} onOpenChange={(v) => (v ? setAberto(true) : fechar())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{aEditar ? 'Alterar despesa' : 'Nova despesa'}</DialogTitle>
            <DialogDescription>
              Sai do teu saldo assim que gravares.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="valor">Valor</Label>
                <Input
                  id="valor" inputMode="decimal" placeholder="0,00"
                  value={String(form.amount)}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="data">Data</Label>
                <Input
                  id="data" type="date"
                  value={form.spentOn}
                  onChange={(e) => setForm({ ...form, spentOn: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Categoria</Label>
              <Select
                value={form.categoryId ?? SEM_CATEGORIA}
                onValueChange={(v) => setForm({
                  ...form, categoryId: v === SEM_CATEGORIA ? null : v,
                })}
              >
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CATEGORIA}>Sem categoria</SelectItem>
                  {cats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notas">Descrição</Label>
              <Textarea
                id="notas" rows={2} maxLength={500}
                placeholder="Opcional"
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {/* O comprovativo é opcional e pode chegar depois — foi o que ele
                pediu. Dito por escrito para ninguém ficar à espera de o ter
                de anexar já. */}
            <p className="text-xs text-muted-foreground">
              O comprovativo é opcional e podes anexá-lo mais tarde.
            </p>

            {erro && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fechar}>Cancelar</Button>
            <Button
              disabled={gravar.isPending || !String(form.amount).trim()}
              onClick={() => { setErro(null); gravar.mutate(form); }}
            >
              {aEditar ? 'Gravar' : 'Lançar despesa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
