// src/app/components/admin/green-receipts.tsx
//
// Registo de recibos verdes: quem emitiu, a quem, quanto e quando.
//
// PARA QUE SERVE: um operador com várias sociedades tem de saber que entidade
// recebeu que fatura. É contabilidade corrente, e é o que esta tela mostra.
//
// O QUE ESTA TELA NÃO FAZ, E É DELIBERADO: não calcula a percentagem que cada
// sociedade representa no total de um motorista, não compara nada com limiares,
// e não sugere a quem emitir a seguir. Um registo diz o que aconteceu; essas
// contas diriam o que fazer a seguir para ficar de um lado de uma linha, e isso
// é outra ferramenta — uma que não está aqui e não deve ser acrescentada por
// parecer um passo pequeno a partir daqui.
//
// Só entram retiradas decididas: uma pendente ainda pode ser rejeitada, e o
// recibo dela pode nunca chegar a existir.

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { PageHeader } from '@/app/components/ui/page-header';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import {
  AlertCircle, Building2, Download, ExternalLink, FileText, Loader2, Pencil, Plus,
  Power, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { withdrawalsService } from '@/features/driver/services/withdrawals.service';
import { usersService } from '@/features/admin/services/users.service';
import {
  companiesService, describeCompany,
} from '@/shared/services/companies.service';
import {
  CompanyPicker, isChoiceComplete, type CompanyChoice,
} from '@/app/components/admin/company-picker';
import { formatCurrency } from '@/shared/lib/format';
import { queryKeys } from '@/shared/lib/query-keys';
import { invalidateAfterCompany } from '@/shared/lib/invalidate';
import type { ApiWithdrawal, ApiCompany } from '@/shared/types/api';

const ALL = '__all__';
const UNCLASSIFIED = '__unclassified__';

function ymd(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT');
}

// ── Gestão da lista de sociedades ─────────────────────────────────────────────

function CompaniesCard() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<ApiCompany | null>(null);
  const [editName, setEditName] = useState('');

  // `all` porque esta é a tela que gere a lista: as desativadas têm de estar
  // visíveis para poderem ser reativadas.
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.companies.all,
    queryFn: () => companiesService.list(true),
  });

  const companies = data?.companies ?? [];

  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: (name: string) => companiesService.create(name),
    onSuccess: () => {
      invalidateAfterCompany(queryClient);
      toast.success('Sociedade acrescentada.');
      setNewName('');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível acrescentar.'),
  });

  const { mutate: update, isPending: updating } = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; active?: boolean }) =>
      companiesService.update(id, data),
    onSuccess: () => {
      invalidateAfterCompany(queryClient);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível alterar.'),
  });

  const { mutate: remove } = useMutation({
    mutationFn: (id: string) => companiesService.remove(id),
    onSuccess: () => {
      invalidateAfterCompany(queryClient);
      toast.success('Sociedade apagada.');
    },
    // O servidor recusa apagar uma sociedade que já tem recibos, e a mensagem
    // dele explica porquê melhor do que qualquer texto genérico daqui.
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível apagar.'),
  });

  return (
    <Card className="shadow-card">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Building2 className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
          Sociedades
        </CardTitle>
        <p className="mt-0.5 text-sm text-muted-foreground">
          As entidades a quem os motoristas podem emitir recibo
        </p>
      </CardHeader>

      <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
        {isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : (
          <ul className="divide-y divide-border">
            {companies.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${c.active ? 'font-medium' : 'text-muted-foreground line-through'}`}>
                    {c.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.withdrawalCount ?? 0} recibo{(c.withdrawalCount ?? 0) === 1 ? '' : 's'}
                    {!c.active && ' · desativada'}
                  </p>
                </div>

                <Button
                  size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={updating}
                  onClick={() => { setEditing(c); setEditName(c.name); }}
                  aria-label={`Renomear ${c.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={updating}
                  onClick={() => update({ id: c.id, active: !c.active })}
                  aria-label={c.active ? `Desativar ${c.name}` : `Reativar ${c.name}`}
                >
                  <Power className={`h-3.5 w-3.5 ${c.active ? '' : 'text-muted-foreground'}`} aria-hidden="true" />
                </Button>
                {/* Só sem recibos. O servidor recusa de qualquer maneira, mas
                    esconder o botão poupa o erro a quem não sabe a regra. */}
                {(c.withdrawalCount ?? 0) === 0 && (
                  <Button
                    size="sm" variant="ghost" className="h-8 w-8 p-0"
                    onClick={() => remove(c.id)}
                    aria-label={`Apagar ${c.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome da sociedade"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim().length >= 2) create(newName);
            }}
          />
          <Button
            className="shrink-0"
            disabled={creating || newName.trim().length < 2}
            onClick={() => create(newName)}
          >
            {creating
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Plus className="mr-2 h-4 w-4" aria-hidden="true" />}
            Acrescentar
          </Button>
        </div>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear sociedade</DialogTitle>
            <DialogDescription>
              O nome muda em todos os recibos já emitidos a esta sociedade — as
              retiradas guardam a entidade, não o texto.
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0">
            <Label htmlFor="company-name">Nome</Label>
            <Input
              id="company-name" className="mt-2"
              value={editName} onChange={(e) => setEditName(e.target.value)}
            />
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setEditing(null)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              disabled={updating || editName.trim().length < 2}
              className="w-full sm:w-auto"
              onClick={() => update({ id: editing!.id, name: editName.trim() })}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── A tela ────────────────────────────────────────────────────────────────────

export function GreenReceipts() {
  const queryClient = useQueryClient();
  const [driverFilter, setDriverFilter] = useState<string>(ALL);
  const [companyFilter, setCompanyFilter] = useState<string>(ALL);
  const [editing, setEditing] = useState<ApiWithdrawal | null>(null);
  const [choice, setChoice] = useState<CompanyChoice | null>(null);

  const withdrawalsQ = useQuery({
    queryKey: queryKeys.withdrawals.list,
    queryFn: () => withdrawalsService.list(),
  });

  const usersQ = useQuery({
    queryKey: queryKeys.users.list,
    queryFn: () => usersService.list(),
  });

  const companiesQ = useQuery({
    queryKey: queryKeys.companies.all,
    queryFn: () => companiesService.list(true),
  });

  const driverName = (id: string) =>
    usersQ.data?.users.find((u) => u.id === id)?.name ?? '—';

  const { mutate: reclassify, isPending: saving } = useMutation({
    mutationFn: ({ id, value }: { id: string; value: CompanyChoice }) =>
      companiesService.setWithdrawalCompany(id, {
        companyId: value.companyId,
        companyOther: value.companyOther?.trim() || null,
      }),
    onSuccess: () => {
      invalidateAfterCompany(queryClient);
      toast.success('Recibo classificado.');
      setEditing(null);
      setChoice(null);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Não foi possível classificar.'),
  });

  // Só as decididas: uma pendente ainda pode ser rejeitada, e o recibo dela
  // pode nunca chegar a existir. Rejeitadas não geram recibo nenhum.
  const rows = useMemo(() => {
    const all = (withdrawalsQ.data?.withdrawals ?? [])
      .filter((w) => w.status === 'APPROVED' || w.status === 'PAID');

    return all
      .filter((w) => driverFilter === ALL || w.userId === driverFilter)
      .filter((w) => {
        if (companyFilter === ALL) return true;
        if (companyFilter === UNCLASSIFIED) return !w.companySetAt;
        return w.companyId === companyFilter;
      })
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [withdrawalsQ.data, driverFilter, companyFilter]);

  const unclassified = (withdrawalsQ.data?.withdrawals ?? [])
    .filter((w) => (w.status === 'APPROVED' || w.status === 'PAID') && !w.companySetAt).length;

  /**
   * Exportação para o contabilista.
   *
   * Feita no cliente sobre o que está filtrado: o que ele leva é o que está a
   * ver, sem uma segunda consulta ao servidor a poder devolver outra coisa.
   * O BOM à cabeça é o que faz o Excel abrir os acentos corretamente.
   */
  function exportCsv() {
    const head = ['Data', 'Motorista', 'Valor', 'Sociedade', 'Estado'];
    const body = rows.map((w) => [
      ymd(w.requestedAt),
      driverName(w.userId),
      Number(w.amount).toFixed(2).replace('.', ','),
      describeCompany(w).label,
      w.status === 'PAID' ? 'Pago' : 'Aprovado',
    ]);

    const csv = [head, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibos-verdes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (withdrawalsQ.isLoading) {
    return (
      <div className="space-y-5" role="status" aria-busy="true">
        <span className="sr-only">A carregar os recibos…</span>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (withdrawalsQ.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p className="text-muted-foreground">Erro ao carregar os recibos.</p>
        <Button variant="outline" onClick={() => withdrawalsQ.refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Recibos Verdes"
        subtitle="A que sociedade cada motorista emitiu recibo"
        icon={<FileText className="h-5 w-5" />}
        actions={
          <Button variant="outline" className="w-full sm:w-auto" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Exportar CSV
          </Button>
        }
      />

      <CompaniesCard />

      {unclassified > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <span className="font-medium">{unclassified}</span>{' '}
            retirada{unclassified === 1 ? '' : 's'} sem sociedade registada — são anteriores a
            este campo. Classifique-as pelo botão de cada linha.
          </p>
        </div>
      )}

      <Card className="shadow-card">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Registo</CardTitle>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os motoristas</SelectItem>
                {(usersQ.data?.users ?? [])
                  .filter((u) => u.role === 'DRIVER')
                  .map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as sociedades</SelectItem>
                <SelectItem value={UNCLASSIFIED}>Por classificar</SelectItem>
                {(companiesQ.data?.companies ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum recibo corresponde a estes filtros.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((w) => {
                const c = describeCompany(w);
                return (
                  <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{driverName(w.userId)}</p>
                      <p className="text-xs text-muted-foreground">
                        {ymd(w.requestedAt)} · {w.status === 'PAID' ? 'Pago' : 'Aprovado'}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.classified
                          ? 'bg-secondary text-foreground'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {c.label}
                    </span>

                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatCurrency(Number(w.amount))}
                    </p>

                    {w.receiptUrl && (
                      <Button asChild size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0">
                        <a
                          href={w.receiptUrl} target="_blank" rel="noopener noreferrer"
                          aria-label="Abrir recibo"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0"
                      onClick={() => {
                        setEditing(w);
                        setChoice(
                          w.companyId ? { companyId: w.companyId, companyOther: null }
                            : w.companyOther ? { companyId: null, companyOther: w.companyOther }
                              : w.companySetAt ? { companyId: null, companyOther: null }
                                : null,
                        );
                      }}
                      aria-label="Classificar recibo"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!editing}
        onOpenChange={(o) => { if (!o) { setEditing(null); setChoice(null); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Classificar recibo</DialogTitle>
            <DialogDescription>
              {editing && (
                <>
                  {formatCurrency(Number(editing.amount))} de {driverName(editing.userId)},
                  de {ymd(editing.requestedAt)}. Fica registado quem alterou e quando.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0">
            <CompanyPicker value={choice} onChange={setChoice} disabled={saving} />
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline" disabled={saving} className="w-full sm:w-auto"
              onClick={() => { setEditing(null); setChoice(null); }}
            >
              Cancelar
            </Button>
            <Button
              disabled={saving || !isChoiceComplete(choice)}
              className="w-full sm:w-auto"
              onClick={() => reclassify({ id: editing!.id, value: choice! })}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
