// src/app/components/admin/materials-admin.tsx
//
// O inventário de material: o que há na prateleira, o que se gastou, e o que
// isso custou em cada carro.
//
// ─── PORQUE É QUE SÃO TRÊS ABAS ─────────────────────────────────────────────
//
// São três perguntas diferentes, feitas em momentos diferentes. "Tenho óleo?"
// faz-se à pressa, antes de uma revisão — é o Stock. "O que é que entrou este
// mês?" faz-se com a factura na mão — são os Movimentos. "Quanto me custa este
// carro?" faz-se uma vez por mês, a decidir se vale a pena mantê-lo — é o Por
// carro. Numa tela só, as três davam um ecrã que não serve bem nenhuma.
//
// ─── E PORQUE É QUE O SALDO NÃO SE EDITA ────────────────────────────────────
//
// Não há campo para escrever "tenho 17". Há um botão de contagem, que grava um
// movimento de ajuste com data e com autor. Um saldo escrito à mão é um saldo
// sem explicação, e no mês seguinte ninguém sabe se faltaram cinco litros ou
// se alguém se enganou a escrever.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, Car, ClipboardList,
  Loader2, Package, Plus, Search, X,
} from 'lucide-react';
import {
  materialsService, MOVIMENTOS,
  type Material, type StockMoveKind,
} from '@/features/admin/services/materials.service';
import { vehiclesService } from '@/features/driver/services/vehicles.service';
import { formatCurrency } from '@/shared/lib/format';

const CHAVE = ['materials'] as const;

/** AAAA-MM-DD de hoje, para os campos de data. */
function hoje(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** O primeiro dia do mês corrente — o período por omissão dos relatórios. */
function inicioDoMes(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}

/** "17/08/2026" */
function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

/**
 * Quantidades sem zeros à direita: 4,5 L e não 4,500 L.
 *
 * O `formatNumber` do projeto é para dinheiro e fixa duas casas, o que daria
 * "1,00 un" para um parafuso. Aqui as casas são as que a quantidade tiver.
 */
function qtd(n: number): string {
  return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 3 }).format(n);
}

