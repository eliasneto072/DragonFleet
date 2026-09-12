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
  AlertCircle, Building2, Download, ExternalLink, FileSpreadsheet, FileText, Loader2, Pencil, Plus, Power, Search, Trash2,
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
import { useListState } from '@/shared/hooks/use-list-state';
import { Pagination } from '@/app/components/ui/list-toolbar';
import { saveBlob } from '@/shared/lib/api-client';
import { reportsService } from '@/features/admin/services/reports.service';

const ALL = '__all__';
const UNCLASSIFIED = '__unclassified__';

function ymd(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT');
}

// ── Gestão da lista de sociedades ─────────────────────────────────────────────

/**
 * Gestao da lista, e o total de cada sociedade.
 *
 * `onSelect` liga o cartao ao registo por baixo: clicar numa sociedade
 * filtra a lista para os recibos que compoem aquele total. Sem isso, os
 * numeros ficavam por verificar — a tela dizia "4 recibos, 820 EUR" e nao
 * havia caminho nenhum para ver quais.
 */
function CompaniesCard({ onSelect }: { onSelect: (companyId: string) => void }) {
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
                {/* A linha filtra o registo por esta sociedade. É o caminho
                    dos números para os recibos que os compõem: ver "4 recibos,
                    820 €" e não poder abrir os quatro deixava o total por
                    verificar. */}
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Ver os recibos de ${c.name}`}
                >
                  <p className={`truncate text-sm ${c.active ? 'font-medium' : 'text-muted-foreground line-through'}`}>
                    {c.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.receiptCount ?? 0} recibo{(c.receiptCount ?? 0) === 1 ? '' : 's'}
                    {' · '}
                    <span className="font-medium text-foreground">
                      {formatCurrency(c.receiptTotal ?? 0)}
                    </span>
                    {!c.active && ' · desativada'}
                  </p>
                </button>

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
                {/* linkedCount e não receiptCount: o servidor recusa apagar
                    por causa de QUALQUER retirada ligada, incluindo as que
                    foram rejeitadas depois de classificadas e que não contam
                    como recibo. Usar o número visível escondia o botão em
                    casos diferentes daqueles em que o servidor recusa, e o
                    erro aparecia sem explicação. */}
                {(c.linkedCount ?? 0) === 0 && (
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
  // Pesquisa, filtro de sociedade e página no endereço.
  const lista = useListState({ defaults: { sociedade: ALL } });
  const [editing, setEditing] = useState<ApiWithdrawal | null>(null);
  const [exporting, setExporting] = useState(false);
  const [choice, setChoice] = useState<CompanyChoice | null>(null);

  // Só as decididas geram recibo: uma pendente ainda pode ser rejeitada, e uma
  // rejeitada não gera nenhum. O filtro de estado vai no pedido em vez de ser
  // aplicado depois — com paginação, filtrar aqui devolveria uma página já
  // desfalcada e a contagem mentiria.
  const withdrawalsQ = useQuery({
    queryKey: [
      ...queryKeys.withdrawals.list, 'recibos',
      lista.search, lista.filters.sociedade, lista.page,
    ] as const,
    queryFn: () => withdrawalsService.list({
      status: 'PAID',
      search: lista.search || undefined,
      // A sociedade vai no PEDIDO. Estava apenas na chave da consulta, e o
      // filtro era depois aplicado as 25 linhas da pagina enquanto o pager
      // continuava a contar as 2004 — escolher uma sociedade com dois recibos
      // mostrava zero linhas.
      companyId: lista.filters.sociedade === ALL ? undefined : lista.filters.sociedade,
      page: lista.page,
      pageSize: 25,
    }),
    placeholderData: (anterior) => anterior,
  });

  const usersQ = useQuery({
    queryKey: queryKeys.users.allUnpaged,
    queryFn: () => usersService.listAll(),
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
  // O filtro por sociedade continua a ser aplicado sobre a página.
  //
  // É uma limitação assumida e não um esquecimento: o servidor ainda não sabe
  // filtrar por sociedade, e implementá-lo é o passo seguinte. Enquanto isso,
  // este filtro afina o que está à vista — e é por isso que o rótulo diz
  // "nesta página" em vez de fingir que cobre tudo.
  const pageInfo = withdrawalsQ.data?.page;
  // Sem filtragem no cliente: o servidor ja devolve o que o filtro pede, e o
  // `pageInfo` conta o mesmo conjunto. Antes discordavam.
  const rows = withdrawalsQ.data?.withdrawals ?? [];

  // Do servidor, e nao contado sobre a pagina carregada. A versao anterior
  // percorria os 25 registos da pagina e anunciava "22 retiradas sem sociedade"
  // quando a base tinha 2000 — quem lia fechava a tela a pensar que estava
  // quase a acabar.
  const unclassified = withdrawalsQ.data?.totals?.unclassified ?? 0;

  /**
   * Soma do que esta filtrado.
   *
   * Somada aqui e nao no servidor porque e a soma DESTAS linhas, as que estao
   * a ser mostradas — e o ponto e poder confronta-la com o total que o cartao
   * da sociedade mostra. Se filtrar por uma sociedade e os dois numeros nao
   * baterem, ha alguma coisa errada e ve-se a olho.
   *
   * A conta e sobre poucas dezenas de linhas ja convertidas para numero. Os
   * totais que contam — os do cartao — vem somados em SQL.
   */
  const filteredTotal = useMemo(
    () => rows.reduce((sum, w) => sum + Number(w.amount), 0),
    [rows],
  );

  /**
   * Exportação para o contabilista.
   *
   * ─── ISTO LEVAVA 25 LINHAS ────────────────────────────────────────────────
   *
   * A versão anterior exportava o `rows` desta tela — que é UMA PÁGINA de 25
   * registos. O comentário dizia que "o que ele leva é o que está a ver", e era
   * verdade no sentido literal e errado no sentido que importa: o contabilista
   * que pedia o mês recebia vinte e cinco linhas, num ficheiro chamado
   * `recibos-verdes-<data>.csv`, sem nada que o avisasse. Nem ele nem quem
   * exportou tinham como saber que faltava o resto.
   *
   * Agora percorre as páginas todas antes de escrever. O teto do servidor é
   * 200 por pedido (MAX_PAGE_SIZE), portanto para um mês típico é um ou dois
   * pedidos.
   *
   * O filtro de sociedade continua a ser aplicado AQUI, e não no pedido, porque
   * o servidor ainda não sabe filtrar por sociedade. É a razão pela qual esta
   * exportação não foi para o servidor como a da Faturação foi.
   *
   * O BOM à cabeça é o que faz o Excel abrir os acentos corretamente, e o
   * ponto-e-vírgula com vírgula decimal é a convenção portuguesa. Isto é CSV —
   * no `.xlsx` da Faturação a regra é a oposta, números a sério e formato
   * aplicado pelo Excel.
   */
  async function exportCsv() {
    let todas: ApiWithdrawal[] = [];

    try {
      const TAMANHO = 200;
      for (let pagina = 1; ; pagina++) {
        const r = await withdrawalsService.list({
          status: 'PAID',
          search: lista.search || undefined,
          companyId: lista.filters.sociedade === ALL ? undefined : lista.filters.sociedade,
          page: pagina,
          pageSize: TAMANHO,
        });
        todas = todas.concat(r.withdrawals ?? []);
        if (!r.page?.hasMore) break;
        // Cinto de segurança: cinquenta páginas são dez mil recibos. Se algum
        // dia a base crescer para além disto, é melhor o ficheiro sair
        // incompleto com aviso do que o separador congelar num ciclo.
        if (pagina >= 50) {
          toast.warning('Muitos recibos — o ficheiro leva os primeiros 10 000.');
          break;
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Não foi possível obter os recibos para exportar.');
      return;
    }

    // Sem filtro no cliente: o pedido ja leva a sociedade.
    const selecionadas = todas;

    if (selecionadas.length === 0) {
      toast.error('Nada para exportar com os filtros aplicados.');
      return;
    }

    escreverCsv(selecionadas);
    toast.success(`${selecionadas.length} recibo(s) exportado(s).`);
  }

  /** Excel, gerado no servidor com os filtros da tela. */
  async function exportarExcel() {
    setExporting(true);
    try {
      await reportsService.downloadReceiptsXlsx({
        companyId: lista.filters.sociedade === ALL ? undefined : lista.filters.sociedade,
        search: lista.search || undefined,
      });
      toast.success('Ficheiro descarregado.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Nao foi possivel exportar.');
    } finally {
      setExporting(false);
    }
  }

  function escreverCsv(linhas: ApiWithdrawal[]) {
    // ─── ORDEM CRESCENTE ─────────────────────────────────────────────────────
    //
    // A tela mostra o mais recente primeiro, que e o que interessa a quem olha
    // para o ecra. Um documento contabilistico le-se ao contrario: do inicio do
    // periodo para o fim, como um extrato. O contabilista vai conferir contra
    // outros registos que tambem estao por ordem cronologica.
    const ordenadas = [...linhas].sort(
      (a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime(),
    );

    const head = ['Data', 'Motorista', 'Valor', 'Sociedade', 'Estado', 'Referência'];

    // `ordenadas`, nao `rows`. O `rows` e a pagina visivel — usa-lo aqui era
    // exatamente o bug que esta funcao acabou de deixar de ter.
    const body = ordenadas.map((w) => [
      ymd(w.requestedAt),
      driverName(w.userId),
      Number(w.amount).toFixed(2).replace('.', ','),
      describeCompany(w).label,
      w.status === 'PAID' ? 'Pago' : 'Aprovado',
      // A referencia torna cada linha rastreavel. Sem ela, "este recibo de
      // 96,84 EUR de que retirada e?" nao tem resposta — e num ficheiro de duas
      // mil linhas essa pergunta aparece.
      w.id,
    ]);

    // ─── LINHA DE TOTAL ──────────────────────────────────────────────────────
    //
    // Duas mil linhas sem total obriga quem recebe a soma-las. Vai no fim, com
    // a contagem, e as colunas que nao se somam ficam vazias em vez de repetir
    // rotulos.
    const somaTotal = ordenadas.reduce((acc, w) => acc + Number(w.amount), 0);
    const total = [
      `TOTAL (${ordenadas.length} recibos)`,
      '',
      somaTotal.toFixed(2).replace('.', ','),
      '', '', '',
    ];

    const csv = [head, ...body, total]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    // `saveBlob` do api-client em vez de repetir o createObjectURL aqui. O
    // comentario naquele ficheiro conta a historia: havia duas copias disto no
    // projeto e uma revogava o URL de imediato, o que cancela o download em
    // alguns browsers. Esta era a copia que faltava juntar.
    saveBlob(
      new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
      nomeDoFicheiro(ordenadas),
    );
  }

  /**
   * O nome leva o PERIODO dos dados, nao a data em que foi gerado.
   *
   * O nome anterior era `recibos-verdes-<hoje>.csv`. Num ficheiro cujos dados
   * iam de agosto de 2025 a agosto de 2026, isso nao dizia nada: quem o abrisse
   * seis meses depois nao sabia o que continha, e dois ficheiros gerados no
   * mesmo dia com filtros diferentes eram indistinguiveis.
   *
   * As datas saem das linhas exportadas — ja ordenadas, portanto a primeira e a
   * ultima sao os extremos do periodo.
   */
  function nomeDoFicheiro(ordenadas: ApiWithdrawal[]): string {
    const iso = (v: string) => new Date(v).toISOString().slice(0, 10);
    const de = iso(ordenadas[0].requestedAt);
    const ate = iso(ordenadas[ordenadas.length - 1].requestedAt);

    const base = de === ate ? `recibos-verdes-${de}` : `recibos-verdes-${de}-a-${ate}`;

    // A sociedade filtrada entra no nome: quem exporta por entidade acaba com
    // varios ficheiros do mesmo periodo na pasta.
    const soc = lista.filters.sociedade;
    if (soc === UNCLASSIFIED) return `${base}-por-classificar.csv`;
    if (soc !== ALL) {
      const nome = companiesQ.data?.companies.find((c) => c.id === soc)?.name;
      if (nome) {
        const limpo = nome.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return `${base}-${limpo}.csv`;
      }
    }
    return `${base}.csv`;
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
          <>
            {/* Excel primeiro: e o que se abre para ler. O CSV fica ao lado
                para quem tenha uma importacao que o consome. */}
            <Button className="w-full sm:w-auto" onClick={exportarExcel} disabled={exporting}>
              {exporting
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                : <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />}
              Exportar Excel
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              CSV
            </Button>
          </>
        }
      />

      <CompaniesCard onSelect={(v) => lista.setFilter('sociedade', v)} />

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
            {/* Pesquisa em vez do menu com os 2000 motoristas. */}
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="Procurar por nome ou email…"
                className="pl-9"
                value={lista.searchInput}
                onChange={(e) => lista.setSearchInput(e.target.value)}
                aria-label="Procurar recibos por motorista"
              />
            </div>

            <Select
              value={lista.filters.sociedade}
              onValueChange={(v) => lista.setFilter('sociedade', v)}
            >
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as sociedades (nesta página)</SelectItem>
                <SelectItem value={UNCLASSIFIED}>Por classificar</SelectItem>
                {(companiesQ.data?.companies ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          {pageInfo && pageInfo.totalPages > 1 && (
            <Pagination
              info={pageInfo} onChange={lista.setPage}
              busy={withdrawalsQ.isFetching} compact
            />
          )}

          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum recibo corresponde a estes filtros.
            </p>
          ) : (
            <>
            {/* O total do que esta em baixo. Confronta-se com o numero do
                cartao quando o filtro e uma sociedade so. */}
            <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
              <span className="text-xs text-muted-foreground">
                {rows.length} recibo{rows.length === 1 ? '' : 's'}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatCurrency(filteredTotal)}
              </span>
            </div>
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
            </>
          )}

          {pageInfo && (
            <Pagination
              info={pageInfo} onChange={lista.setPage} busy={withdrawalsQ.isFetching}
            />
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
