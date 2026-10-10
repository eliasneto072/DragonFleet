// src/app/components/system/plans-admin.tsx
//
// O editor de planos: o que custa, quanto dura, e que menus abre.
//
// ─── AS CAIXAS VÊM DO SERVIDOR ──────────────────────────────────────────────
//
// A lista das funcionalidades é pedida ao servidor (`/system/catalogo`) e não
// escrita aqui. Escrita aqui seria uma segunda lista, e bastava acrescentar uma
// funcionalidade de um lado e não do outro para ficar uma caixa que grava um
// código que o servidor não reconhece — um plano que diz que dá acesso a uma
// coisa e não dá. Isso só se descobre quando um cliente telefona.
//
// ─── ALTERAR UM PLANO MUDA O QUE OS CLIENTES DELE VEEM ──────────────────────
//
// De propósito, e é a razão de existir um editor. Não se guarda uma cópia das
// funcionalidades por frota: isso dava clientes no "mesmo" plano com acessos
// diferentes e ninguém saberia explicar porquê. Quem precisar de condições
// próprias leva um plano só dele — é para isso que serve a duração à medida.
// A tela diz quantas frotas vão sentir a alteração antes de ela ser feita.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Check, Loader2, Package, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Switch } from '@/app/components/ui/switch';
import { Badge } from '@/app/components/ui/badge';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatCurrency } from '@/shared/lib/format';
import {
  systemService, DURACOES, type Funcionalidade, type Plano,
} from '@/features/system/services/system.service';

const A_MEDIDA = 'medida';

/** O nome da duração, quando é uma das habituais. */
function nomeDaDuracao(dias: number): string {
  return DURACOES.find((d) => d.dias === dias)?.nome ?? `${dias} dias`;
}

// ── Editar / criar um plano ──────────────────────────────────────────────────