const CLASSE_DO_TOM: Record<string, string> = {
  entra:  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  sai:    'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  ajuste: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

export function MaterialsAdmin() {
  const [de, setDe] = useState(inicioDoMes());
  const [a, setA] = useState(hoje());

  const resumoQ = useQuery({
    queryKey: [...CHAVE, 'summary', de, a],
    queryFn: () => materialsService.summary({ from: de, to: a }),
  });

  const r = resumoQ.data?.summary;

  return (
    <div className="space-y-5">
      {/* ── O período ────────────────────────────────────────────────────
          Manda nos números das compras, do consumo e do Por carro. O valor
          do stock não: esse é o de agora, e um stock "em agosto" não existe
          sem guardar uma fotografia por dia. */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="mat-de">De</Label>
            <Input id="mat-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-auto" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mat-a">A</Label>
            <Input id="mat-a" type="date" value={a} onChange={(e) => setA(e.target.value)} className="w-auto" />
          </div>
          <p className="text-xs text-muted-foreground">
            O período conta para as compras, o consumo e o custo por carro.
            O valor do stock é sempre o de agora.
          </p>
        </CardContent>
      </Card>

      {resumoQ.isLoading && <Skeleton className="h-24 w-full rounded-xl" />}

      {r && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Numero
            titulo="Valor em stock" valor={formatCurrency(r.stockValue)}
            nota={`${r.materials} material(is)`} icone={Boxes}
          />
          <Numero
            titulo="Comprado no período" valor={formatCurrency(r.purchases.total)}
            nota={`${r.purchases.count} compra(s)`} icone={ArrowDownToLine}
          />
          <Numero
            titulo="Gasto no período" valor={formatCurrency(r.consumption.total)}
            nota={`${r.consumption.count} consumo(s)`} icone={ArrowUpFromLine}
          />
          <Numero
            titulo="Abaixo do mínimo" valor={String(r.low)}
            nota={r.adjustments.count > 0
              ? `${r.adjustments.count} contagem(ns) no período`
              : 'sem contagens no período'}
            icone={AlertTriangle}
            alerta={r.low > 0}
          />
        </div>
      )}

      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="movimentos">Movimentos</TabsTrigger>
          <TabsTrigger value="carros">Por carro</TabsTrigger>
        </TabsList>

        <TabsContent value="stock"><Stock /></TabsContent>
        <TabsContent value="movimentos"><Movimentos de={de} a={a} /></TabsContent>
        <TabsContent value="carros"><PorCarro de={de} a={a} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Numero({ titulo, valor, nota, icone: Icone, alerta }: {
  titulo: string; valor: string; nota: string;
  icone: typeof Boxes; alerta?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-4">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          alerta ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
        }`}>
          <Icone className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
          <p className="truncate text-xl font-semibold tabular-nums">{valor}</p>
          <p className="truncate text-xs text-muted-foreground">{nota}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Stock ──────────────────────────────────────────────────────────────────

function Stock() {
  const [procura, setProcura] = useState('');
  const [categoria, setCategoria] = useState('');
  const [soEmFalta, setSoEmFalta] = useState(false);
  const [verDesligados, setVerDesligados] = useState(false);
  const [aCriar, setACriar] = useState(false);
  const [aEditar, setAEditar] = useState<Material | null>(null);
  const [movimento, setMovimento] = useState<{ m: Material; kind: StockMoveKind } | null>(null);

  const q = useQuery({
    queryKey: [...CHAVE, 'list', procura, categoria, soEmFalta, verDesligados],
    queryFn: () => materialsService.list({
      search: procura || undefined,
      category: categoria || undefined,
      low: soEmFalta || undefined,
      all: verDesligados || undefined,
    }),
  });

  const categoriasQ = useQuery({
    queryKey: [...CHAVE, 'categories'],
    queryFn: () => materialsService.categories(),
  });

  const materiais = q.data?.materials ?? [];

  // Agrupar por categoria: numa frota isto chega depressa às dezenas de linhas,
  // e uma lista seguida de "Óleo 5W30, Pastilhas, Óleo 10W40" obriga a ler
  // tudo para encontrar os óleos.
  const grupos = useMemo(() => {
    const mapa = new Map<string, Material[]>();
    for (const m of materiais) {
      const k = m.category || 'Sem categoria';
      const lista = mapa.get(k) ?? [];
      lista.push(m);
      mapa.set(k, lista);
    }
    return [...mapa.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  }, [materiais]);

  return (
    <div className="space-y-4">
      {aCriar || aEditar ? (
        <FormularioDeMaterial
          material={aEditar}
          categorias={categoriasQ.data?.categories ?? []}
          onPronto={() => { setACriar(false); setAEditar(null); }}
          onCancelar={() => { setACriar(false); setAEditar(null); }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setACriar(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Novo material
          </Button>
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={procura} onChange={(e) => setProcura(e.target.value)}
              placeholder="Procurar por nome ou referência" className="pl-8"
            />
          </div>
          <Select value={categoria || 'TODAS'} onValueChange={(v) => setCategoria(v === 'TODAS' ? '' : v)}>
            <SelectTrigger className="w-auto min-w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas as categorias</SelectItem>
              {(categoriasQ.data?.categories ?? []).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={soEmFalta ? 'default' : 'outline'} size="sm"
            onClick={() => setSoEmFalta((v) => !v)}
          >
            <AlertTriangle className="mr-1.5 h-4 w-4" aria-hidden="true" />Só em falta
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setVerDesligados((v) => !v)}>
            {verDesligados ? 'Esconder desligados' : 'Ver desligados'}
          </Button>
        </div>
      )}

      {q.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}

      {!q.isLoading && materiais.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">
              {procura || categoria || soEmFalta ? 'Nada com esses filtros' : 'Ainda não há material'}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Óleo, filtros, pastilhas, pneus. Cada compra e cada consumo ficam escritos —
              e é daí que sai o custo real de cada carro.
            </p>
          </CardContent>
        </Card>
      )}

      {grupos.map(([nome, lista]) => (
        <Card key={nome}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{nome}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {lista.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    m.low ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                  }`}>
                    <Package className="h-4 w-4" aria-hidden="true" />
                  </span>

                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setAEditar(m)}
                  >
                    <span className="block truncate font-medium">
                      {m.name}
                      {!m.active && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          desligado
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.sku && <>ref. {m.sku} · </>}
                      {formatCurrency(m.avgCost)}/{m.unit} em média
                      {m.minQty !== null && <> · mínimo {qtd(m.minQty)} {m.unit}</>}
                    </span>
                  </button>

                  <div className="shrink-0 text-right">
                    <p className={`font-semibold tabular-nums ${m.low ? 'text-destructive' : ''}`}>
                      {qtd(m.qty)} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span>
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(m.stockValue)}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setMovimento({ m, kind: 'ENTRADA' })}
                    >
                      <ArrowDownToLine className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Comprei
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setMovimento({ m, kind: 'SAIDA' })}
                    >
                      <ArrowUpFromLine className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Gastei
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setMovimento({ m, kind: 'AJUSTE' })}
                      title="Contei e o stock é outro"
                    >
                      <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {movimento && (
        <DialogoDeMovimento
          material={movimento.m}
          kind={movimento.kind}
          onFechar={() => setMovimento(null)}
        />
      )}
    </div>
  );
}

// ─── O formulário do material ───────────────────────────────────────────────

function FormularioDeMaterial({ material, categorias, onPronto, onCancelar }: {
  material: Material | null;
  categorias: string[];
  onPronto: () => void;
  onCancelar: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(material?.name ?? '');
  const [sku, setSku] = useState(material?.sku ?? '');
  const [unit, setUnit] = useState(material?.unit ?? 'un');
  const [category, setCategory] = useState(material?.category ?? '');
  const [minQty, setMinQty] = useState(material?.minQty !== null && material?.minQty !== undefined
    ? String(material.minQty) : '');
  const [notes, setNotes] = useState(material?.notes ?? '');

  const { mutate: gravar, isPending } = useMutation({
    mutationFn: () => {
      const dados = {
        name: name.trim(),
        sku: sku.trim() || null,
        unit: unit.trim() || 'un',
        category: category.trim() || null,
        minQty: minQty.trim() === '' ? null : Number(minQty),
        notes: notes.trim() || null,
      };
      return material
        ? materialsService.update(material.id, dados)
        : materialsService.create(dados);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE });
      toast.success(material ? 'Material atualizado.' : 'Material criado.');
      onPronto();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível gravar.'),
  });

  const { mutate: ligar } = useMutation({
    mutationFn: () => materialsService.update(material!.id, { active: !material!.active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE });
      toast.success(material!.active ? 'Material desligado.' : 'Material ligado.');
      onPronto();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível.'),
  });

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">
          {material ? `Editar · ${material.name}` : 'Novo material'}
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onCancelar} aria-label="Fechar">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="mt-nome">Nome</Label>
            <Input
              id="mt-nome" value={name} maxLength={160}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Óleo 5W30 Total Quartz"
            />
            <p className="text-xs text-muted-foreground">
              Com a especificação no nome: dois óleos diferentes são dois materiais,
              senão o stock deixa de bater com a prateleira.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mt-unidade">Unidade</Label>
            <Input
              id="mt-unidade" value={unit} maxLength={20}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="un, L, kg, par"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mt-categoria">Categoria</Label>
            <Input
              id="mt-categoria" value={category} maxLength={80} list="mt-categorias"
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Óleos, Filtros, Travões, Pneus"
            />
            {/* Sugere as que já existem sem obrigar a escolher: a lista cresce
                à medida que o material aparece, e não antes. */}
            <datalist id="mt-categorias">
              {categorias.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mt-ref">Referência do fornecedor</Label>
            <Input
              id="mt-ref" value={sku} maxLength={80}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mt-minimo">Avisar abaixo de</Label>
            <Input
              id="mt-minimo" type="number" min="0" step="0.001" inputMode="decimal"
              value={minQty} onChange={(e) => setMinQty(e.target.value)}
              placeholder="Vazio = nunca avisar"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="mt-notas">Notas</Label>
            <Textarea
              id="mt-notas" rows={2} value={notes} maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: comprar no fornecedor da Azambuja, caixa de 12."
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {material && (
            <Button variant="ghost" className="mr-auto text-destructive" onClick={() => ligar()}>
              {material.active ? 'Desligar material' : 'Voltar a ligar'}
            </Button>
          )}
          <Button variant="outline" onClick={onCancelar} disabled={isPending}>Cancelar</Button>
          <Button onClick={() => gravar()} disabled={!name.trim() || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Gravar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── O movimento ────────────────────────────────────────────────────────────

function DialogoDeMovimento({ material, kind, onFechar }: {
  material: Material;
  kind: StockMoveKind;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [notes, setNotes] = useState('');
  const [occurredAt, setOccurredAt] = useState(hoje());

  // Os carros só são precisos no consumo — é lá que se diz onde o material foi
  // gasto. Numa compra não se carrega a lista para nada.
  const carrosQ = useQuery({
    queryKey: ['vehicles', 'para-material'],
    queryFn: () => vehiclesService.list(),
    enabled: kind === 'SAIDA',
  });
  const carros = ((carrosQ.data as any)?.vehicles ?? []) as any[];

  const { mutate: gravar, isPending } = useMutation({
    mutationFn: () => materialsService.registerMove({
      materialId: material.id,
      kind,
      qty: Number(qty),
      unitCost: unitCost.trim() === '' ? null : Number(unitCost),
      supplier: supplier.trim() || null,
      invoiceRef: invoiceRef.trim() || null,
      vehicleId: vehicleId || null,
      notes: notes.trim() || null,
      occurredAt,
    }),
    onSuccess: ({ material: m }) => {
      queryClient.invalidateQueries({ queryKey: CHAVE });
      toast.success(`${m.name}: ${qtd(m.qty)} ${m.unit} em stock.`);
      onFechar();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível registar.'),
  });

  const quantidade = Number(qty);
  const valida = qty.trim() !== '' && Number.isFinite(quantidade)
    && (kind === 'AJUSTE' ? quantidade >= 0 : quantidade > 0)
    && (kind !== 'ENTRADA' || (unitCost.trim() !== '' && Number(unitCost) >= 0));

  // No ajuste, mostrar a diferença antes de gravar: é a confirmação de que a
  // pessoa escreveu a quantidade contada e não a diferença.
  const diferenca = kind === 'AJUSTE' && Number.isFinite(quantidade)
    ? quantidade - material.qty
    : null;

  const titulo = kind === 'ENTRADA' ? 'Comprei' : kind === 'SAIDA' ? 'Gastei' : 'Contei';

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo} · {material.name}</DialogTitle>
          <DialogDescription>
            Em stock agora: {qtd(material.qty)} {material.unit}
            {material.avgCost > 0 && <> a {formatCurrency(material.avgCost)}/{material.unit}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mv-qty">
                {kind === 'AJUSTE' ? `Quantidade contada (${material.unit})` : `Quantidade (${material.unit})`}
              </Label>
              <Input
                id="mv-qty" type="number" min="0" step="0.001" inputMode="decimal" autoFocus
                value={qty} onChange={(e) => setQty(e.target.value)}
              />
              {kind === 'AJUSTE' && (
                <p className="text-xs text-muted-foreground">
                  Escreva o que CONTOU, não a diferença.
                  {diferenca !== null && diferenca !== 0 && (
                    <span className={diferenca < 0 ? ' text-destructive' : ' text-emerald-600'}>
                      {' '}Dá {diferenca > 0 ? 'uma sobra' : 'uma falta'} de {qtd(Math.abs(diferenca))} {material.unit}.
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mv-data">Data</Label>
              <Input
                id="mv-data" type="date" max={hoje()}
                value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A data da factura, se for de outro dia.
              </p>
            </div>

            {kind === 'ENTRADA' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="mv-custo">Preço por {material.unit} (€)</Label>
                  <Input
                    id="mv-custo" type="number" min="0" step="0.0001" inputMode="decimal"
                    value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
                    placeholder="0,00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sem IVA ou com IVA — o que importa é ser sempre igual.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="mv-fornecedor">Fornecedor</Label>
                  <Input
                    id="mv-fornecedor" value={supplier} maxLength={160}
                    onChange={(e) => setSupplier(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="mv-factura">Número da factura</Label>
                  <Input
                    id="mv-factura" value={invoiceRef} maxLength={80}
                    onChange={(e) => setInvoiceRef(e.target.value)}
                    placeholder="Opcional, mas é o que liga o consumo ao papel"
                  />
                </div>
              </>
            )}

            {kind === 'SAIDA' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mv-carro">Em que carro</Label>
                <Select value={vehicleId || 'NENHUM'} onValueChange={(v) => setVehicleId(v === 'NENHUM' ? '' : v)}>
                  <SelectTrigger id="mv-carro"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NENHUM">Nenhum em particular</SelectItem>
                    {carros.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.plate} — {c.brand} {c.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  É isto que faz o custo aparecer no carro. Sem carro, fica como gasto da frota.
                </p>
              </div>
            )}

            {kind === 'AJUSTE' && material.avgCost === 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="mv-custo-ajuste">Preço por {material.unit} (€)</Label>
                <Input
                  id="mv-custo-ajuste" type="number" min="0" step="0.0001" inputMode="decimal"
                  value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="Opcional"
                />
                <p className="text-xs text-muted-foreground">
                  Este material ainda não tem preço. Se souber quanto custa, escreva — é o que
                  valoriza o stock daqui para a frente.
                </p>
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mv-notas">Notas</Label>
              <Textarea
                id="mv-notas" rows={2} value={notes} maxLength={1000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={kind === 'SAIDA'
                  ? 'Ex.: revisão dos 120 mil.'
                  : 'Opcional.'}
              />
            </div>
          </div>

          {/* O aviso do stock negativo aparece ANTES de gravar: o servidor
              aceita-o de propósito (ver `custeio.ts`), e quem decide se é um
              erro de escrita ou uma factura em atraso é quem está a olhar. */}
          {kind === 'SAIDA' && Number.isFinite(quantidade) && quantidade > material.qty && (
            <p className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
              Está a gastar mais do que o stock diz existir. Fica negativo — o que
              normalmente quer dizer que falta lançar uma compra.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={onFechar} disabled={isPending} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={() => gravar()} disabled={!valida || isPending} className="w-full sm:w-auto">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Registar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Movimentos ─────────────────────────────────────────────────────────────

function Movimentos({ de, a }: { de: string; a: string }) {
  const [kind, setKind] = useState<'TODOS' | StockMoveKind>('TODOS');

  const q = useQuery({
    queryKey: [...CHAVE, 'moves', de, a, kind],
    queryFn: () => materialsService.moves({
      from: de, to: a,
      kind: kind === 'TODOS' ? undefined : kind,
    }),
  });

  const movimentos = q.data?.moves ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="w-auto min-w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Tudo</SelectItem>
            <SelectItem value="ENTRADA">Só compras</SelectItem>
            <SelectItem value="SAIDA">Só consumos</SelectItem>
            <SelectItem value="AJUSTE">Só contagens</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {q.isLoading ? 'A carregar…' : `${movimentos.length} movimento(s) no período.`}
        </p>
      </div>

      {q.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}

      {!q.isLoading && movimentos.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nada registado neste período.
          </CardContent>
        </Card>
      )}

      {movimentos.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {movimentos.map((mv) => (
                <li key={mv.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    CLASSE_DO_TOM[MOVIMENTOS[mv.kind].tom]
                  }`}>
                    {MOVIMENTOS[mv.kind].rotulo}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{mv.materialName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {dataCurta(mv.occurredAt)}
                      {mv.supplier && <> · {mv.supplier}</>}
                      {mv.invoiceRef && <> · fact. {mv.invoiceRef}</>}
                      {mv.vehiclePlate && <> · {mv.vehiclePlate}</>}
                      {mv.bookingLabel && <> · {mv.bookingLabel}</>}
                      {mv.createdByName && <> · {mv.createdByName}</>}
                    </p>
                    {mv.notes && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{mv.notes}</p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">
                      {mv.kind === 'ENTRADA' ? '+' : mv.kind === 'SAIDA' ? '−' : '±'}
                      {qtd(mv.qty)} <span className="text-xs font-normal text-muted-foreground">{mv.unit}</span>
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {mv.totalCost !== null ? formatCurrency(mv.totalCost) : '—'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Por carro ──────────────────────────────────────────────────────────────

function PorCarro({ de, a }: { de: string; a: string }) {
  const q = useQuery({
    queryKey: [...CHAVE, 'by-vehicle', de, a],
    queryFn: () => materialsService.costByVehicle({ from: de, to: a }),
  });

  const linhas = q.data?.rows ?? [];
  const total = linhas.reduce((s, l) => s + l.total, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Só o material CONSUMIDO. As compras não aparecem aqui: o óleo compra-se aos
        vinte litros e gasta-se em quatro carros — atribuir a compra a um carro punha
        o custo todo no primeiro que aparecesse.
      </p>

      {q.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}

      {!q.isLoading && linhas.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Car className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Nenhum consumo registado neste período.
            </p>
          </CardContent>
        </Card>
      )}

      {linhas.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {linhas.map((l) => (
                <li key={l.vehicleId ?? 'sem-carro'} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Car className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium font-mono tracking-tight">{l.plate}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.name ?? 'material da frota'} · {l.moves} consumo(s)
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">{formatCurrency(l.total)}</p>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <span className="text-sm font-medium">Total do período</span>
              <span className="font-semibold tabular-nums">{formatCurrency(total)}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