function PlanoDialog({
  plano, catalogo, grupos, obrigatorias, onClose,
}: {
  /** `null` cria um plano novo. */
  plano: Plano | null;
  catalogo: Funcionalidade[];
  grupos: string[];
  obrigatorias: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const duracaoInicial = plano
    ? (DURACOES.some((d) => d.dias === plano.duracaoDias)
      ? String(plano.duracaoDias)
      : A_MEDIDA)
    : '30';

  const [f, setF] = useState(() => ({
    nome: plano?.nome ?? '',
    duracao: duracaoInicial,
    dias: String(plano?.duracaoDias ?? 30),
    preco: plano?.preco ?? '',
    notas: plano?.notas ?? '',
    activo: plano?.activo ?? true,
  }));
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  // As obrigatórias entram marcadas e não se desmarcam — ver `obrigatoria` no
  // catálogo do servidor.
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set([...(plano?.funcionalidades ?? []), ...obrigatorias]),
  );

  function alternar(codigo: string) {
    if (obrigatorias.includes(codigo)) return;
    setMarcadas((p) => {
      const n = new Set(p);
      if (n.has(codigo)) n.delete(codigo); else n.add(codigo);
      return n;
    });
  }

  function marcarGrupo(grupo: string, ligar: boolean) {
    const codigos = catalogo.filter((c) => c.grupo === grupo).map((c) => c.codigo);
    setMarcadas((p) => {
      const n = new Set(p);
      for (const c of codigos) {
        if (obrigatorias.includes(c)) continue;
        if (ligar) n.add(c); else n.delete(c);
      }
      return n;
    });
  }

  const duracaoDias = f.duracao === A_MEDIDA ? Number(f.dias) : Number(f.duracao);
  const preco = Number(String(f.preco).replace(',', '.'));

  const corpo = {
    nome: f.nome.trim(),
    duracaoDias,
    preco: Number.isFinite(preco) ? preco : 0,
    funcionalidades: [...marcadas],
    notas: f.notas.trim() || null,
    activo: f.activo,
  };

  const m = useMutation({
    mutationFn: () => (plano
      ? systemService.actualizarPlano(plano.id, corpo)
      : systemService.criarPlano(corpo)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sistema.all });
      toast.success(plano ? 'Plano actualizado.' : 'Plano criado.');
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível guardar.'),
  });

  const podeGravar = corpo.nome.length >= 2
    && duracaoDias >= 1
    && Number.isFinite(preco) && preco >= 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plano ? plano.nome : 'Novo plano'}</DialogTitle>
          <DialogDescription>
            {plano && plano.frotas > 0
              // Dito antes de gravar, e não depois: tirar uma caixa aqui tira
              // esse menu a quem já está neste plano.
              ? `${plano.frotas} frota${plano.frotas === 1 ? '' : 's'} está neste plano — `
                + 'o que mudares aqui muda o que essas frotas veem.'
              : 'Marca os menus que este plano dá acesso.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={f.nome}
                onChange={(e) => set('nome', e.target.value)}
                placeholder="Essencial, Completo, Anual..."
              />
            </div>
            <div className="space-y-2">
              <Label>Preço por renovação (€)</Label>
              <Input
                value={f.preco}
                onChange={(e) => set('preco', e.target.value)}
                placeholder="49,90"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Duração</Label>
              <Select value={f.duracao} onValueChange={(v) => set('duracao', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURACOES.map((d) => (
                    <SelectItem key={d.dias} value={String(d.dias)}>
                      {d.nome} ({d.dias} dias)
                    </SelectItem>
                  ))}
                  <SelectItem value={A_MEDIDA}>À medida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {f.duracao === A_MEDIDA && (
              <div className="space-y-2">
                <Label>Quantos dias</Label>
                <Input
                  type="number" min={1}
                  value={f.dias}
                  onChange={(e) => set('dias', e.target.value)}
                />
              </div>
            )}
          </div>

          {/* ── As caixas dos menus ──────────────────────────────────────── */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">O que este plano inclui</p>
              <span className="text-xs text-muted-foreground">
                {marcadas.size} de {catalogo.length}
              </span>
            </div>

            {grupos.map((grupo) => {
              const doGrupo = catalogo.filter((c) => c.grupo === grupo);
              if (doGrupo.length === 0) return null;
              const todas = doGrupo.every((c) => marcadas.has(c.codigo));

              return (
                <div key={grupo} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {grupo}
                    </p>
                    <Button
                      variant="ghost" size="sm" className="h-6 text-xs"
                      onClick={() => marcarGrupo(grupo, !todas)}
                    >
                      {todas ? 'Nenhum' : 'Todos'}
                    </Button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {doGrupo.map((c) => {
                      const fixa = obrigatorias.includes(c.codigo);
                      return (
                        <label
                          key={c.codigo}
                          className={`flex gap-3 rounded-lg border p-3 ${
                            fixa ? 'opacity-70' : 'cursor-pointer hover:bg-muted/50'
                          }`}
                        >
                          <Checkbox
                            checked={marcadas.has(c.codigo)}
                            disabled={fixa}
                            onCheckedChange={() => alternar(c.codigo)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="text-sm font-medium block">
                              {c.nome}
                              {fixa && (
                                <span className="text-xs text-muted-foreground font-normal">
                                  {' '}· sempre incluído
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground block">
                              {c.descricao}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label>Notas (só para ti)</Label>
            <Textarea
              rows={2}
              value={f.notas}
              onChange={(e) => set('notas', e.target.value)}
              placeholder="A quem se vende isto, e porquê."
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Disponível para vender</p>
              <p className="text-xs text-muted-foreground">
                Arquivado deixa de aparecer na criação de frotas e continua a
                valer para quem já o tem.
              </p>
            </div>
            <Switch checked={f.activo} onCheckedChange={(v) => set('activo', v)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => m.mutate()} disabled={!podeGravar || m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {plano ? 'Guardar' : 'Criar plano'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── A tela ───────────────────────────────────────────────────────────────────

export function PlansAdmin() {
  const qc = useQueryClient();
  const [aEditar, setAEditar] = useState<Plano | null>(null);
  const [novo, setNovo] = useState(false);

  const planosQ = useQuery({
    queryKey: queryKeys.sistema.planos,
    queryFn: () => systemService.planos(),
  });
  // O catálogo muda quando o código muda, não quando alguém mexe num plano.
  const catalogoQ = useQuery({
    queryKey: queryKeys.sistema.catalogo,
    queryFn: () => systemService.catalogo(),
    staleTime: 60 * 60 * 1000,
  });

  const arquivar = useMutation({
    mutationFn: (id: string) => systemService.arquivarPlano(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.sistema.all });
      toast.success('Plano arquivado.');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Não foi possível arquivar.'),
  });

  const planos = planosQ.data?.planos ?? [];
  const catalogo = catalogoQ.data?.funcionalidades ?? [];
  const grupos = catalogoQ.data?.grupos ?? [];
  const obrigatorias = catalogoQ.data?.obrigatorias ?? [];

  const nomePorCodigo = useMemo(
    () => new Map(catalogo.map((c) => [c.codigo, c.nome])),
    [catalogo],
  );

  const pronto = !planosQ.isLoading && !catalogoQ.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planos"
        subtitle="O que custa cada plano, quanto dura, e que menus abre."
        icon={<Package className="h-5 w-5" />}
        actions={
          <Button onClick={() => setNovo(true)} disabled={!pronto}>
            <Plus className="h-4 w-4 mr-2" />
            Novo plano
          </Button>
        }
      />

      {!pronto && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {pronto && planos.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <p className="font-medium">Ainda não há planos.</p>
            <p className="text-sm text-muted-foreground">
              Uma frota pode ser criada sem plano — mas sem planos não há nada
              para renovar automaticamente.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {planos.map((p) => (
          <Card key={p.id} className={p.activo ? '' : 'opacity-70'}>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{p.nome}</h3>
                    {!p.activo && <Badge variant="outline">Arquivado</Badge>}
                    {p.frotas > 0 && (
                      <Badge variant="secondary">
                        {p.frotas} frota{p.frotas === 1 ? '' : 's'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(p.preco)} · {nomeDaDuracao(p.duracaoDias)}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setAEditar(p)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {p.activo && (
                    <Button
                      variant="ghost" size="sm" title="Arquivar"
                      onClick={() => arquivar.mutate(p.id)}
                      disabled={arquivar.isPending}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {p.funcionalidades.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 text-xs rounded-md bg-muted px-2 py-1"
                  >
                    <Check className="h-3 w-3 text-emerald-600" />
                    {nomePorCodigo.get(c) ?? c}
                  </span>
                ))}
              </div>

              {p.notas && (
                <p className="text-xs text-muted-foreground border-t pt-3">{p.notas}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* A chave força o formulário a nascer de novo por plano: sem ela, o
          estado inicial era o do primeiro plano aberto. */}
      {aEditar && (
        <PlanoDialog
          key={aEditar.id} plano={aEditar}
          catalogo={catalogo} grupos={grupos} obrigatorias={obrigatorias}
          onClose={() => setAEditar(null)}
        />
      )}
      {novo && (
        <PlanoDialog
          key="novo" plano={null}
          catalogo={catalogo} grupos={grupos} obrigatorias={obrigatorias}
          onClose={() => setNovo(false)}
        />
      )}
    </div>
  );
}
